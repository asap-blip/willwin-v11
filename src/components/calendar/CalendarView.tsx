'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { TeamMember, CalendarBooking, BusinessHours, TechAvailability } from '@/lib/types'
import { getTodayString, getDayOfWeek, isTechAvailable } from '@/lib/calendar-helpers'
import { fetchBookingsForDate } from '@/lib/fetch-bookings'
import { TopBar } from './TopBar'
import { TimeGrid } from './TimeGrid'
import { NewBookingModal } from '@/components/booking/NewBookingModal'
import { BookingDetailModal } from '@/components/booking/BookingDetailModal'

interface CalendarViewProps {
  teamMembers: TeamMember[]
  businessHours: BusinessHours[]
  techAvailability: TechAvailability[]
  initialBookings: CalendarBooking[]
  initialDate: string
  loyaltyEnabled: boolean
}

export function CalendarView({
  teamMembers,
  businessHours,
  techAvailability,
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

  // Bug 2 — refresh bookings when window regains focus so the grid is
  // current after navigating to a client profile and back.
  useEffect(() => {
    const handleFocus = () => loadBookings(currentDate)
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
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

  // Per-tech availability flags for the current day of week. Techs are NOT
  // filtered out — the grid keeps their column visible but grays it out and
  // disables slot clicks via TimeGrid (T12 spec).
  const techAvailabilityForDay = useMemo(() => {
    const map: Record<string, boolean> = {}
    for (const tm of teamMembers) {
      map[tm.id] = isTechAvailable(techAvailability, tm.id, dayOfWeek)
    }
    return map
  }, [teamMembers, techAvailability, dayOfWeek])

  // First tech that is actually available today, for the New Booking button default
  const firstAvailableTech = useMemo(
    () => teamMembers.find((tm) => techAvailabilityForDay[tm.id]),
    [teamMembers, techAvailabilityForDay],
  )

  function openModal(teamMemberId: string, time: string) {
    setSlotTeamMemberId(teamMemberId)
    setSlotTime(time)
    setModalOpen(true)
  }

  function handleNewBookingButton() {
    // Default to first available tech today and the open time when launched from TopBar
    openModal(firstAvailableTech?.id ?? teamMembers[0]?.id ?? '', hoursForDay.open_time)
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
        teamMembers={teamMembers}
        techAvailabilityForDay={techAvailabilityForDay}
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
        techAvailability={techAvailability}
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
        techAvailability={techAvailability}
        loyaltyEnabled={loyaltyEnabled}
      />
    </div>
  )
}
