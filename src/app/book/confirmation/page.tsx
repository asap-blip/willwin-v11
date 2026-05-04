import { bookingGet } from '@/lib/willwin-api'
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

  try {
    const booking = await bookingGet({ id })
    return (
      <ConfirmationView
        firstName={booking.first_name}
        serviceName={booking.service_name}
        techName={booking.tech_name}
        date={booking.date}
        time={booking.time}
      />
    )
  } catch (err) {
    console.error('[confirmation] bookingGet failed:', err)
    return <NotFoundView />
  }
}