'use client'

import type { CalendarBooking } from '@/lib/types'
import { durationToHeight } from '@/lib/calendar-helpers'

const STATUS_STYLES: Record<string, string> = {
  CONFIRMED: 'bg-green-100 text-green-800',
  ARRIVED: 'bg-blue-100 text-blue-800',
  LATE: 'bg-amber-100 text-amber-800',
  'NO SHOW': 'bg-red-100 text-red-800',
}

interface BookingCardProps {
  booking: CalendarBooking
  onEdit: (bookingId: string) => void
}

export function BookingCard({ booking, onEdit }: BookingCardProps) {
  const height = durationToHeight(booking.duration_minutes)
  const statusClass = STATUS_STYLES[booking.status] ?? 'bg-gray-100 text-gray-800'

  // Derive a lighter background from the tech color for the card
  const bgColor = booking.team_member_color + '20' // 20 = ~12% opacity hex
  const borderColor = booking.team_member_color

  return (
    <div
      className="absolute inset-x-1 rounded-md px-2 py-1.5 overflow-hidden cursor-pointer border-l-[3px] transition-shadow hover:shadow-md"
      style={{
        height: `${height}px`,
        backgroundColor: bgColor,
        borderLeftColor: borderColor,
      }}
      onClick={(e) => {
        e.stopPropagation()
        onEdit(booking.id)
      }}
    >
      <p className="text-xs font-semibold truncate leading-tight text-gray-900">
        {booking.customer_first_name} {booking.customer_last_name}
      </p>
      <p className="text-[11px] text-gray-600 truncate leading-tight">
        {booking.service_name}
      </p>
      <div className="flex items-center gap-1.5 mt-0.5">
        <span className="text-[11px] font-medium text-gray-700">
          ${booking.service_price}
        </span>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${statusClass}`}>
          {booking.status}
        </span>
        {booking.notes && (
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-500 flex-shrink-0" title="Has notes" />
        )}
      </div>
    </div>
  )
}
