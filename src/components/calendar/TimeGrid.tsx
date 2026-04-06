'use client'

import { useEffect, useState } from 'react'
import type { TeamMember, CalendarBooking } from '@/lib/types'
import {
  TIME_SLOTS,
  SLOT_HEIGHT,
  formatTimeLabel,
  extractTime,
  timeToOffset,
  getCurrentTimeOffset,
} from '@/lib/calendar-helpers'
import { BookingCard } from './BookingCard'

interface TimeGridProps {
  teamMembers: TeamMember[]
  bookings: CalendarBooking[]
}

export function TimeGrid({ teamMembers, bookings }: TimeGridProps) {
  const [timeLineOffset, setTimeLineOffset] = useState<number | null>(getCurrentTimeOffset())

  // Update current time indicator every 60s
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLineOffset(getCurrentTimeOffset())
    }, 60_000)
    return () => clearInterval(interval)
  }, [])

  const totalHeight = TIME_SLOTS.length * SLOT_HEIGHT
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
          <div className="h-14 border-b border-border" />
          {/* Time labels */}
          <div className="relative" style={{ height: totalHeight }}>
            {TIME_SLOTS.map((slot, i) => (
              <div
                key={slot}
                className="absolute right-3 text-[11px] text-muted-foreground -translate-y-1/2"
                style={{ top: i * SLOT_HEIGHT }}
              >
                {formatTimeLabel(slot)}
              </div>
            ))}
          </div>
        </div>

        {/* Tech columns */}
        {teamMembers.map((tm) => (
          <div key={tm.id} className="flex-1 min-w-[180px] border-l border-border">
            {/* Tech header */}
            <div className="sticky top-0 z-10 h-14 flex items-center gap-2 px-3 border-b border-border bg-white">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: tm.color }}
              />
              <span className="text-sm font-medium truncate">{tm.name}</span>
            </div>

            {/* Slots + bookings */}
            <div className="relative" style={{ height: totalHeight }}>
              {/* Slot rows */}
              {TIME_SLOTS.map((slot, i) => (
                <div
                  key={slot}
                  className="absolute inset-x-0 border-b border-border/50 hover:bg-muted/30 cursor-pointer"
                  style={{ top: i * SLOT_HEIGHT, height: SLOT_HEIGHT }}
                  onClick={() => console.log('empty slot clicked')}
                />
              ))}

              {/* Booking cards */}
              {(bookingsByMember[tm.id] ?? []).map((booking) => {
                const time = extractTime(booking.start_at)
                const top = timeToOffset(time)
                return (
                  <div key={booking.id} className="absolute inset-x-0" style={{ top }}>
                    <BookingCard booking={booking} />
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
        ))}
      </div>
    </div>
  )
}
