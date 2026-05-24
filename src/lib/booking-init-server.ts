import 'server-only'
import { getServerSupabase } from '@/lib/supabase-server'
import type { BookingInitResponse } from '@/types/booking'

export async function bookingInitServer(): Promise<BookingInitResponse> {
  const supabase = getServerSupabase()

  const [servicesRes, teamRes, hoursRes, availRes] = await Promise.all([
    supabase
      .from('services')
      .select('id, name, name_en, price, duration_minutes, is_active')
      .eq('is_active', true)
      .order('name', { ascending: true }),
    supabase
      .from('team_members')
      .select('id, name, color, is_active')
      .eq('is_active', true)
      .order('name', { ascending: true }),
    supabase.from('business_hours').select('day_of_week, is_open, open_time, close_time'),
    supabase.from('tech_availability').select('team_member_id, day_of_week'),
  ])

  if (servicesRes.error) throw servicesRes.error
  if (teamRes.error) throw teamRes.error
  if (hoursRes.error) throw hoursRes.error
  if (availRes.error) throw availRes.error

  return {
    services: servicesRes.data ?? [],
    team_members: teamRes.data ?? [],
    business_hours: hoursRes.data ?? [],
    tech_availability: availRes.data ?? [],
  }
}
