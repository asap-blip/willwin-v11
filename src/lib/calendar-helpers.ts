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

// Add minutes to a "YYYY-MM-DD HH:MM" string — string-only arithmetic, never new Date()
export function addMinutesToTimeString(startAt: string, minutes: number): string {
  const datePart = startAt.slice(0, 10)
  const h = parseInt(startAt.slice(11, 13), 10)
  const m = parseInt(startAt.slice(14, 16), 10)
  const total = h * 60 + m + minutes
  const newH = String(Math.floor(total / 60)).padStart(2, '0')
  const newM = String(total % 60).padStart(2, '0')
  return `${datePart} ${newH}:${newM}`
}

// Round a HH:MM time down to the nearest 30-minute slot
export function roundToSlot(time: string): string {
  const h = parseInt(time.slice(0, 2), 10)
  const m = parseInt(time.slice(3, 5), 10)
  const rounded = m >= 30 ? '30' : '00'
  return `${String(h).padStart(2, '0')}:${rounded}`
}

// ─── Business hours helpers (T12) ──────────────────────────────────────────

// Generate 30-minute slot labels from openTime to closeTime, inclusive of close.
// Both inputs are "HH:MM" strings; never new Date().
export function generateTimeSlots(openTime: string, closeTime: string): string[] {
  const slots: string[] = []
  const startMin = parseInt(openTime.slice(0, 2), 10) * 60 + parseInt(openTime.slice(3, 5), 10)
  const endMin = parseInt(closeTime.slice(0, 2), 10) * 60 + parseInt(closeTime.slice(3, 5), 10)
  for (let t = startMin; t <= endMin; t += 30) {
    const h = String(Math.floor(t / 60)).padStart(2, '0')
    const m = String(t % 60).padStart(2, '0')
    slots.push(`${h}:${m}`)
  }
  return slots
}

// Pixel offset of a HH:MM time relative to a grid that starts at openTime.
export function timeToOffsetFrom(time: string, openTime: string): number {
  const tMin = parseInt(time.slice(0, 2), 10) * 60 + parseInt(time.slice(3, 5), 10)
  const oMin = parseInt(openTime.slice(0, 2), 10) * 60 + parseInt(openTime.slice(3, 5), 10)
  return ((tMin - oMin) / 30) * SLOT_HEIGHT
}

// Current-time red line offset for a grid running openTime → closeTime.
// Returns null when "now" is outside the open window.
export function getCurrentTimeOffsetFrom(openTime: string, closeTime: string): number | null {
  const now = new Date()
  const cur = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  if (cur < openTime || cur >= closeTime) return null
  return timeToOffsetFrom(cur, openTime)
}

// Day of week (0 = Sunday … 6 = Saturday) from a YYYY-MM-DD string.
// Anchored at noon to dodge any DST nonsense — only the day number is used.
export function getDayOfWeek(dateStr: string): number {
  return new Date(dateStr + 'T12:00:00').getDay()
}

// Does this tech work on the given day of week? Empty/null = works all days.
export function techWorksOnDay(workingDays: string | null | undefined, dayOfWeek: number): boolean {
  if (!workingDays) return true
  return workingDays
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .includes(dayOfWeek)
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
