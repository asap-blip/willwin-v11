import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface RequestBody {
  id?: string
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

  const { id } = body
  if (!id) {
    return NextResponse.json(
      { __error: 'invalid_input', message: 'id is required' },
      { status: 400 },
    )
  }

  try {
    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('bookings')
      .select(`
        id,
        start_at,
        status,
        customer:customers!inner ( first_name, last_name ),
        appointment_segments!inner (
          service:services!inner ( name, name_en ),
          team_member:team_members!inner ( name )
        )
      `)
      .eq('id', id)
      .limit(1)
      .maybeSingle()

    if (error) throw error
    if (!data) {
      return NextResponse.json(
        { __error: 'not_found', message: 'Booking not found' },
        { status: 404 },
      )
    }

    const row = data as Record<string, unknown>
    const customer = row.customer as { first_name: string; last_name: string }
    const segs = (row.appointment_segments as Array<Record<string, unknown>>) ?? []
    const firstSeg = segs[0] ?? {}
    const service = (firstSeg.service ?? {}) as { name?: string; name_en?: string }
    const tech = (firstSeg.team_member ?? {}) as { name?: string }
    const startAt = row.start_at as string

    return NextResponse.json({
      booking_id: row.id as string,
      first_name: customer.first_name,
      last_name: customer.last_name,
      service_name: service.name ?? '',
      tech_name: tech.name ?? '',
      date: startAt.slice(0, 10),
      time: startAt.slice(11, 16),
    })
  } catch (err) {
    console.error('[api/booking/get] failed', err)
    return NextResponse.json(
      { __error: 'get_failed', message: (err as Error).message },
      { status: 500 },
    )
  }
}
