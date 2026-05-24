// Server-side slot computation shared by /availability and /create.
// All time math is pure string arithmetic — never new Date() for slot logic.

import type { SupabaseClient } from '@supabase/supabase-js'

const DOW_FROM_DATE = (dateStr: string): number =>
  // Anchor at noon to dodge DST. Day number only.
  new Date(dateStr + 'T12:00:00').getDay()

function toMin(hhmm: string): number {
  return parseInt(hhmm.slice(0, 2), 10) * 60 + parseInt(hhmm.slice(3, 5), 10)
}

function fromMin(total: number): string {
  const h = String(Math.floor(total / 60)).padStart(2, '0')
  const m = String(total % 60).padStart(2, '0')
  return `${h}:${m}`
}

export interface AvailabilityInput {
  date: string
  team_member_id: string | null
  service_id: string
  duration_minutes: number
}

export interface AvailabilityResult {
  is_open: boolean
  open_time: string | null
  close_time: string | null
  tech_works_today: boolean
  available_slots: string[]
  candidate_techs: string[] // tech ids that work that day and have no conflict at chosen slot (filled by computeAvailability for "no preference")
}

interface BookingRow {
  id: string
  start_at: string
  status: string
  segments: { team_member_id: string; duration_minutes: number }[]
}

// Fetch all non-cancelled bookings for the date with their segments.
async function fetchDayBookings(
  supabase: SupabaseClient,
  date: string,
): Promise<BookingRow[]> {
  const dayStart = `${date} 00:00:00`
  const dayEnd = `${date}T23:59:59`

  const { data, error } = await supabase
    .from('bookings')
    .select(`
      id,
      start_at,
      status,
      appointment_segments!inner (
        team_member_id,
        duration_minutes
      )
    `)
    .gte('start_at', dayStart)
    .lte('start_at', dayEnd)
    .neq('status', 'CANCELLED')

  if (error) throw error

  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>
    const segs = (r.appointment_segments as Array<Record<string, unknown>>) ?? []
    return {
      id: r.id as string,
      start_at: r.start_at as string,
      status: r.status as string,
      segments: segs.map((s) => ({
        team_member_id: s.team_member_id as string,
        duration_minutes: s.duration_minutes as number,
      })),
    }
  })
}

// True iff [slotStart, slotEnd) overlaps any existing booking for techId.
function techHasConflict(
  bookings: BookingRow[],
  techId: string,
  slotStartMin: number,
  durationMin: number,
): boolean {
  const slotEnd = slotStartMin + durationMin
  for (const bk of bookings) {
    const bkStart = toMin(bk.start_at.slice(11, 16))
    for (const seg of bk.segments) {
      if (seg.team_member_id !== techId) continue
      const segEnd = bkStart + seg.duration_minutes
      if (slotStartMin < segEnd && bkStart < slotEnd) return true
    }
  }
  return false
}

export async function computeAvailability(
  supabase: SupabaseClient,
  input: AvailabilityInput,
): Promise<AvailabilityResult> {
  const { date, team_member_id, duration_minutes } = input
  const dow = DOW_FROM_DATE(date)

  // Business hours for the day
  const { data: hoursRows, error: hoursErr } = await supabase
    .from('business_hours')
    .select('day_of_week, is_open, open_time, close_time')
    .eq('day_of_week', dow)
    .limit(1)
  if (hoursErr) throw hoursErr

  const hours = (hoursRows ?? [])[0]
  if (!hours || !hours.is_open || !hours.open_time || !hours.close_time) {
    return {
      is_open: false,
      open_time: hours?.open_time ?? null,
      close_time: hours?.close_time ?? null,
      tech_works_today: false,
      available_slots: [],
      candidate_techs: [],
    }
  }

  // Active techs
  const { data: teamRows, error: teamErr } = await supabase
    .from('team_members')
    .select('id')
    .eq('is_active', true)
  if (teamErr) throw teamErr
  const activeTechIds = (teamRows ?? []).map((r) => (r as { id: string }).id)

  // Tech availability for this day_of_week
  const { data: availRows, error: availErr } = await supabase
    .from('tech_availability')
    .select('team_member_id')
    .eq('day_of_week', dow)
  if (availErr) throw availErr
  const workingTechIds = new Set(
    (availRows ?? [])
      .map((r) => (r as { team_member_id: string }).team_member_id)
      .filter((id) => activeTechIds.includes(id)),
  )

  // Candidate techs after filtering by team_member_id preference
  let candidates: string[]
  if (team_member_id) {
    candidates = workingTechIds.has(team_member_id) ? [team_member_id] : []
  } else {
    candidates = Array.from(workingTechIds)
  }

  if (candidates.length === 0) {
    return {
      is_open: true,
      open_time: hours.open_time,
      close_time: hours.close_time,
      tech_works_today: false,
      available_slots: [],
      candidate_techs: [],
    }
  }

  const bookings = await fetchDayBookings(supabase, date)

  const openMin = toMin(hours.open_time)
  const closeMin = toMin(hours.close_time)

  const slots: string[] = []
  for (let t = openMin; t + duration_minutes <= closeMin; t += 30) {
    const anyFree = candidates.some(
      (techId) => !techHasConflict(bookings, techId, t, duration_minutes),
    )
    if (anyFree) slots.push(fromMin(t))
  }

  return {
    is_open: true,
    open_time: hours.open_time,
    close_time: hours.close_time,
    tech_works_today: true,
    available_slots: slots,
    candidate_techs: candidates,
  }
}

// Pick the first candidate tech that is free at the given slot.
export function resolveTech(
  bookings: BookingRow[],
  candidates: string[],
  startMin: number,
  durationMin: number,
): string | null {
  for (const id of candidates) {
    if (!techHasConflict(bookings, id, startMin, durationMin)) return id
  }
  return null
}

export { fetchDayBookings, toMin, fromMin, techHasConflict, DOW_FROM_DATE }
