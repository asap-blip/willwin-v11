'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  bookingAvailability,
  bookingCreate,
  WillwinApiError,
} from '@/lib/willwin-api'
import type {
  TeamMember,
  Service,
  BusinessHours,
  TechAvailability,
} from '@/types/booking'
import { formatTimeLabel, getDayOfWeek, isTechAvailable } from '@/lib/calendar-helpers'

// "No preference" sentinel — never collides with a real UUID.
const NO_PREF = '__no_pref__'

const COPY = {
  fr: {
    title: 'Réservez votre rendez-vous',
    step: 'Étape',
    of: 'sur',
    pickService: 'Choisissez un service',
    pickTech: 'Choisissez votre technicienne',
    pickDate: 'Choisissez la date',
    pickTime: 'Choisissez l\u2019heure',
    yourDetails: 'Vos coordonnées',
    noPref: 'Aucune préférence',
    firstName: 'Prénom',
    lastName: 'Nom',
    phone: 'Téléphone',
    email: 'Courriel (facultatif)',
    note: 'Note (facultatif)',
    back: 'Retour',
    next: 'Suivant',
    confirm: 'Confirmer',
    submitting: 'Envoi…',
    closedDay: 'Fermé ce jour',
    noSlots: 'Aucun créneau disponible ce jour',
    techOff: 'Cette technicienne ne travaille pas ce jour-là.',
    pickAnother: 'Choisissez une autre date ou technicienne.',
    minutes: 'min',
    chooseDate: '— Choisir —',
    requiredFields: 'Veuillez remplir tous les champs requis.',
    submitError: 'Une erreur est survenue. Veuillez réessayer.',
    noAvail: 'Aucune technicienne disponible à ce créneau.',
    loadingSlots: 'Chargement…',
  },
  en: {
    title: 'Book your appointment',
    step: 'Step',
    of: 'of',
    pickService: 'Pick a service',
    pickTech: 'Pick your tech',
    pickDate: 'Pick a date',
    pickTime: 'Pick a time',
    yourDetails: 'Your details',
    noPref: 'No preference',
    firstName: 'First name',
    lastName: 'Last name',
    phone: 'Phone',
    email: 'Email (optional)',
    note: 'Note (optional)',
    back: 'Back',
    next: 'Next',
    confirm: 'Confirm',
    submitting: 'Submitting…',
    closedDay: 'Closed that day',
    noSlots: 'No times available that day',
    techOff: 'This tech is not working that day.',
    pickAnother: 'Pick a different date or tech.',
    minutes: 'min',
    chooseDate: '— Choose —',
    requiredFields: 'Please fill in all required fields.',
    submitError: 'Something went wrong. Please try again.',
    noAvail: 'No tech available at this time.',
    loadingSlots: 'Loading…',
  },
} as const

type Lang = 'fr' | 'en'

interface BookingFlowProps {
  services: Service[]
  teamMembers: TeamMember[]
  businessHours: BusinessHours[]
  techAvailability: TechAvailability[]
}

// Build a list of the next N days as YYYY-MM-DD strings (today included).
// Date() is only used to derive day_of_week — display values are sliced.
function buildNextDays(n: number): string[] {
  const out: string[] = []
  const now = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    out.push(`${yyyy}-${mm}-${dd}`)
  }
  return out
}

