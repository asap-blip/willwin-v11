'use client'

import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDateHeading } from '@/lib/calendar-helpers'

interface TopBarProps {
  currentDate: string // YYYY-MM-DD
  onPrev: () => void
  onNext: () => void
  onToday: () => void
}

export function TopBar({ currentDate, onPrev, onNext, onToday }: TopBarProps) {
  return (
    <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-white">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onPrev}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={onNext}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={onToday}>
          Today
        </Button>
        <h1 className="text-lg font-semibold ml-2">
          {formatDateHeading(currentDate)}
        </h1>
      </div>
      <Button disabled className="gap-2">
        <Plus className="h-4 w-4" />
        New Booking
      </Button>
    </div>
  )
}
