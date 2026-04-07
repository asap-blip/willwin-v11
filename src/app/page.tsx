import { supabase } from '@/lib/supabase'
import { getTodayString } from '@/lib/calendar-helpers'
import { fetchBookingsForDate } from '@/lib/fetch-bookings'
import { CalendarView } from '@/components/calendar/CalendarView'
import type { TeamMember, BusinessHours } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const today = getTodayString()

  // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
  const { data: teamMembers } = await supabase
    .from('team_members')
    .select('id, name, color, avatar_url, is_active, working_days')
    .eq('is_active', true)
    .order('name')

  // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
  const { data: businessHours } = await supabase
    .from('business_hours')
    .select('id, day_of_week, is_open, open_time, close_time')
    .order('day_of_week')

  const bookings = await fetchBookingsForDate(today)

  return (
    <CalendarView
      teamMembers={(teamMembers as TeamMember[]) ?? []}
      businessHours={(businessHours as BusinessHours[]) ?? []}
      initialBookings={bookings}
      initialDate={today}
    />
  )
}
