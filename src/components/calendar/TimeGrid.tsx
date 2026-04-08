'use client'

import { useEffect, useState, useMemo } from 'react'
import type { TeamMember, CalendarBooking, BusinessHours } from '@/lib/types'
import {
  SLOT_HEIGHT,
  formatTimeLabel,
  extractTime,
  generateTimeSlots,
  timeToOffsetFrom,
  getCurrentTimeOffsetFrom,
  durationToHeight,
} from '@/lib/calendar-helpers'
import { BookingCard } from './BookingCard'

// Height of the sticky header row (h-14 in Tailwind = 3.5rem = 56px).
// Subtracted from the drop Y coordinate to get "pixels into the grid".
const HEADER_HEIGHT = 56

interface DragState {
  bookingId: string
  fromMemberId: string
  durationMin: number
}

interface HoverTarget {
  memberId: string
  time: string
}

interface TimeGridProps {
  teamMembers: TeamMember[]
  techAvailabilityForDay: Record<string, boolean>
  bookings: CalendarBooking[]
  hours: BusinessHours
  loyaltyEnabled: boolean
  onSlotClick: (teamMemberId: string, time: string) => void
  onBookingClick: (bookingId: string) => void
  onMoveAttempt?: (bookingId: string, toMemberId: string, toTime: string) => void
  dragError?: string | null
}