function formatDayLabel(dateStr: string, lang: Lang): string {
  const y = parseInt(dateStr.slice(0, 4), 10)
  const m = parseInt(dateStr.slice(5, 7), 10) - 1
  const d = parseInt(dateStr.slice(8, 10), 10)
  const dt = new Date(y, m, d)
  return dt.toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function BookingFlow({
  services,
  teamMembers,
  businessHours,
  techAvailability,
}: BookingFlowProps) {
  const router = useRouter()

  // Language toggle — defaults to English (Montreal salon, EN-default flow).
  const [lang, setLang] = useState<Lang>('en')
  const t = COPY[lang]

  // Step machine
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)

  // Selections
  const [serviceId, setServiceId] = useState<string | null>(null)
  const [teamMemberId, setTeamMemberId] = useState<string>(NO_PREF)
  const [date, setDate] = useState<string>('')
  const [time, setTime] = useState<string>('')

  // Customer details
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')

  // Submit state
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Availability — computed by the n8n availability webhook
  const [availableSlots, setAvailableSlots] = useState<string[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slotsError, setSlotsError] = useState<string | null>(null)

  const selectedService = useMemo(
    () => services.find((s) => s.id === serviceId) ?? null,
    [services, serviceId],
  )

  // Available days — limited to the next 21 days where business_hours.is_open
  const dayOptions = useMemo(() => {
    return buildNextDays(21).filter((d) => {
      const dow = getDayOfWeek(d)
      const row = businessHours.find((h) => h.day_of_week === dow)
      return Boolean(row && row.is_open)
    })
  }, [businessHours])

  const dayOfWeek = useMemo(() => (date ? getDayOfWeek(date) : -1), [date])

  // Selected tech availability for the chosen date — local check using the
  // cached tech_availability table. Cheap, no webhook needed.
  const selectedTechAvailable = useMemo(() => {
    if (!date) return true
    if (teamMemberId === NO_PREF) {
      // At least one active tech must work that day
      return teamMembers.some((tm) => isTechAvailable(techAvailability, tm.id, dayOfWeek))
    }
    return isTechAvailable(techAvailability, teamMemberId, dayOfWeek)
  }, [date, dayOfWeek, teamMemberId, teamMembers, techAvailability])

  // Fetch availability whenever date/tech/service changes.
  // n8n owns slot generation, conflict detection, business-hours math.
  useEffect(() => {
    if (!date || !selectedService || !selectedTechAvailable) {
      setAvailableSlots([])
      return
    }
    let cancelled = false
    setSlotsLoading(true)
    setSlotsError(null)
    bookingAvailability({
      date,
      team_member_id: teamMemberId === NO_PREF ? null : teamMemberId,
      service_id: selectedService.id,
      duration_minutes: selectedService.duration_minutes,
    })
      .then((res) => {
        if (cancelled) return
        if (!res.is_open || !res.tech_works_today) {
          setAvailableSlots([])
        } else {
          setAvailableSlots(res.available_slots)
        }
      })
      .catch((err) => {
        if (cancelled) return
        console.error('[BookingFlow] availability failed', err)
        setSlotsError(t.submitError)
        setAvailableSlots([])
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [date, teamMemberId, selectedService, selectedTechAvailable, t.submitError])

  // Reset time when slots list changes
  useEffect(() => {
    if (time && !availableSlots.includes(time)) setTime('')
  }, [availableSlots, time])

  // ─── Step gating ────────────────────────────────────────────────────────
  const canNextFromStep1 = !!serviceId
  const canNextFromStep2 = !!teamMemberId // NO_PREF or a real id
  const canNextFromStep3 = !!date && !!time && selectedTechAvailable
  const canSubmit =
    !!firstName.trim() && !!lastName.trim() && !!phone.trim() && !submitting && canNextFromStep3

  // ─── Submit ─────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!canSubmit || !selectedService) return
    setSubmitting(true)
    setSubmitError(null)

    try {
      const res = await bookingCreate({
        service_id: selectedService.id,
        team_member_id: teamMemberId === NO_PREF ? null : teamMemberId,
        date,
        time,
        duration_minutes: selectedService.duration_minutes,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim(),
        email: email.trim() || null,
        note: note.trim() || null,
        language: lang,
      })
      router.push(`/book/confirmation?id=${res.booking_id}`)
    } catch (err) {
      console.error('[BookingFlow] submit failed', err)
      if (err instanceof WillwinApiError && err.code === 'no_tech_available') {
        setSubmitError(t.noAvail)
      } else {
        setSubmitError(t.submitError)
      }
      setSubmitting(false)
    }
  }

  // ─── Render helpers ─────────────────────────────────────────────────────
  function StepHeader() {
    return (
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {t.step} {step} {t.of} 4
          </p>
          <h2 className="text-2xl mt-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--rs-text-primary)' }}>
            {step === 1 && t.pickService}
            {step === 2 && t.pickTech}
            {step === 3 && `${t.pickDate} & ${t.pickTime}`}
            {step === 4 && t.yourDetails}
          </h2>
        </div>
        {/* Language toggle — EN is the default; FR is opt-in */}
        <div className="flex items-center rounded-full border border-border overflow-hidden text-sm">
          <button
            type="button"
            onClick={() => setLang('en')}
            className={`px-3 py-1.5 ${lang === 'en' ? 'bg-primary text-primary-foreground' : 'bg-white'}`}
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => setLang('fr')}
            className={`px-3 py-1.5 ${lang === 'fr' ? 'bg-primary text-primary-foreground' : 'bg-white'}`}
          >
            FR
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--rs-bg-page)' }}>
      <div className="max-w-md mx-auto px-5 py-8">
        {/* Brand title */}
        <h1
          className="text-3xl text-center mb-6"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--rs-text-primary)' }}
        >
          {t.title}
        </h1>

        <div className="bg-white rounded-2xl shadow-sm border border-border p-5">
          <StepHeader />

          {/* ─── Step 1: Service ──────────────────────────────────────── */}
          {step === 1 && (
            <div className="grid grid-cols-1 gap-3">
              {services.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">—</p>
              ) : (
                services.map((s) => {
                  const selected = serviceId === s.id
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setServiceId(s.id)}
                      className={`text-left rounded-xl border p-4 transition ${
                        selected
                          ? 'border-primary bg-secondary'
                          : 'border-border bg-white hover:bg-muted/40'
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-semibold text-base" style={{ color: 'var(--rs-text-primary)' }}>
                          {s.name}
                        </span>
                        <span className="text-sm font-medium" style={{ color: 'var(--rs-text-primary)' }}>
                          ${s.price}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {s.duration_minutes} {t.minutes}
                      </p>
                    </button>
                  )
                })
              )}
            </div>
          )}

          {/* ─── Step 2: Tech ─────────────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setTeamMemberId(NO_PREF)}
                className={`w-full text-left rounded-xl border p-4 flex items-center gap-3 transition ${
                  teamMemberId === NO_PREF
                    ? 'border-primary bg-secondary'
                    : 'border-border bg-white hover:bg-muted/40'
                }`}
              >
                <span className="w-3 h-3 rounded-full bg-muted-foreground/40 flex-shrink-0" />
                <span className="font-medium">{t.noPref}</span>
              </button>
              {teamMembers.map((tm) => {
                const selected = teamMemberId === tm.id
                return (
                  <button
                    key={tm.id}
                    type="button"
                    onClick={() => setTeamMemberId(tm.id)}
                    className={`w-full text-left rounded-xl border p-4 flex items-center gap-3 transition ${
                      selected
                        ? 'border-primary bg-secondary'
                        : 'border-border bg-white hover:bg-muted/40'
                    }`}
                  >
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: tm.color ?? undefined }}
                    />
                    <span className="font-medium">{tm.name}</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* ─── Step 3: Date & Time ──────────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-5">
              {/* Day chooser — only open days from the next 21 */}
              <div>
                <label className="block text-sm font-medium mb-2">{t.pickDate}</label>
                <div className="grid grid-cols-3 gap-2">
                  {dayOptions.map((d) => {
                    const selected = date === d
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDate(d)}
                        className={`rounded-xl border p-3 text-sm transition ${
                          selected
                            ? 'border-primary bg-secondary'
                            : 'border-border bg-white hover:bg-muted/40'
                        }`}
                      >
                        {formatDayLabel(d, lang)}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Tech-off warning */}
              {date && !selectedTechAvailable && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <p className="font-medium">{t.techOff}</p>
                  <p className="mt-0.5">{t.pickAnother}</p>
                </div>
              )}

              {/* Time slots */}
              {date && selectedTechAvailable && (
                <div>
                  <label className="block text-sm font-medium mb-2">{t.pickTime}</label>
                  {slotsLoading ? (
                    <p className="text-sm text-muted-foreground">{t.loadingSlots}</p>
                  ) : slotsError ? (
                    <p className="text-sm text-red-600">{slotsError}</p>
                  ) : availableSlots.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t.noSlots}</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {availableSlots.map((slot) => {
                        const selected = time === slot
                        return (
                          <button
                            key={slot}
                            type="button"
                            onClick={() => setTime(slot)}
                            className={`rounded-xl border p-3 text-sm transition ${
                              selected
                                ? 'border-primary bg-secondary'
                                : 'border-border bg-white hover:bg-muted/40'
                            }`}
                          >
                            {formatTimeLabel(slot)}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ─── Step 4: Details ──────────────────────────────────────── */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t.firstName} *</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full px-4 py-3 border border-border rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t.lastName} *</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full px-4 py-3 border border-border rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t.phone} *</label>
                <input
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-4 py-3 border border-border rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t.email}</label>
                <input
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-border rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t.note}</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 border border-border rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>
              {submitError && (
                <p className="text-sm text-red-600">{submitError}</p>
              )}
            </div>
          )}

          {/* ─── Footer nav ───────────────────────────────────────────── */}
          <div className="flex items-center justify-between gap-3 mt-6 pt-4 border-t border-border">
            <button
              type="button"
              onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3 | 4) : s))}
              disabled={step === 1}
              className="px-5 py-3 rounded-xl border border-border bg-white text-sm font-medium disabled:opacity-40"
            >
              {t.back}
            </button>
            {step < 4 ? (
              <button
                type="button"
                onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3 | 4)}
                disabled={
                  (step === 1 && !canNextFromStep1) ||
                  (step === 2 && !canNextFromStep2) ||
                  (step === 3 && !canNextFromStep3)
                }
                className="flex-1 px-5 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40"
              >
                {t.next}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="flex-1 px-5 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40"
              >
                {submitting ? t.submitting : t.confirm}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}