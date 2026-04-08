'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect } from 'react'

// T17 — Date range picker for /reports.
//
// Presets emit YYYY-MM-DD strings and push them into the URL; the server
// component re-renders with fresh data. JS Date is used only to walk
// calendar boundaries — start_at string slicing is what powers the
// actual row filtering downstream.

type PresetKey = 'today' | 'this_week' | 'this_month' | 'last_month' | 'last_3_months'

interface Props {
  start: string
  end: string
}

function dateToYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function computePreset(key: PresetKey): { start: string; end: string } {
  const now = new Date()
  const today = dateToYmd(now)
  if (key === 'today') return { start: today, end: today }
  if (key === 'this_week') {
    // Monday-first work week. getDay(): 0 Sun … 6 Sat
    const jsDow = now.getDay()
    const mondayOffset = (jsDow + 6) % 7
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset)
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6)
    return { start: dateToYmd(monday), end: dateToYmd(sunday) }
  }
  if (key === 'this_month') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1)
    // new Date(y, m+1, 0) = last day of month m
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return { start: dateToYmd(first), end: dateToYmd(last) }
  }
  if (key === 'last_month') {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const last = new Date(now.getFullYear(), now.getMonth(), 0)
    return { start: dateToYmd(first), end: dateToYmd(last) }
  }
  // last_3_months — trailing 3-month window ending today
  const back = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())
  return { start: dateToYmd(back), end: today }
}

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'this_week', label: 'This Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'last_3_months', label: 'Last 3 Months' },
]

export function DateRangeSelector({ start, end }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [customStart, setCustomStart] = useState(start)
  const [customEnd, setCustomEnd] = useState(end)

  useEffect(() => {
    setCustomStart(start)
    setCustomEnd(end)
  }, [start, end])

  function pushRange(nextStart: string, nextEnd: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    params.set('start', nextStart)
    params.set('end', nextEnd)
    router.push(`/reports?${params.toString()}`)
  }

  function applyPreset(key: PresetKey) {
    const { start: s, end: e } = computePreset(key)
    pushRange(s, e)
  }

  function applyCustom() {
    if (!customStart || !customEnd) return
    if (customStart > customEnd) return
    pushRange(customStart, customEnd)
  }

  return (
    <div className="rounded-xl border border-border bg-white p-4 mb-6">
      <div className="flex flex-wrap gap-2 mb-3">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => applyPreset(p.key)}
            className="px-3 py-1.5 rounded-full border border-border bg-white text-sm hover:bg-muted/40"
            style={{ color: 'var(--rs-text-primary)' }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium mb-1 text-muted-foreground">Start</label>
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="px-3 py-1.5 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1 text-muted-foreground">End</label>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="px-3 py-1.5 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button
          type="button"
          onClick={applyCustom}
          className="px-4 py-1.5 rounded-md text-sm font-semibold text-primary-foreground"
          style={{ backgroundColor: 'var(--rs-primary)' }}
        >
          Apply
        </button>
        <div className="ml-auto text-xs text-muted-foreground self-center">
          Showing <span className="font-medium" style={{ color: 'var(--rs-text-primary)' }}>{start}</span>
          {' '}→{' '}
          <span className="font-medium" style={{ color: 'var(--rs-text-primary)' }}>{end}</span>
        </div>
      </div>
    </div>
  )
}
