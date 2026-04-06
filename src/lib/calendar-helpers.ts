// Time slot generation — 9:00am to 8:00pm in 30 min increments
export const TIME_SLOTS: string[] = []
for (let h = 9; h <= 19; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:00`)
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:30`)
}
TIME_SLOTS.push('20:00')
// 23 slots: 09:00, 09:30, ... 19:30, 20:00

export const SLOT_HEIGHT = 60 // px per 30-min slot
export const GRID_START_HOUR = 9
export const GRID_END_HOUR = 20

// Extract HH:MM from a start_at TEXT field — string slice only, no Date()
export function extractTime(startAt: string): string {
  // start_at format: "YYYY-MM-DDTHH:MM:SS" or "YYYY-MM-DD HH:MM:SS"
  const timePart = startAt.slice(11, 16) // "HH:MM"
  return timePart
}

// Convert HH:MM string to pixel offset from grid top
export function timeToOffset(time: string): number {
  const hours = parseInt(time.slice(0, 2), 10)
  const minutes = parseInt(time.slice(3, 5), 10)
  const totalMinutes = (hours - GRID_START_HOUR) * 60 + minutes
  return (totalMinutes / 30) * SLOT_HEIGHT
}

// Duration in minutes to pixel height
export function durationToHeight(durationMinutes: number): number {
  return (durationMinutes / 30) * SLOT_HEIGHT
}

// Format time for display: "09:00" → "9:00 AM"
export function formatTimeLabel(slot: string): string {
  const h = parseInt(slot.slice(0, 2), 10)
  const m = slot.slice(3, 5)
  const period = h >= 12 ? 'PM' : 'AM'
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h
  return `${displayH}:${m} ${period}`
}

// Get today as YYYY-MM-DD string — no Date parsing for display
export function getTodayString(): string {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// Get current time offset for the red indicator line
export function getCurrentTimeOffset(): number | null {
  const now = new Date()
  const h = now.getHours()
  const m = now.getMinutes()
  if (h < GRID_START_HOUR || h >= GRID_END_HOUR) return null
  const totalMinutes = (h - GRID_START_HOUR) * 60 + m
  return (totalMinutes / 30) * SLOT_HEIGHT
}

// Format a date string for the top bar: "Sunday, April 6, 2026"
export function formatDateHeading(dateStr: string): string {
  const year = parseInt(dateStr.slice(0, 4), 10)
  const month = parseInt(dateStr.slice(5, 7), 10) - 1
  const day = parseInt(dateStr.slice(8, 10), 10)
  const d = new Date(year, month, day)
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
