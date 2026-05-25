import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase-server'
import {
  computeAvailability,
  fetchDayBookings,
  resolveTech,
  toMin,
} from '@/lib/booking-availability'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface RequestBody {
  date?: string
  team_member_id?: string | null
  service_id?: string
  duration_minutes?: number
}

// Returns the earliest open slot for the date and which tech would take it.
// "Best" here is the first opening — gap-optimization scoring can layer on
// top later. Shape matches the NewBookingModal "Best Available" caller:
//   { slot: string | null, team_member_id?: string, tech_name?: string }
export async function POST(req: Request) {
  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return NextResponse.json(
      { __error: 'invalid_json', message: 'Request body must be JSON' },
      { status: 400 },
    )
  }

  const { date, team_member_id, service_id, duration_minutes } = body
  if (!date || !service_id || !duration_minutes) {
    return NextResponse.json(
      {
        __error: 'invalid_input',
        message: 'date, service_id, duration_minutes are required',
      },
      { status: 400 },
    )
  }

  try {
    const supabase = getServerSupabase()
    const avail = await computeAvailability(supabase, {
      date,
      team_member_id: team_member_id ?? null,
      service_id,
      duration_minutes,
    })

    const slot = avail.available_slots[0] ?? null
    if (!slot) {
      return NextResponse.json({ slot: null })
    }

    // Resolve which candidate tech is free at the earliest slot.
    const bookings = await fetchDayBookings(supabase, date)
    const resolvedTechId = resolveTech(
      bookings,
      avail.candidate_techs,
      toMin(slot),
      duration_minutes,
    )
    if (!resolvedTechId) {
      return NextResponse.json({ slot: null })
    }

    const { data: tech } = await supabase
      .from('team_members')
      .select('name')
      .eq('id', resolvedTechId)
      .limit(1)
      .single()

    return NextResponse.json({
      slot,
      team_member_id: resolvedTechId,
      tech_name: (tech as { name: string } | null)?.name ?? '',
    })
  } catch (err) {
    console.error('[api/booking/best-available] failed', err)
    return NextResponse.json(
      { __error: 'best_available_failed', message: (err as Error).message },
      { status: 500 },
    )
  }
}
