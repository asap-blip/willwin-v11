import { supabase } from '@/lib/supabase'
import type { TeamMember, Service, BusinessHours, TechAvailability } from '@/lib/types'
import { BookingFlow } from './BookingFlow'

export const dynamic = 'force-dynamic'

export default async function BookPage() {
  // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
  const { data: services } = await supabase
    .from('services')
    .select('id, name, duration_minutes, price, is_active')
    .eq('is_active', true)
    .order('name')

  const { data: teamMembers } = await supabase
    .from('team_members')
    .select('id, name, color, avatar_url, is_active, working_days')
    .eq('is_active', true)
    .order('name')

  const { data: businessHours } = await supabase
    .from('business_hours')
    .select('id, day_of_week, is_open, open_time, close_time')
    .order('day_of_week')

  const { data: techAvailability } = await supabase
    .from('tech_availability')
    .select('id, team_member_id, day_of_week')

  return (
    <BookingFlow
      services={(services as Service[]) ?? []}
      teamMembers={(teamMembers as TeamMember[]) ?? []}
      businessHours={(businessHours as BusinessHours[]) ?? []}
      techAvailability={(techAvailability as TechAvailability[]) ?? []}
    />
  )
}
