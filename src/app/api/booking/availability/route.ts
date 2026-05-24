import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase-server'
import { computeAvailability } from '@/lib/booking-availability'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface RequestBody {
  date?: string
  team_member_id?: string | null
  service_id?: string
  duration_minutes?: number
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
    const res = await computeAvailability(supabase, {
      date,
      team_member_id: team_member_id ?? null,
      service_id,
      duration_minutes,
    })
    return NextResponse.json({
      is_open: res.is_open,
      open_time: res.open_time,
      close_time: res.close_time,
      tech_works_today: res.tech_works_today,
      available_slots: res.available_slots,
    })
  } catch (err) {
    console.error('[api/booking/availability] failed', err)
    return NextResponse.json(
      { __error: 'availability_failed', message: (err as Error).message },
      { status: 500 },
    )
  }
}
