import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase-server'
import {
  computeAvailability,
  fetchDayBookings,
  resolveTech,
  toMin,
  techHasConflict,
} from '@/lib/booking-availability'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface RequestBody {
  service_id?: string
  team_member_id?: string | null
  date?: string
  time?: string
  duration_minutes?: number
  first_name?: string
  last_name?: string
  phone?: string
  email?: string | null
  note?: string | null
  language?: 'fr' | 'en'
}

function normalizePhone(p: string): string {
  return p.replace(/[^0-9+]/g, '')
}

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

  const {
    service_id,
    team_member_id,
    date,
    time,
    duration_minutes,
    first_name,
    last_name,
    phone,
    email,
    note,
    language,
  } = body

  if (
    !service_id ||
    !date ||
    !time ||
    !duration_minutes ||
    !first_name ||
    !last_name ||
    !phone
  ) {
    return NextResponse.json(
      { __error: 'invalid_input', message: 'Missing required fields' },
      { status: 400 },
    )
  }

  try {
    const supabase = getServerSupabase()

    // 1) Recheck availability + resolve tech
    const avail = await computeAvailability(supabase, {
      date,
      team_member_id: team_member_id ?? null,
      service_id,
      duration_minutes,
    })

    if (!avail.is_open || !avail.tech_works_today) {
      return NextResponse.json(
        { __error: 'closed_or_tech_off', message: 'Salon closed or tech off' },
        { status: 409 },
      )
    }
    if (!avail.available_slots.includes(time)) {
      return NextResponse.json(
        { __error: 'slot_unavailable', message: 'Time slot no longer available' },
        { status: 409 },
      )
    }

    const startMin = toMin(time)
    const bookings = await fetchDayBookings(supabase, date)

    let resolvedTechId: string | null
    if (team_member_id) {
      if (techHasConflict(bookings, team_member_id, startMin, duration_minutes)) {
        return NextResponse.json(
          { __error: 'no_tech_available', message: 'Tech is booked at this time' },
          { status: 409 },
        )
      }
      resolvedTechId = team_member_id
    } else {
      resolvedTechId = resolveTech(
        bookings,
        avail.candidate_techs,
        startMin,
        duration_minutes,
      )
      if (!resolvedTechId) {
        return NextResponse.json(
          { __error: 'no_tech_available', message: 'No tech free at this time' },
          { status: 409 },
        )
      }
    }

    // 2) Find-or-create customer by normalized phone
    const phoneNorm = normalizePhone(phone)
    let customerId: string | null = null
    {
      const { data: existing, error: findErr } = await supabase
        .from('customers')
        .select('id')
        .eq('phone', phoneNorm)
        .limit(1)
      if (findErr) throw findErr
      if (existing && existing.length > 0) {
        customerId = (existing[0] as { id: string }).id
      }
    }
    if (!customerId) {
      const { data: created, error: createErr } = await supabase
        .from('customers')
        .insert({
          first_name: first_name.trim(),
          last_name: last_name.trim(),
          phone: phoneNorm,
          email: email?.trim() || null,
          language: language ?? 'en',
        })
        .select('id')
        .single()
      if (createErr) throw createErr
      customerId = (created as { id: string }).id
    }

    // 3) Insert booking — start_at is TEXT 'YYYY-MM-DD HH:mm:00'
    const startAt = `${date} ${time}:00`
    const { data: bookingRow, error: bookErr } = await supabase
      .from('bookings')
      .insert({
        customer_id: customerId,
        start_at: startAt,
        status: 'PENDING',
        notes: note?.trim() || null,
        source: 'client',
      })
      .select('id, status')
      .single()
    if (bookErr) throw bookErr

    const bookingId = (bookingRow as { id: string; status: string }).id

    // 4) Insert appointment segment
    const { error: segErr } = await supabase
      .from('appointment_segments')
      .insert({
        booking_id: bookingId,
        team_member_id: resolvedTechId,
        service_id,
        duration_minutes,
      })
    if (segErr) {
      // best-effort cleanup
      await supabase.from('bookings').delete().eq('id', bookingId)
      throw segErr
    }

    return NextResponse.json({
      booking_id: bookingId,
      status: 'PENDING',
      resolved_tech_id: resolvedTechId,
    })
  } catch (err) {
    console.error('[api/booking/create] failed', err)
    return NextResponse.json(
      { __error: 'create_failed', message: (err as Error).message },
      { status: 500 },
    )
  }
}
