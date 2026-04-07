'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { TeamMember, CalendarBooking, BusinessHours } from '@/lib/types'
import { getTodayString, getDayOfWeek, techWorksOnDay } from '@/lib/calendar-helpers'
import { fetchBookingsForDate } from '@/lib/fetch-bookings'
import { TopBar } from './TopBar'
import { TimeGrid } from './TimeGrid'
import { NewBookingModal } from '@/components/booking/NewBookingModal'
import { BookingDetailModal } from '@/components/booking/BookingDetailModal'

interface CalendarViewProps {
  teamMembers: TeamMember[]
  businessHours: BusinessHours[]
  initialBookings: CalendarBooking[]
  initialDate: string
  loyaltyEnabled: boolean
}

export function CalendarView({
  teamMembers,
  businessHours,
  initialBookings,
  initialDate,
  loyaltyEnabled,
}: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(initialDate)
  const [bookings, setBookings] = useState<CalendarBooking[]>(initialBookings)

  // New booking modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [slotTeamMemberId, setSlotTeamMemberId] = useState('')
  const [slotTime, setSlotTime] = useState('09:00')

  // Edit booking modal state
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editBookingId, setEditBookingId] = useState<string | null>(null)

  // Date navigation — string-only math
  function shiftDate(dateStr: string, days: number): string {
    const y = parseInt(dateStr.slice(0, 4), 10)
    const m = parseInt(dateStr.slice(5, 7), 10) - 1
    const d = parseInt(dateStr.slice(8, 10), 10)
    const dt = new Date(y, m, d + days)
    const ny = dt.getFullYear()
    const nm = String(dt.getMonth() + 1).padStart(2, '0')
    const nd = String(dt.getDate()).padStart(2, '0')
    return `${ny}-${nm}-${nd}`
  }

  const isInitialMount = useRef(true)

  const loadBookings = useCallback(async (date: string) => {
    const data = await fetchBookingsForDate(date)
    setBookings(data)
  }, [])

  // Re-fetch when date changes — skip initial mount (already have server data)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    loadBookings(currentDate)
  }, [currentDate, loadBookings])

  // Day-of-week derived from current date — getDayOfWeek is the only Date() use here
  const dayOfWeek = useMemo(() => getDayOfWeek(currentDate), [currentDate])

  // Hours for the current day; falls back to a closed-default if the row is missing
  const hoursForDay = useMemo<BusinessHours>(() => {
    const found = businessHours.find((h) => h.day_of_week === dayOfWeek)
    return (
      found ?? {
        id: '',
        day_of_week: dayOfWeek,
        is_open: false,
        open_time: '09:00',
        close_time: '20:00',
      }
    )
  }, [businessHours, dayOfWeek])

  // Techs that work on the current day of week
  const techsForDay = useMemo(
    () => teamMembers.filter((tm) => techWorksOnDay(tm.working_days, dayOfWeek)),
    [teamMembers, dayOfWeek],
  )

  function openModal(teamMemberId: string, time: string) {
    setSlotTeamMemberId(teamMemberId)
    setSlotTime(time)
    setModalOpen(true)
  }

  function handleNewBookingButton() {
    // Default to first tech working today and the open time when launched from TopBar
    openModal(techsForDay[0]?.id ?? teamMembers[0]?.id ?? '', hoursForDay.open_time)
  }

  function handleBookingClick(bookingId: string) {
    setEditBookingId(bookingId)
    setEditModalOpen(true)
  }

  return (
    <div className="flex flex-col h-screen">
      <TopBar
        currentDate={currentDate}
        onPrev={() => setCurrentDate((d) => shiftDate(d, -1))}
        onNext={() => setCurrentDate((d) => shiftDate(d, 1))}
        onToday={() => setCurrentDate(getTodayString())}
        onNewBooking={handleNewBookingButton}
      />
      <TimeGrid
        teamMembers={techsForDay}
        bookings={bookings}
        hours={hoursForDay}
        loyaltyEnabled={loyaltyEnabled}
        onSlotClick={openModal}
        onBookingClick={handleBookingClick}
      />
      <NewBookingModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => loadBookings(currentDate)}
        teamMembers={teamMembers}
        businessHours={businessHours}
        prefilledTeamMemberId={slotTeamMemberId}
        prefilledDate={currentDate}
        prefilledTime={slotTime}
      />
      <BookingDetailModal
        open={editModalOpen}
        bookingId={editBookingId}
        onClose={() => setEditModalOpen(false)}
        onSaved={() => loadBookings(currentDate)}
        teamMembers={teamMembers}
        businessHours={businessHours}
        loyaltyEnabled={loyaltyEnabled}
      />
    </div>
  )
}
