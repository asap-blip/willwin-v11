import { supabase } from '@/lib/supabase'
import { normalizeStartAt, formatTimeLabel } from '@/lib/calendar-helpers'

export const dynamic = 'force-dynamic'

interface ConfirmationPageProps {
  searchParams: Promise<{ id?: string }>
}

const COPY = {
  fr: {
    title: 'Réservation confirmée',
    farewell: 'À bientôt!',
    service: 'Service',
    tech: 'Technicienne',
    when: 'Date et heure',
    notFound: 'Réservation introuvable.',
    backHome: 'Faire une autre réservation',
  },
  en: {
    title: 'Booking confirmed',
    farewell: 'See you soon!',
    service: 'Service',
    tech: 'Tech',
    when: 'Date & time',
    notFound: 'Booking not found.',
    backHome: 'Make another booking',
  },
} as const

function formatDateLong(dateStr: string, lang: 'fr' | 'en'): string {
  // dateStr is canonical "YYYY-MM-DD HH:MM" — slice to YYYY-MM-DD then format day.
  const y = parseInt(dateStr.slice(0, 4), 10)
  const m = parseInt(dateStr.slice(5, 7), 10) - 1
  const d = parseInt(dateStr.slice(8, 10), 10)
  const dt = new Date(y, m, d)
  return dt.toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default async function ConfirmationPage({ searchParams }: ConfirmationPageProps) {
  const { id } = await searchParams

  if (!id) {
    return <NotFound lang="fr" />
  }

  // Fetch booking + customer + segment + service + tech in two roundtrips.
  const { data: booking } = await supabase
    .from('bookings')
    .select(`
      id,
      start_at,
      customer:customers (id, first_name, language),
      segments:appointment_segments (
        team_member:team_members (id, name),
        service:services (id, name)
      )
    `)
    .eq('id', id)
    .maybeSingle()

  if (!booking) {
    return <NotFound lang="fr" />
  }

  // Supabase typed result is loose — narrow at the boundary.
  const customer = booking.customer as unknown as
    | { id: string; first_name: string; language: string | null }
    | null
  const seg = (
    booking.segments as unknown as {
      team_member: { id: string; name: string } | null
      service: { id: string; name: string } | null
    }[]
  )?.[0]

  const lang: 'fr' | 'en' = customer?.language === 'en' ? 'en' : 'fr'
  const t = COPY[lang]

  const normalized = normalizeStartAt(booking.start_at as string)
  const dateLabel = formatDateLong(normalized, lang)
  const timeLabel = formatTimeLabel(normalized.slice(11, 16))

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--rs-bg-page)' }}>
      <div className="max-w-md mx-auto px-5 py-10">
        <div className="bg-white rounded-2xl shadow-sm border border-border p-6 text-center">
          <div
            className="text-4xl mb-3"
            aria-hidden
          >
            💅
          </div>
          <h1
            className="text-3xl"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--rs-text-primary)' }}
          >
            {t.title}
          </h1>
          <p
            className="text-base mt-2"
            style={{ color: 'var(--rs-text-primary)' }}
          >
            {customer?.first_name ? `${customer.first_name}, ${t.farewell.toLowerCase()}` : t.farewell}
          </p>

          <div className="mt-6 text-left space-y-3">
            <Row label={t.service} value={seg?.service?.name ?? '—'} />
            <Row label={t.tech} value={seg?.team_member?.name ?? '—'} />
            <Row label={t.when} value={`${dateLabel} · ${timeLabel}`} />
          </div>

          <div className="mt-8">
            <a
              href="/book"
              className="inline-block px-5 py-3 rounded-xl border border-border text-sm font-medium"
            >
              {t.backHome}
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2 last:border-b-0">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm font-medium" style={{ color: 'var(--rs-text-primary)' }}>
        {value}
      </span>
    </div>
  )
}

function NotFound({ lang }: { lang: 'fr' | 'en' }) {
  const t = COPY[lang]
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--rs-bg-page)' }}>
      <div className="bg-white border border-border rounded-2xl p-6 text-center max-w-sm">
        <p className="text-sm text-muted-foreground">{t.notFound}</p>
        <a href="/book" className="mt-4 inline-block text-sm font-medium" style={{ color: 'var(--rs-primary)' }}>
          {t.backHome}
        </a>
      </div>
    </div>
  )
}
