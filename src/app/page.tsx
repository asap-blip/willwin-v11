import { supabase } from '@/lib/supabase'
import { getTodayString } from '@/lib/calendar-helpers'
import { fetchBookingsForDate } from '@/lib/fetch-bookings'
import { getFeatures } from '@/lib/features'
import { CalendarView } from '@/components/calendar/CalendarView'
import type { TeamMember, BusinessHours, TechAvailability } from '@/lib/types'

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

  // T12 — tech_availability is the source of truth for which techs work which days.
  // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
  const { data: techAvailability } = await supabase
    .from('tech_availability')
    .select('id, team_member_id, day_of_week')

  const bookings = await fetchBookingsForDate(today)
  const features = await getFeatures()

  return (
    <CalendarView
      teamMembers={(teamMembers as TeamMember[]) ?? []}
      businessHours={(businessHours as BusinessHours[]) ?? []}
      techAvailability={(techAvailability as TechAvailability[]) ?? []}
      initialBookings={bookings}
      initialDate={today}
      loyaltyEnabled={features?.loyalty_tiers ?? false}
      adminSignature={features?.admin_signature ?? null}
    />
  )
}
