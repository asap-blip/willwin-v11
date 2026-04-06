import { supabase } from '@/lib/supabase'
import { getTodayString } from '@/lib/calendar-helpers'
import { fetchBookingsForDate } from '@/lib/fetch-bookings'
import { CalendarView } from '@/components/calendar/CalendarView'
import type { TeamMember } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const today = getTodayString()

  const { data: teamMembers } = await supabase
    .from('team_members')
    .select('*')
    .eq('is_active', true)
    .order('name')

  const bookings = await fetchBookingsForDate(today)

  return (
    <CalendarView
      teamMembers={(teamMembers as TeamMember[]) ?? []}
      initialBookings={bookings}
      initialDate={today}
    />
  )
}
