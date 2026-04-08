import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import {
  generateTimeSlots,
  addMinutesToTimeString,
  normalizeStartAt,
  getDayOfWeek,
  isTechAvailable,
} from '@/lib/calendar-helpers'
import type { TeamMember, TechAvailability, BusinessHours } from '@/lib/types'

// T-FEAT-03 — scoring-based "Best Available" picker.
//
// Philosophy: lower score = tighter schedule. score is (gap_before +
// gap_after) in minutes around the candidate slot, with a flat -30 bonus
// applied when either neighbour lines up back-to-back (or when the slot
// sits at the start / end of the day with no neighbour on that side, as
// the spec treats gap_* = 0 uniformly).
//
// All time arithmetic is string-only. The one allowed use of new Date is
// getDayOfWeek(), which only emits an integer.

interface RequestBody {
  date: string
  team_member_id: string | null
  service_id: string
  duration_minutes: number
}

// "HH:MM" → minutes-since-midnight. Pure string slicing.
function toMinutes(time: string): number {
  return parseInt(time.slice(0, 2), 10) * 60 + parseInt(time.slice(3, 5), 10)
}

// A single existing booking, normalized to the "HH:MM" starts/ends used
// by the gap math below.
interface BookedRange {
  startMin: number
  endMin: number
}

// Load + normalize non-cancelled bookings for a given (tech, date).
// Returns a sorted array of { startMin, endMin } windows.
async function loadBookedRanges(
  date: string,
  teamMemberId: string,
): Promise<BookedRange[]> {
  const dayStart = `${date} 00:00:00`
  const dayEnd = `${date}T23:59:59`

  const { data } = await supabase
    .from('appointment_segments')
    .select(
      `
      duration_minutes,
      booking:bookings!inner (start_at, status)
    `,
    )
    .eq('team_member_id', teamMemberId)
    .gte('booking.start_at', dayStart)
    .lte('booking.start_at', dayEnd)
    .neq('booking.status', 'CANCELLED')

  const ranges: BookedRange[] = []
  for (const seg of (data ?? []) as unknown as {
    duration_minutes: number
    booking: { start_at: string }
  }[]) {
    const startAt = normalizeStartAt(seg.booking.start_at)
    // startAt format is "YYYY-MM-DD HH:MM" — slice out HH:MM directly.
    const time = startAt.slice(11, 16)
    const startMin = toMinutes(time)
    const endMin = startMin + seg.duration_minutes
    ranges.push({ startMin, endMin })
  }
  ranges.sort((a, b) => a.startMin - b.startMin)
  return ranges
}

interface ScoredSlot {
  slot: string
  teamMemberId: string
  score: number
}

// Score every candidate start slot for one tech, given their existing
// bookings and the service duration. Returns the single lowest-scoring
// slot (or null if none are conflict-free).
function bestSlotForTech(
  teamMemberId: string,
  openTime: string,
  closeTime: string,
  durationMin: number,
  existing: BookedRange[],
): ScoredSlot | null {
  // Candidate start slots — 30-min grid across the open window. Drop
  // the trailing close-time label (generateTimeSlots includes it).
  const all = generateTimeSlots(openTime, closeTime)
  const candidates = all.slice(0, Math.max(0, all.length - 1))
  const closeMin = toMinutes(closeTime)

  let best: ScoredSlot | null = null

  for (const slot of candidates) {
    const startMin = toMinutes(slot)
    const endMin = startMin + durationMin

    // Must fit inside the open window
    if (endMin > closeMin) continue

    // No overlap with any existing booking
    const conflict = existing.some((r) => r.startMin < endMin && r.endMin > startMin)
    if (conflict) continue

    // gap_before = minutes between the previous booking's end and this
    // slot's start. 0 when nothing precedes it in the day.
    let prevEnd: number | null = null
    for (const r of existing) {
      if (r.endMin <= startMin) {
        if (prevEnd === null || r.endMin > prevEnd) prevEnd = r.endMin
      }
    }
    const gapBefore = prevEnd === null ? 0 : startMin - prevEnd

    // gap_after = minutes between this slot's end and the next booking's
    // start. 0 when nothing follows it in the day.
    let nextStart: number | null = null
    for (const r of existing) {
      if (r.startMin >= endMin) {
        if (nextStart === null || r.startMin < nextStart) nextStart = r.startMin
      }
    }
    const gapAfter = nextStart === null ? 0 : nextStart - endMin

    let score = gapBefore + gapAfter
    if (gapBefore === 0) score -= 30
    if (gapAfter === 0) score -= 30

    if (best === null || score < best.score) {
      best = { slot, teamMemberId, score }
    }
  }

  return best
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody
    if (
      !body ||
      typeof body.date !== 'string' ||
      typeof body.service_id !== 'string' ||
      typeof body.duration_minutes !== 'number'
    ) {
      return NextResponse.json({ error: 'invalid body' }, { status: 400 })
    }

    const date = body.date
    const dayOfWeek = getDayOfWeek(date)

    // 1. Business hours for this day
    // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
    const { data: hoursRow } = await supabase
      .from('business_hours')
      .select('id, day_of_week, is_open, open_time, close_time')
      .eq('day_of_week', dayOfWeek)
      .maybeSingle()
    const hours = hoursRow as BusinessHours | null
    if (!hours || !hours.is_open) {
      return NextResponse.json({ slot: null })
    }

    // 2. Figure out which techs to consider
    // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
    const { data: avail } = await supabase
      .from('tech_availability')
      .select('id, team_member_id, day_of_week')
    const availability = (avail ?? []) as TechAvailability[]

    let candidateTechs: { id: string; name: string }[] = []
    if (body.team_member_id) {
      // Single-tech request — must be available on this day of week.
      if (!isTechAvailable(availability, body.team_member_id, dayOfWeek)) {
        return NextResponse.json({ slot: null })
      }
      const { data: tm } = await supabase
        .from('team_members')
        .select('id, name')
        .eq('id', body.team_member_id)
        .eq('is_active', true)
        .maybeSingle()
      if (!tm) return NextResponse.json({ slot: null })
      candidateTechs = [{ id: (tm as TeamMember).id, name: (tm as TeamMember).name }]
    } else {
      // "Any tech" — score across every active tech available today.
      const { data: members } = await supabase
        .from('team_members')
        .select('id, name, is_active')
        .eq('is_active', true)
      candidateTechs = ((members ?? []) as TeamMember[])
        .filter((tm) => isTechAvailable(availability, tm.id, dayOfWeek))
        .map((tm) => ({ id: tm.id, name: tm.name }))
    }

    if (candidateTechs.length === 0) {
      return NextResponse.json({ slot: null })
    }

    // 3. Score every candidate tech and pick the overall winner.
    let overall: (ScoredSlot & { techName: string }) | null = null
    for (const tech of candidateTechs) {
      const existing = await loadBookedRanges(date, tech.id)
      const best = bestSlotForTech(
        tech.id,
        hours.open_time,
        hours.close_time,
        body.duration_minutes,
        existing,
      )
      if (best && (overall === null || best.score < overall.score)) {
        overall = { ...best, techName: tech.name }
      }
    }

    if (!overall) return NextResponse.json({ slot: null })

    return NextResponse.json({
      slot: overall.slot,
      team_member_id: overall.teamMemberId,
      tech_name: overall.techName,
    })
  } catch (err) {
    console.error('[best-available] failed', err)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