export function TimeGrid({
  teamMembers,
  techAvailabilityForDay,
  bookings,
  hours,
  loyaltyEnabled,
  onSlotClick,
  onBookingClick,
  onMoveAttempt,
  dragError,
}: TimeGridProps) {
  const slots = useMemo(
    () => generateTimeSlots(hours.open_time, hours.close_time),
    [hours.open_time, hours.close_time],
  )

  // T-FEAT-05 — desktop-only drag gate. Touch devices don't match
  // `(pointer: fine)`, so draggable stays false on phones/tablets and
  // HTML5 DnD never activates.
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    setIsDesktop(window.matchMedia('(pointer: fine)').matches)
  }, [])

  const [dragState, setDragState] = useState<DragState | null>(null)
  const [hoverTarget, setHoverTarget] = useState<HoverTarget | null>(null)

  const [timeLineOffset, setTimeLineOffset] = useState<number | null>(
    getCurrentTimeOffsetFrom(hours.open_time, hours.close_time),
  )

  // Update current time indicator every 60s
  useEffect(() => {
    setTimeLineOffset(getCurrentTimeOffsetFrom(hours.open_time, hours.close_time))
    const interval = setInterval(() => {
      setTimeLineOffset(getCurrentTimeOffsetFrom(hours.open_time, hours.close_time))
    }, 60_000)
    return () => clearInterval(interval)
  }, [hours.open_time, hours.close_time])

  // Closed-day short circuit
  if (!hours.is_open) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <div className="text-center">
          <p className="text-lg font-semibold text-muted-foreground">Closed</p>
          <p className="text-sm text-muted-foreground mt-1">The salon is closed on this day.</p>
        </div>
      </div>
    )
  }

  // Drop the trailing close-time slot when computing grid height — it is a label only.
  const slotRowCount = Math.max(0, slots.length - 1)
  const totalHeight = slotRowCount * SLOT_HEIGHT
  const timeColWidth = 72 // px

  // ─── T-FEAT-05 drag handlers ────────────────────────────────────────────
  // Booking wrapper onDragStart — records which booking is moving and
  // suppresses the native drag image so we can render our own ghost.
  function handleBookingDragStart(e: React.DragEvent, booking: CalendarBooking) {
    if (!isDesktop || !onMoveAttempt) {
      e.preventDefault()
      return
    }
    e.dataTransfer.effectAllowed = 'move'
    // Use a 1x1 transparent gif as the drag image so the browser stops
    // painting a copy of the source card under the cursor.
    const img = new window.Image()
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
    try {
      e.dataTransfer.setDragImage(img, 0, 0)
    } catch {
      // Safari can throw on cross-origin data URIs — fall back to default.
    }
    setDragState({
      bookingId: booking.id,
      fromMemberId: booking.team_member_id,
      durationMin: booking.duration_minutes,
    })
  }
  function handleBookingDragEnd() {
    setDragState(null)
    setHoverTarget(null)
  }

  // Column onDragOver — compute which slot the cursor is hovering by
  // subtracting the sticky header height from the clientY delta and
  // snapping to the 30-min grid.
  function handleColumnDragOver(e: React.DragEvent, memberId: string) {
    if (!dragState || !onMoveAttempt) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'

    const rect = e.currentTarget.getBoundingClientRect()
    const yInGrid = e.clientY - rect.top - HEADER_HEIGHT
    if (yInGrid < 0) return
    const rawIdx = Math.floor(yInGrid / SLOT_HEIGHT)
    // Clamp to [0, slotRowCount - 1] — slotRowCount-1 is the last valid
    // start slot (last element is the close_time label).
    const clamped = Math.max(0, Math.min(slotRowCount - 1, rawIdx))
    const time = slots[clamped]
    if (!time) return
    if (hoverTarget?.memberId !== memberId || hoverTarget?.time !== time) {
      setHoverTarget({ memberId, time })
    }
  }
  function handleColumnDragLeave(e: React.DragEvent) {
    // Only clear the hover when the cursor leaves the column rect entirely,
    // not when crossing over a child element.
    const rect = e.currentTarget.getBoundingClientRect()
    if (
      e.clientX < rect.left ||
      e.clientX >= rect.right ||
      e.clientY < rect.top ||
      e.clientY >= rect.bottom
    ) {
      setHoverTarget(null)
    }
  }
  function handleColumnDrop(e: React.DragEvent, memberId: string) {
    if (!dragState || !onMoveAttempt) return
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const yInGrid = e.clientY - rect.top - HEADER_HEIGHT
    const rawIdx = Math.floor(yInGrid / SLOT_HEIGHT)
    const clamped = Math.max(0, Math.min(slotRowCount - 1, rawIdx))
    const time = slots[clamped]
    const bookingId = dragState.bookingId
    setDragState(null)
    setHoverTarget(null)
    if (time) onMoveAttempt(bookingId, memberId, time)
  }

  // Group bookings by team_member_id
  const bookingsByMember: Record<string, CalendarBooking[]> = {}
  for (const b of bookings) {
    if (!bookingsByMember[b.team_member_id]) {
      bookingsByMember[b.team_member_id] = []
    }
    bookingsByMember[b.team_member_id].push(b)
  }

  return (
    <div className="flex-1 overflow-auto relative">
      {dragError && (
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-md border shadow-sm text-sm font-medium"
          style={{
            backgroundColor: '#fef2f2',
            borderColor: '#fecaca',
            color: '#991b1b',
          }}
          role="alert"
        >
          {dragError}
        </div>
      )}
      <div className="flex min-w-fit">
        {/* Time labels column — sticky left */}
        <div className="sticky left-0 z-20 bg-white" style={{ width: timeColWidth }}>
          {/* Header spacer */}
          <div className="h-14 border-b" style={{ backgroundColor: 'var(--rs-primary-subtle)', borderColor: 'var(--rs-primary-border)' }} />
          {/* Time labels */}
          <div className="relative" style={{ height: totalHeight }}>
            {slots.map((slot) => (
              <div
                key={slot}
                className="absolute right-3 text-[11px] text-muted-foreground -translate-y-1/2"
                style={{ top: timeToOffsetFrom(slot, hours.open_time) }}
              >
                {formatTimeLabel(slot)}
              </div>
            ))}
          </div>
        </div>

        {/* Tech columns */}
        {teamMembers.length === 0 ? (
          <div className="flex-1 flex items-center justify-center min-h-[200px] px-6">
            <p className="text-sm text-muted-foreground">No techs scheduled to work today.</p>
          </div>
        ) : (
          teamMembers.map((tm) => {
            const available = techAvailabilityForDay[tm.id] ?? false
            return (
            <div
              key={tm.id}
              className={`flex-1 min-w-[180px] border-l border-border ${available ? '' : 'bg-muted/40'}`}
              onDragOver={available ? (e) => handleColumnDragOver(e, tm.id) : undefined}
              onDragLeave={available ? handleColumnDragLeave : undefined}
              onDrop={available ? (e) => handleColumnDrop(e, tm.id) : undefined}
            >
              {/* Tech header — grayed out when the tech is off this day of week */}
              <div
                className={`sticky top-0 z-10 h-14 flex items-center gap-2 px-3 border-b ${available ? '' : 'opacity-50'}`}
                style={{ backgroundColor: 'var(--rs-primary-subtle)', borderColor: 'var(--rs-primary-border)' }}
                title={available ? undefined : 'Off today'}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: tm.color }}
                />
                <span className="text-sm font-medium truncate" style={{ color: 'var(--rs-text-primary)' }}>{tm.name}</span>
                {!available && (
                  <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">Off</span>
                )}
              </div>

              {/* Slots + bookings */}
              <div className="relative" style={{ height: totalHeight }}>
                {/* Slot rows — only the rows that fit inside open hours (drop trailing close label) */}
                {slots.slice(0, slotRowCount).map((slot) => (
                  <div
                    key={slot}
                    className={`absolute inset-x-0 border-b border-border/50 ${
                      available ? 'hover:bg-muted/30 cursor-pointer' : 'cursor-not-allowed'
                    }`}
                    style={{ top: timeToOffsetFrom(slot, hours.open_time), height: SLOT_HEIGHT }}
                    onClick={available ? () => onSlotClick(tm.id, slot) : undefined}
                  />
                ))}

                {/* Booking cards */}
                {(bookingsByMember[tm.id] ?? []).map((booking) => {
                  const time = extractTime(booking.start_at)
                  const top = timeToOffsetFrom(time, hours.open_time)
                  const isDraggingThis = dragState?.bookingId === booking.id
                  return (
                    <div
                      key={booking.id}
                      className="absolute inset-x-0"
                      style={{
                        top,
                        opacity: isDraggingThis ? 0.35 : 1,
                      }}
                      draggable={isDesktop && !!onMoveAttempt}
                      onDragStart={(e) => handleBookingDragStart(e, booking)}
                      onDragEnd={handleBookingDragEnd}
                    >
                      <BookingCard
                        booking={booking}
                        loyaltyEnabled={loyaltyEnabled}
                        onEdit={onBookingClick}
                      />
                    </div>
                  )
                })}

                {/* T-FEAT-05 — drop ghost overlay showing the would-be
                    position of the dragged card in this tech column. */}
                {dragState && hoverTarget && hoverTarget.memberId === tm.id && (
                  <div
                    className="absolute inset-x-1 rounded-md pointer-events-none border-2 border-dashed"
                    style={{
                      top: timeToOffsetFrom(hoverTarget.time, hours.open_time),
                      height: durationToHeight(dragState.durationMin),
                      borderColor: 'var(--rs-primary)',
                      backgroundColor: 'var(--rs-primary-subtle)',
                      opacity: 0.9,
                    }}
                  />
                )}

                {/* Current time indicator */}
                {timeLineOffset !== null && (
                  <div
                    className="absolute inset-x-0 z-10 pointer-events-none"
                    style={{ top: timeLineOffset }}
                  >
                    <div className="h-0.5 bg-red-500 w-full" />
                  </div>
                )}
              </div>
            </div>
            )
          })
        )}
      </div>
    </div>
  )
}
