import { supabase } from '@/lib/supabase'
import type { CalendarBooking } from '@/lib/types'

export async function fetchBookingsForDate(date: string): Promise<CalendarBooking[]> {
  // Use space for dayStart and T for dayEnd to capture both separator formats
  // Space (0x20) < T (0x54), so " 00:00:00" is the lowest and "T23:59:59" is the highest
  const dayStart = `${date} 00:00:00`
  const dayEnd = `${date}T23:59:59`

  const { data: segments } = await supabase
    .from('appointment_segments')
    .select(`
      id,
      duration_minutes,
      team_member_id,
      booking:bookings!inner (
        id,
        start_at,
        status,
        notes,
        customer:customers!inner (
          first_name,
          last_name
        )
      ),
      service:services!inner (
        name,
        price
      ),
      team_member:team_members!inner (
        color
      )
    `)
    .gte('booking.start_at', dayStart)
    .lte('booking.start_at', dayEnd)
    .neq('booking.status', 'CANCELLED')

  return (segments ?? []).map((seg: Record<string, unknown>) => {
    const booking = seg.booking as Record<string, unknown>
    const customer = booking.customer as Record<string, unknown>
    const service = seg.service as Record<string, unknown>
    const teamMember = seg.team_member as Record<string, unknown>

    return {
      id: booking.id as string,
      start_at: booking.start_at as string,
      status: booking.status as string,
      notes: booking.notes as string | null,
      customer_first_name: customer.first_name as string,
      customer_last_name: customer.last_name as string,
      service_name: service.name as string,
      service_price: service.price as number,
      team_member_id: seg.team_member_id as string,
      team_member_color: teamMember.color as string,
      duration_minutes: seg.duration_minutes as number,
    }
  })
}
