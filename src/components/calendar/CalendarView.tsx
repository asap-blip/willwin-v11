'use client'

import { useState } from 'react'
import type { TeamMember, CalendarBooking } from '@/lib/types'
import { getTodayString } from '@/lib/calendar-helpers'
import { TopBar } from './TopBar'
import { TimeGrid } from './TimeGrid'

interface CalendarViewProps {
  teamMembers: TeamMember[]
  bookings: CalendarBooking[]
  initialDate: string
}

export function CalendarView({ teamMembers, bookings, initialDate }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(initialDate)

  // Date navigation helpers — string-only math
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

  // Filter bookings to current date — slice start_at as string
  const filtered = bookings.filter((b) => b.start_at.slice(0, 10) === currentDate)

  return (
    <div className="flex flex-col h-screen">
      <TopBar
        currentDate={currentDate}
        onPrev={() => setCurrentDate((d) => shiftDate(d, -1))}
        onNext={() => setCurrentDate((d) => shiftDate(d, 1))}
        onToday={() => setCurrentDate(getTodayString())}
      />
      <TimeGrid teamMembers={teamMembers} bookings={filtered} />
    </div>
  )
}
