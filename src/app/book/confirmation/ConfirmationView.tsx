'use client'

import { useEffect, useState } from 'react'
import { CalendarCheck, CalendarPlus } from 'lucide-react'

type Lang = 'fr' | 'en'

const COPY = {
  fr: {
    title: 'Réservation confirmée',
    thanks: (name: string) => `Merci, ${name} !`,
    intro: 'Votre rendez-vous est réservé. Voici les détails :',
    sms: 'Nous vous enverrons un texto de confirmation et un rappel avant votre rendez-vous.',
    detailsHeading: 'Détails du rendez-vous',
    firstName: 'Prénom',
    service: 'Service',
    tech: 'Technicienne',
    date: 'Date',
    time: 'Heure',
    addToCalendar: 'Ajouter au calendrier',
    bookAnother: 'Réserver un autre rendez-vous',
  },
  en: {
    title: 'Booking confirmed',
    thanks: (name: string) => `Thank you, ${name}!`,
    intro: 'Your appointment is booked. Here are the details:',
    sms: "We'll text you a confirmation and a reminder before your appointment.",
    detailsHeading: 'Appointment details',
    firstName: 'First name',
    service: 'Service',
    tech: 'Tech',
    date: 'Date',
    time: 'Time',
    addToCalendar: 'Add to calendar',
    bookAnother: 'Book another appointment',
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

// Build a Google Calendar "add event" URL from the booking's date/time
// strings. Pure string formatting — never new Date() on the booking values.
// Times are floating + pinned to America/Toronto via ctz. Duration is not in
// the booking-get contract, so a 60-minute block is assumed; the salon never
// crosses midnight (closes by 20:00) so no day rollover handling is needed.
function calendarUrl(serviceName: string, techName: string, date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null
  const ymd = date.replace(/-/g, '')
  const startHm = time.replace(':', '')
  const startH = parseInt(time.slice(0, 2), 10)
  const startM = parseInt(time.slice(3, 5), 10)
  const endTotal = startH * 60 + startM + 60
  const endH = String(Math.floor(endTotal / 60)).padStart(2, '0')
  const endM = String(endTotal % 60).padStart(2, '0')
  const dates = `${ymd}T${startHm}00/${ymd}T${endH}${endM}00`
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: serviceName,
    details: techName ? `With ${techName}` : '',
    dates,
    ctz: 'America/Toronto',
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
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
  const calUrl = calendarUrl(serviceName, techName, date, time)

  return (
    <main
      className="min-h-screen w-full"
      style={{ backgroundColor: 'var(--rs-bg-page)' }}
    >
      <div className="mx-auto w-full max-w-md px-5 py-12">
        {/* Header */}
        <div className="flex flex-col items-center text-center">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-full"
            style={{ backgroundColor: 'var(--rs-primary-subtle)', border: '1px solid var(--rs-primary-border)' }}
          >
            <CalendarCheck className="h-7 w-7" style={{ color: 'var(--rs-primary)' }} />
          </span>
          <h1
            className="mt-4 text-2xl font-semibold"
            style={{ color: 'var(--rs-text-primary)' }}
          >
            {t.title}
          </h1>
          <p className="mt-2 text-base" style={{ color: 'var(--rs-text-primary)' }}>
            {t.thanks(firstName)}
          </p>
          <p className="mt-1 text-sm" style={{ color: 'var(--rs-neutral)' }}>
            {t.intro}
          </p>
        </div>

        {/* Details card */}
        <div
          className="mt-8 rounded-xl bg-white p-6 shadow-sm"
          style={{ border: '1px solid var(--rs-primary-border)' }}
        >
          <h2
            className="mb-4 text-xs font-semibold uppercase tracking-wide"
            style={{ color: 'var(--rs-neutral)' }}
          >
            {t.detailsHeading}
          </h2>
          <dl className="space-y-4">
            <Row label={t.service} value={serviceName} />
            <Row label={t.tech} value={techName} />
            <Row label={t.date} value={date} />
            <Row label={t.time} value={time} />
          </dl>
        </div>

        {/* Follow-up copy */}
        <p
          className="mt-6 text-center text-sm"
          style={{ color: 'var(--rs-neutral)' }}
        >
          {t.sms}
        </p>

        {/* Actions */}
        <div className="mt-8 flex flex-col items-center gap-3">
          {calUrl && (
            <a
              href={calUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--rs-primary)' }}
            >
              <CalendarPlus className="h-4 w-4" />
              {t.addToCalendar}
            </a>
          )}
          <a
            href="/book"
            className="text-sm underline-offset-4 hover:underline"
            style={{ color: 'var(--rs-text-primary)' }}
          >
            {t.bookAnother}
          </a>
        </div>
      </div>
    </main>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt
        className="text-xs uppercase tracking-wide"
        style={{ color: 'var(--rs-neutral)' }}
      >
        {label}
      </dt>
      <dd
        className="text-right text-base font-medium"
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
