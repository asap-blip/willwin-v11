'use client'

import { useState, useEffect, useCallback } from 'react'
import type { TeamMember, CalendarBooking } from '@/lib/types'
import { getTodayString } from '@/lib/calendar-helpers'
import { fetchBookingsForDate } from '@/lib/fetch-bookings'
import { TopBar } from './TopBar'
import { TimeGrid } from './TimeGrid'
import { NewBookingModal } from '@/components/booking/NewBookingModal'
import { BookingDetailModal } from '@/components/booking/BookingDetailModal'

interface CalendarViewProps {
  teamMembers: TeamMember[]
  initialBookings: CalendarBooking[]
  initialDate: string
}

export function CalendarView({ teamMembers, initialBookings, initialDate }: CalendarViewProps) {
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

  const loadBookings = useCallback(async (date: string) => {
    const data = await fetchBookingsForDate(date)
    setBookings(data)
  }, [])

  // Re-fetch when date changes via navigation only
  useEffect(() => {
    if (currentDate !== initialDate) {
      loadBookings(currentDate)
    }
  }, [currentDate, initialDate, loadBookings])

  function openModal(teamMemberId: string, time: string) {
    setSlotTeamMemberId(teamMemberId)
    setSlotTime(time)
    setModalOpen(true)
  }

  function handleNewBookingButton() {
    // Default to first team member and 09:00 when opened from TopBar
    openModal(teamMembers[0]?.id ?? '', '09:00')
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
        bookings={bookings}
        onSlotClick={openModal}
        onBookingClick={handleBookingClick}
      />
      <NewBookingModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => loadBookings(currentDate)}
        teamMembers={teamMembers}
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
      />
    </div>
  )
}
