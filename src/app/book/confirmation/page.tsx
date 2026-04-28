import { supabase } from '@/lib/supabase'
import { ConfirmationView, NotFoundView } from './ConfirmationView'

export const dynamic = 'force-dynamic'

interface ConfirmationPageProps {
  searchParams: Promise<{ id?: string }>
}

export default async function ConfirmationPage({ searchParams }: ConfirmationPageProps) {
  const { id } = await searchParams

  if (!id) {
    return <NotFoundView />
  }

  const { data: booking } = await supabase
    .from('bookings')
    .select(`
      id,
      start_at,
      customer:customers (first_name),
      segments:appointment_segments (
        team_member:team_members (name),
        service:services (name)
      )
    `)
    .eq('id', id)
    .maybeSingle()

  if (!booking) {
    return <NotFoundView />
  }

  // Supabase typed result is loose — narrow at the boundary.
  const customer = booking.customer as unknown as
    | { first_name: string }
    | null
  const seg = (
    booking.segments as unknown as {
      team_member: { name: string } | null
      service: { name: string } | null
    }[]
  )?.[0]

  // start_at is TEXT — slice as string. Never new Date().
  const startAt = booking.start_at as string
  const date = startAt.slice(0, 10)
  const time = startAt.slice(11, 16)

  return (
    <ConfirmationView
      firstName={customer?.first_name ?? ''}
      serviceName={seg?.service?.name ?? ''}
      techName={seg?.team_member?.name ?? ''}
      date={date}
      time={time}
    />
  )
}
