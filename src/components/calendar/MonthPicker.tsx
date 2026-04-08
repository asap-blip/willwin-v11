'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { getTodayString } from '@/lib/calendar-helpers'

interface MonthPickerProps {
  // YYYY-MM-DD currently selected on the calendar
  selectedDate: string
  // Called with a YYYY-MM-DD when the user picks a day
  onSelect: (date: string) => void
  // Called when the user dismisses the popover (outside click / escape)
  onClose: () => void
}

const MONTHS_FR_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

// Day-of-week labels in Mon → Sun order to match the rest of the app.
const DOW_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

// Format a Date object as YYYY-MM-DD using locale-free getters.
function dateToYmd(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// Build a 6×7 grid of YYYY-MM-DD strings for the given (year, monthIndex0).
// JS Date is used ONLY to walk day numbers — never to render text.
function buildMonthGrid(year: number, month: number): { ymd: string; inMonth: boolean }[] {
  // First day of the month
  const first = new Date(year, month, 1)
  // getDay(): 0 = Sun … 6 = Sat. We want Monday-first, so shift.
  const jsDow = first.getDay()
  const mondayOffset = (jsDow + 6) % 7 // 0 = Mon … 6 = Sun

  // Start of grid = first day - mondayOffset
  const start = new Date(year, month, 1 - mondayOffset)

  const cells: { ymd: string; inMonth: boolean }[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    cells.push({
      ymd: dateToYmd(d),
      inMonth: d.getMonth() === month,
    })
  }
  return cells
}

export function MonthPicker({ selectedDate, onSelect, onClose }: MonthPickerProps) {
  // Initial month/year derived from the currently-selected date — STRING SLICE,
  // not new Date(selectedDate) which would mis-parse depending on TZ.
  const [year, setYear] = useState<number>(() => parseInt(selectedDate.slice(0, 4), 10))
  const [month, setMonth] = useState<number>(
    () => parseInt(selectedDate.slice(5, 7), 10) - 1,
  )

  const today = useMemo(getTodayString, [])

  // Outside click + escape to close
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    // Defer the listener so the same click that opened the picker
    // doesn't immediately close it.
    const id = window.setTimeout(() => {
      document.addEventListener('mousedown', handleClick)
      document.addEventListener('keydown', handleKey)
    }, 0)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  const cells = useMemo(() => buildMonthGrid(year, month), [year, month])

  function shiftMonth(delta: number) {
    let m = month + delta
    let y = year
    while (m < 0) {
      m += 12
      y -= 1
    }
    while (m > 11) {
      m -= 12
      y += 1
    }
    setMonth(m)
    setYear(y)
  }

  return (
    <div
      ref={containerRef}
      className="absolute z-50 mt-2 left-0 w-72 rounded-xl border bg-white shadow-lg p-3"
      style={{ borderColor: 'var(--rs-primary-border)' }}
      role="dialog"
      aria-label="Pick a date"
    >
      {/* Month nav */}
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-muted/50"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div
          className="text-sm font-semibold"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--rs-text-primary)' }}
        >
          {MONTHS_FR_EN[month]} {year}
        </div>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-muted/50"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DOW_LABELS.map((d, i) => (
          <div
            key={i}
            className="h-7 text-[11px] text-muted-foreground inline-flex items-center justify-center"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          const isToday = cell.ymd === today
          const isSelected = cell.ymd === selectedDate
          const dayNum = parseInt(cell.ymd.slice(8, 10), 10)
          return (
            <button
              key={cell.ymd}
              type="button"
              onClick={() => {
                onSelect(cell.ymd)
                onClose()
              }}
              className={[
                'h-9 w-full inline-flex items-center justify-center rounded-md text-sm transition',
                cell.inMonth ? '' : 'text-muted-foreground/50',
                isSelected
                  ? 'bg-primary text-primary-foreground font-semibold'
                  : 'hover:bg-muted/60',
                isToday && !isSelected ? 'ring-1 ring-primary/60' : '',
              ].join(' ')}
            >
              {dayNum}
            </button>
          )
        })}
      </div>
    </div>
  )
}
