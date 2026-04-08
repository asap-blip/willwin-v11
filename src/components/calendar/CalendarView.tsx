'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { TeamMember, CalendarBooking, BusinessHours, TechAvailability } from '@/lib/types'
import {
  getTodayString,
  getDayOfWeek,
  isTechAvailable,
  normalizeStartAt,
  addMinutesToTimeString,
  formatTimeLabel,
} from '@/lib/calendar-helpers'
import { supabase } from '@/lib/supabase'
import { fetchBookingsForDate } from '@/lib/fetch-bookings'
import { TopBar } from './TopBar'
import { TimeGrid } from './TimeGrid'
import { NewBookingModal } from '@/components/booking/NewBookingModal'
import { BookingDetailModal } from '@/components/booking/BookingDetailModal'

const DAY_NAMES_FULL = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

interface PendingMove {
  bookingId: string
  toMemberId: string
  toTime: string
  clientName: string
  techName: string
  fromMemberId: string
}

interface CalendarViewProps {
  teamMembers: TeamMember[]
  businessHours: BusinessHours[]
  techAvailability: TechAvailability[]
  initialBookings: CalendarBooking[]
  initialDate: string
  loyaltyEnabled: boolean
  adminSignature: string | null
}

export function CalendarView({
  teamMembers,
  businessHours,
  techAvailability,
  initialBookings,
  initialDate,
  loyaltyEnabled,
  adminSignature,
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

  // T-FEAT-05 — drag-to-reschedule state
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null)
  const [dragError, setDragError] = useState<string | null>(null)
  const [moveSaving, setMoveSaving] = useState(false)

  // Auto-clear drag error after a few seconds
  useEffect(() => {
    if (!dragError) return
    const id = window.setTimeout(() => setDragError(null), 3500)
    return () => window.clearTimeout(id)
  }, [dragError])

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

  // ─── T-FEAT-05 drag-to-reschedule ──────────────────────────────────────
  // Validates a proposed drop and either opens the confirmation dialog or
  // sets an inline error so the TimeGrid snaps the card back.
  const handleMoveAttempt = useCallback(
    (bookingId: string, toMemberId: string, toTime: string) => {
      const booking = bookings.find((b) => b.id === bookingId)
      if (!booking) return

      const toDate = currentDate
      const toStartAt = `${toDate} ${toTime}`
      const toEndAt = addMinutesToTimeString(toStartAt, booking.duration_minutes)

      const dow = getDayOfWeek(toDate)
      const dayName = DAY_NAMES_FULL[dow]
      const techName = teamMembers.find((t) => t.id === toMemberId)?.name ?? 'Tech'

      // 1. Business hours — target slot + full duration must fit inside open window
      const hours = businessHours.find((h) => h.day_of_week === dow)
      if (!hours || !hours.is_open) {
        setDragError(`Salon is closed on ${dayName}`)
        return
      }
      const openAt = `${toDate} ${hours.open_time}`
      const closeAt = `${toDate} ${hours.close_time}`
      if (toStartAt < openAt || toEndAt > closeAt) {
        setDragError('Outside business hours')
        return
      }

      // 2. Tech availability on this day of week
      if (!isTechAvailable(techAvailability, toMemberId, dow)) {
        setDragError(`${techName} is not working on ${dayName}`)
        return
      }

      // 3. Conflict check against currently-loaded bookings (already filtered
      //    to non-cancelled by fetchBookingsForDate). The booking being moved
      //    is excluded so it cannot collide with itself.
      const conflict = bookings.some((b) => {
        if (b.id === bookingId) return false
        if (b.team_member_id !== toMemberId) return false
        const existingStart = normalizeStartAt(b.start_at)
        const existingEnd = addMinutesToTimeString(existingStart, b.duration_minutes)
        return existingStart < toEndAt && existingEnd > toStartAt
      })
      if (conflict) {
        setDragError(`${techName} is booked at that time`)
        return
      }

      // 4. No-op guard — same slot, same tech
      const currentStartAt = normalizeStartAt(booking.start_at)
      if (currentStartAt === toStartAt && booking.team_member_id === toMemberId) {
        return
      }

      // 5. Show confirmation dialog
      setPendingMove({
        bookingId,
        toMemberId,
        toTime,
        clientName: `${booking.customer_first_name} ${booking.customer_last_name}`,
        techName,
        fromMemberId: booking.team_member_id,
      })
    },
    [bookings, businessHours, techAvailability, teamMembers, currentDate],
  )

  // Commits the pending move to Supabase once the user confirms.
  async function handleConfirmMove() {
    if (!pendingMove) return
    setMoveSaving(true)
    const { bookingId, toMemberId, toTime, fromMemberId } = pendingMove

    // start_at is assembled as TEXT — space separated, no T, no seconds.
    const newStartAt = `${currentDate} ${toTime}`

    // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
    const { error: bErr } = await supabase
      .from('bookings')
      .update({ start_at: newStartAt })
      .eq('id', bookingId)
    if (bErr) {
      setMoveSaving(false)
      setPendingMove(null)
      setDragError('Move failed — please retry')
      return
    }

    if (toMemberId !== fromMemberId) {
      // Update all segments for this booking — the current model only ever
      // writes one segment per booking so this hits exactly one row.
      const { error: sErr } = await supabase
        .from('appointment_segments')
        .update({ team_member_id: toMemberId })
        .eq('booking_id', bookingId)
      if (sErr) {
        setMoveSaving(false)
        setPendingMove(null)
        setDragError('Move failed — please retry')
        return
      }
    }

    setPendingMove(null)
    setMoveSaving(false)
    await loadBookings(currentDate)
  }

  return (
    <div className="flex flex-col h-screen">
      <TopBar
        currentDate={currentDate}
        onPrev={() => setCurrentDate((d) => shiftDate(d, -1))}
        onNext={() => setCurrentDate((d) => shiftDate(d, 1))}
        onToday={() => setCurrentDate(getTodayString())}
        onPickDate={(d) => setCurrentDate(d)}
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
        onMoveAttempt={handleMoveAttempt}
        dragError={dragError}
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
        adminSignature={adminSignature}
      />

      {/* T-FEAT-05 — Move-to-reschedule confirmation dialog */}
      {pendingMove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !moveSaving && setPendingMove(null)}
          />
          <div className="relative z-10 bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-5">
            <h2
              className="text-lg font-semibold"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--rs-text-primary)' }}
            >
              Reschedule
            </h2>
            <p className="mt-2 text-sm" style={{ color: 'var(--rs-text-body)' }}>
              Move <span className="font-semibold">{pendingMove.clientName}</span> to{' '}
              <span className="font-semibold">{formatTimeLabel(pendingMove.toTime)}</span> with{' '}
              <span className="font-semibold">{pendingMove.techName}</span>?
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingMove(null)}
                disabled={moveSaving}
                className="px-4 py-2 rounded-md border border-border text-sm font-medium bg-white disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmMove}
                disabled={moveSaving}
                className="px-4 py-2 rounded-md text-sm font-semibold text-primary-foreground disabled:opacity-50"
                style={{ backgroundColor: 'var(--rs-primary)' }}
              >
                {moveSaving ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
