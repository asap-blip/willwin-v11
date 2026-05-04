'use client'

import { useEffect, useState } from 'react'

type Lang = 'fr' | 'en'

const COPY = {
  fr: {
    firstName: 'Prénom',
    service: 'Service',
    tech: 'Technicienne',
    date: 'Date',
    time: 'Heure',
  },
  en: {
    firstName: 'First name',
    service: 'Service',
    tech: 'Tech',
    date: 'Date',
    time: 'Time',
  },
} as const

// EN is the default — initial render and any non-fr/non-en navigator value
// land here. FR is only chosen when navigator.language starts with "fr".
function detectLang(): Lang {
  if (typeof navigator === 'undefined') return 'en'
  const tag = (navigator.language || '').toLowerCase()
  if (tag.startsWith('fr')) return 'fr'
  return 'en'
}

interface Props {
  firstName: string
  serviceName: string
  techName: string
  date: string
  time: string
}

export function ConfirmationView({ firstName, serviceName, techName, date, time }: Props) {
  const [lang, setLang] = useState<Lang>('en')

  useEffect(() => {
    setLang(detectLang())
  }, [])

  const t = COPY[lang]

  return (
    <main
      className="min-h-screen w-full"
      style={{ backgroundColor: 'var(--rs-bg-page)' }}
    >
      <div className="mx-auto w-full max-w-md px-5 py-10">
        <dl className="space-y-4">
          <Row label={t.firstName} value={firstName} />
          <Row label={t.service} value={serviceName} />
          <Row label={t.tech} value={techName} />
          <Row label={t.date} value={date} />
          <Row label={t.time} value={time} />
        </dl>
      </div>
    </main>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt
        className="text-xs uppercase tracking-wide"
        style={{ color: 'var(--rs-neutral)' }}
      >
        {label}
      </dt>
      <dd
        className="text-base mt-1"
        style={{ color: 'var(--rs-text-primary)' }}
      >
        {value}
      </dd>
    </div>
  )
}

export function NotFoundView() {
  return (
    <main
      className="min-h-screen w-full flex items-center justify-center"
      style={{ backgroundColor: 'var(--rs-bg-page)' }}
    >
      <div className="px-5 text-center">
        <p className="text-base" style={{ color: 'var(--rs-text-primary)' }}>
          Booking not found.
        </p>
        <p className="text-sm mt-1" style={{ color: 'var(--rs-neutral)' }}>
          Réservation introuvable.
        </p>
      </div>
    </main>
  )
}