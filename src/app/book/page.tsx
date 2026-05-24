import { bookingInitServer } from '@/lib/booking-init-server'
import { BookingFlow } from './BookingFlow'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function BookPage() {
  let initData
  try {
    initData = await bookingInitServer()
  } catch (err) {
    console.error('[book] bookingInit failed:', err)
    return (
      <main
        className="min-h-screen w-full flex items-center justify-center"
        style={{ backgroundColor: 'var(--rs-bg-page)' }}
      >
        <div className="px-5 text-center max-w-md">
          <h1
            className="text-2xl mb-2"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--rs-text-primary)' }}
          >
            Service temporarily unavailable
          </h1>
          <p className="text-sm" style={{ color: 'var(--rs-neutral)' }}>
            Something went wrong loading the booking page. Please try again
            in a moment or call us directly.
          </p>
        </div>
      </main>
    )
  }

  return (
    <BookingFlow
      services={initData.services}
      teamMembers={initData.team_members}
      businessHours={initData.business_hours}
      techAvailability={initData.tech_availability}
    />
  )
}
