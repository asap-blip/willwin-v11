'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
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

// T-FEAT-06 — long-press + movement thresholds used to distinguish
// a tap (opens booking detail) from a drag (reschedules).
const LONG_PRESS_MS = 200
const MOVE_THRESHOLD_PX = 5

interface DragState {
  bookingId: string
  fromMemberId: string
  durationMin: number
}

interface HoverTarget {
  memberId: string
  time: string
}

// Per-pointer tracking for an in-flight gesture. Stored in a ref so mid-
// gesture state doesn't trigger rerenders — only dragState / hoverTarget do.
interface PointerTrack {
  pointerId: number
  bookingId: string
  fromMemberId: string
  durationMin: number
  startX: number
  startY: number
  armTimerId: number | null
  active: boolean
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

  // T-FEAT-06 — pointer-event drag state. Pointer events cover mouse,
  // touch, and pen in a single code path, so there is no desktop-only
  // gate any more: the same handlers power iPad Safari and desktop Chrome.
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [hoverTarget, setHoverTarget] = useState<HoverTarget | null>(null)

  // Per-pointer gesture tracking + map of tech column DOM nodes (for
  // pointer-to-column hit testing, since pointer events are captured on
  // the booking wrapper and don't dispatch onto siblings while the
  // pointer is held).
  const pointerStateRef = useRef<PointerTrack | null>(null)
  const columnRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // Clean up any pending long-press timer on unmount
  useEffect(() => {
    return () => {
      const track = pointerStateRef.current
      if (track?.armTimerId !== null && track?.armTimerId !== undefined) {
        window.clearTimeout(track.armTimerId)
      }
    }
  }, [])

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

  // ─── T-FEAT-06 pointer-event drag handlers ──────────────────────────────
  // Pointer events unify mouse + touch + pen. The booking wrapper captures
  // the pointer on down so all subsequent moves flow to it regardless of
  // which element the pointer is physically over (crucial because booking
  // cards cover slot rows and absolute siblings don't receive pointer
  // events while another element holds the capture).

  // Hit-test: which tech column contains (clientX, clientY)?
  function findColumnAt(clientX: number, clientY: number): string | null {
    for (const [memberId, el] of columnRefs.current) {
      if (!el) continue
      const rect = el.getBoundingClientRect()
      if (
        clientX >= rect.left &&
        clientX < rect.right &&
        clientY >= rect.top &&
        clientY < rect.bottom
      ) {
        return memberId
      }
    }
    return null
  }

  // Pixel Y inside a column → 30-min slot label (e.g. "14:30"). Returns
  // null when the pointer is above the header or past the end of the grid.
  function computeSlotAt(columnEl: HTMLDivElement, clientY: number): string | null {
    const rect = columnEl.getBoundingClientRect()
    const yInGrid = clientY - rect.top - HEADER_HEIGHT
    if (yInGrid < 0) return null
    const rawIdx = Math.floor(yInGrid / SLOT_HEIGHT)
    const clamped = Math.max(0, Math.min(slotRowCount - 1, rawIdx))
    return slots[clamped] ?? null
  }

  // Flip the tracked gesture into an active drag. Cancels the arming
  // timer (if any) and publishes dragState so the ghost renders.
  function activateDrag(track: PointerTrack) {
    if (track.armTimerId !== null) {
      window.clearTimeout(track.armTimerId)
      track.armTimerId = null
    }
    track.active = true
    setDragState({
      bookingId: track.bookingId,
      fromMemberId: track.fromMemberId,
      durationMin: track.durationMin,
    })
  }

  function handleBookingPointerDown(
    e: React.PointerEvent<HTMLDivElement>,
    booking: CalendarBooking,
  ) {
    if (!onMoveAttempt) return
    // Primary button only for mouse — allow right-click / middle-click
    // to fall through to the browser as normal.
    if (e.pointerType === 'mouse' && e.button !== 0) return

    // Capture the pointer on the wrapper so pointermove/up keep firing
    // on this element even if the finger moves across other cards.
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* some browsers throw if the pointer isn't capturable yet */
    }

