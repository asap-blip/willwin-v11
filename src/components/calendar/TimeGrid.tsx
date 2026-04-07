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
} from '@/lib/calendar-helpers'
import { BookingCard } from './BookingCard'

interface TimeGridProps {
  teamMembers: TeamMember[]
  techAvailabilityForDay: Record<string, boolean>
  bookings: CalendarBooking[]
  hours: BusinessHours
  loyaltyEnabled: boolean
  onSlotClick: (teamMemberId: string, time: string) => void
  onBookingClick: (bookingId: string) => void
}

export function TimeGrid({
  teamMembers,
  techAvailabilityForDay,
  bookings,
  hours,
  loyaltyEnabled,
  onSlotClick,
  onBookingClick,
}: TimeGridProps) {
  const slots = useMemo(
    () => generateTimeSlots(hours.open_time, hours.close_time),
    [hours.open_time, hours.close_time],
  )

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

  // Group bookings by team_member_id
  const bookingsByMember: Record<string, CalendarBooking[]> = {}
  for (const b of bookings) {
    if (!bookingsByMember[b.team_member_id]) {
      bookingsByMember[b.team_member_id] = []
    }
    bookingsByMember[b.team_member_id].push(b)
  }

  return (
    <div className="flex-1 overflow-auto">
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
                  return (
                    <div key={booking.id} className="absolute inset-x-0" style={{ top }}>
                      <BookingCard
                        booking={booking}
                        loyaltyEnabled={loyaltyEnabled}
                        onEdit={onBookingClick}
                      />
                    </div>
                  )
                })}

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
