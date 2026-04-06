import { supabase } from '@/lib/supabase'
import { getTodayString } from '@/lib/calendar-helpers'
import { CalendarView } from '@/components/calendar/CalendarView'
import type { TeamMember, CalendarBooking } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const today = getTodayString()

  // Fetch active team members
  const { data: teamMembers } = await supabase
    .from('team_members')
    .select('*')
    .eq('is_active', true)
    .order('name')

  // Fetch bookings joined through appointment_segments
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

  // Flatten into CalendarBooking shape
  const bookings: CalendarBooking[] = (segments ?? []).map((seg: Record<string, unknown>) => {
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

  return (
    <CalendarView
      teamMembers={(teamMembers as TeamMember[]) ?? []}
      bookings={bookings}
      initialDate={today}
    />
  )
}