    const track: PointerTrack = {
      pointerId: e.pointerId,
      bookingId: booking.id,
      fromMemberId: booking.team_member_id,
      durationMin: booking.duration_minutes,
      startX: e.clientX,
      startY: e.clientY,
      armTimerId: null,
      active: false,
    }
    // Arm drag after the long-press threshold even if the pointer never
    // moves. Guarded on identity so a late timer from a stale gesture
    // never activates a new one.
    track.armTimerId = window.setTimeout(() => {
      if (pointerStateRef.current === track && !track.active) {
        activateDrag(track)
      }
    }, LONG_PRESS_MS)
    pointerStateRef.current = track
  }

  function handleBookingPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const track = pointerStateRef.current
    if (!track || track.pointerId !== e.pointerId) return

    if (!track.active) {
      // Pre-drag phase — promote to active drag as soon as the pointer
      // clears the movement threshold, even before the long-press timer.
      const dx = e.clientX - track.startX
      const dy = e.clientY - track.startY
      if (Math.hypot(dx, dy) > MOVE_THRESHOLD_PX) {
        activateDrag(track)
      } else {
        return
      }
    }

    // Drag is active — stop the browser from stealing the gesture for
    // text selection or scroll (paired with touch-action: none on the
    // wrapper so touch doesn't generate pointercancel).
    e.preventDefault()

    const memberId = findColumnAt(e.clientX, e.clientY)
    if (!memberId) {
      if (hoverTarget !== null) setHoverTarget(null)
      return
    }
    const columnEl = columnRefs.current.get(memberId)
    if (!columnEl) return
    const time = computeSlotAt(columnEl, e.clientY)
    if (!time) {
      if (hoverTarget !== null) setHoverTarget(null)
      return
    }
    if (hoverTarget?.memberId !== memberId || hoverTarget?.time !== time) {
      setHoverTarget({ memberId, time })
    }
  }

  function handleBookingPointerUp(
    e: React.PointerEvent<HTMLDivElement>,
    booking: CalendarBooking,
  ) {
    const track = pointerStateRef.current
    if (!track || track.pointerId !== e.pointerId) return

    if (track.armTimerId !== null) {
      window.clearTimeout(track.armTimerId)
      track.armTimerId = null
    }

    if (!track.active) {
      // Tap — no drag ever activated. Fall through to the normal edit
      // flow. dragState / hoverTarget are already null in this branch.
      pointerStateRef.current = null
      onBookingClick(booking.id)
      return
    }

    // Drag committed — recompute the final target from pointerup
    // coordinates (the last pointermove may have missed an edge update).
    const memberId = findColumnAt(e.clientX, e.clientY)
    let time: string | null = null
    if (memberId) {
      const columnEl = columnRefs.current.get(memberId)
      if (columnEl) time = computeSlotAt(columnEl, e.clientY)
    }

    const bookingId = track.bookingId
    pointerStateRef.current = null
    setDragState(null)
    setHoverTarget(null)

    if (memberId && time && onMoveAttempt) {
      // CalendarView handles snap-back on conflict / off-day / off-hours
      // via the dragError banner — no extra work here.
      onMoveAttempt(bookingId, memberId, time)
    }
  }

  function handleBookingPointerCancel(e: React.PointerEvent<HTMLDivElement>) {
    const track = pointerStateRef.current
    if (!track || track.pointerId !== e.pointerId) return
    if (track.armTimerId !== null) {
      window.clearTimeout(track.armTimerId)
      track.armTimerId = null
    }
    pointerStateRef.current = null
    setDragState(null)
    setHoverTarget(null)
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
              ref={(el) => {
                if (el) columnRefs.current.set(tm.id, el)
                else columnRefs.current.delete(tm.id)
              }}
              className={`flex-1 min-w-[180px] border-l border-border ${available ? '' : 'bg-muted/40'}`}
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

                {/* Booking cards — pointer events drive tap (opens detail)
                    vs drag (reschedules). touch-action: none stops iOS
                    Safari from converting vertical drags into scroll. */}
                {(bookingsByMember[tm.id] ?? []).map((booking) => {
                  const time = extractTime(booking.start_at)
                  const top = timeToOffsetFrom(time, hours.open_time)
                  const isDraggingThis = dragState?.bookingId === booking.id
                  return (
                    <div
                      key={booking.id}
                      className="absolute inset-x-0 cursor-pointer"
                      style={{
                        top,
                        opacity: isDraggingThis ? 0.35 : 1,
                        touchAction: 'none',
                      }}
                      onPointerDown={(e) => handleBookingPointerDown(e, booking)}
                      onPointerMove={handleBookingPointerMove}
                      onPointerUp={(e) => handleBookingPointerUp(e, booking)}
                      onPointerCancel={handleBookingPointerCancel}
                    >
                      <BookingCard booking={booking} loyaltyEnabled={loyaltyEnabled} />
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
