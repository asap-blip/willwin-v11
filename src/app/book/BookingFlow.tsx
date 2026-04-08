'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { syncCustomerToLedger } from '@/lib/ledger-sync-client'
import type { TeamMember, Service, BusinessHours, TechAvailability } from '@/lib/types'
import {
  generateTimeSlots,
  formatTimeLabel,
  addMinutesToTimeString,
  normalizeStartAt,
  getDayOfWeek,
  isTechAvailable,
} from '@/lib/calendar-helpers'

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

  // Language toggle — defaults to French (CLAUDE.md confirms customers.language default 'fr')
  const [lang, setLang] = useState<Lang>('fr')
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

  // Conflict-detection state for the current (date, tech) pair
  const [bookedSlots, setBookedSlots] = useState<{ start: string; durationMin: number }[]>([])

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
  const hoursForDay = useMemo<BusinessHours | null>(
    () => businessHours.find((h) => h.day_of_week === dayOfWeek) ?? null,
    [businessHours, dayOfWeek],
  )

  // Selected tech availability for the chosen date
  const selectedTechAvailable = useMemo(() => {
    if (!date) return true
    if (teamMemberId === NO_PREF) {
      // At least one active tech must work that day
      return teamMembers.some((tm) => isTechAvailable(techAvailability, tm.id, dayOfWeek))
    }
    return isTechAvailable(techAvailability, teamMemberId, dayOfWeek)
  }, [date, dayOfWeek, teamMemberId, teamMembers, techAvailability])

  // Fetch existing segments for the selected (tech, date). When "no preference"
  // we skip — slot filtering is per-tech and a tech is picked at submit time.
  useEffect(() => {
    if (!date || !hoursForDay || !hoursForDay.is_open) {
      setBookedSlots([])
      return
    }
    if (teamMemberId === NO_PREF) {
      setBookedSlots([])
      return
    }
    let cancelled = false
    async function load() {
      const dayStart = `${date} 00:00:00`
      const dayEnd = `${date}T23:59:59`
      // Same .neq filter as NewBookingModal — only CANCELLED frees the slot.
      const { data } = await supabase
        .from('appointment_segments')
        .select(`
          id,
          duration_minutes,
          booking:bookings!inner (start_at, status)
        `)
        .eq('team_member_id', teamMemberId)
        .gte('booking.start_at', dayStart)
        .lte('booking.start_at', dayEnd)
        .neq('booking.status', 'CANCELLED')
      if (cancelled) return
      const rows = (data ?? []).map((seg) => {
        const b = seg.booking as unknown as { start_at: string }
        return { start: normalizeStartAt(b.start_at), durationMin: seg.duration_minutes }
      })
      setBookedSlots(rows)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [date, teamMemberId, hoursForDay])

  // Conflict-free slots for the selected service. A slot is OK when adding the
  // service duration would not overlap any existing booking on this tech.
  const availableSlots = useMemo<string[]>(() => {
    if (!date || !hoursForDay || !hoursForDay.is_open || !selectedService) return []
    const all = generateTimeSlots(hoursForDay.open_time, hoursForDay.close_time)
    // Drop trailing close-time slot — bookings starting at close_time would
    // never fit. e.g. open 09:00 close 17:00 → start slots 09:00 … 16:30
    const candidates = all.slice(0, Math.max(0, all.length - 1))

    return candidates.filter((slot) => {
      const newStart = `${date} ${slot}`
      const newEnd = addMinutesToTimeString(newStart, selectedService.duration_minutes)
      // The whole booking must end at or before close_time
      const closeAt = `${date} ${hoursForDay.close_time}`
      if (newEnd > closeAt) return false
      // No overlap with existing bookings (skip when "no preference")
      if (teamMemberId === NO_PREF) return true
      for (const b of bookedSlots) {
        const existingEnd = addMinutesToTimeString(b.start, b.durationMin)
        // Overlap: existingStart < newEnd AND existingEnd > newStart
        if (b.start < newEnd && existingEnd > newStart) return false
      }
      return true
    })
  }, [date, hoursForDay, selectedService, bookedSlots, teamMemberId])

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
      // 1. Resolve customer by phone — reuse if exists, otherwise insert.
      const phoneTrim = phone.trim()
      const { data: existing } = await supabase
        .from('customers')
        .select('id')
        .eq('phone', phoneTrim)
        .maybeSingle()

      let customerId: string
      if (existing?.id) {
        customerId = existing.id
        // Update language preference on every booking — clients may switch UI.
        await supabase.from('customers').update({ language: lang }).eq('id', customerId)
        // Fire-and-forget ledger sync of the existing customer with refreshed lang.
        syncCustomerToLedger({
          id: customerId,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phoneTrim,
          email: email.trim() || null,
          language: lang,
        }).catch(console.error)
      } else {
        const { data: created, error: cErr } = await supabase
          .from('customers')
          .insert({
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            phone: phoneTrim,
            email: email.trim() || null,
            language: lang,
          })
          .select('id')
          .single()
        if (cErr || !created) throw cErr ?? new Error('customer insert failed')
        customerId = created.id
        // Fire-and-forget ledger sync of the freshly inserted customer.
        syncCustomerToLedger({
          id: customerId,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phoneTrim,
          email: email.trim() || null,
          language: lang,
        }).catch(console.error)
      }

      // 2. Resolve "no preference" → first available conflict-free tech.
      let resolvedTechId = teamMemberId
      const startAt = `${date} ${time}`
      const endAt = addMinutesToTimeString(startAt, selectedService.duration_minutes)

      if (resolvedTechId === NO_PREF) {
        const dow = getDayOfWeek(date)
        const candidates = teamMembers.filter((tm) =>
          isTechAvailable(techAvailability, tm.id, dow),
        )
        let found: string | null = null
        for (const tm of candidates) {
          const dayStart = `${date} 00:00:00`
          const dayEnd = `${date}T23:59:59`
          const { data: segs } = await supabase
            .from('appointment_segments')
            .select(`
              id,
              duration_minutes,
              booking:bookings!inner (start_at, status)
            `)
            .eq('team_member_id', tm.id)
            .gte('booking.start_at', dayStart)
            .lte('booking.start_at', dayEnd)
            .neq('booking.status', 'CANCELLED')
          const conflict = (segs ?? []).some((seg) => {
            const b = seg.booking as unknown as { start_at: string }
            const eStart = normalizeStartAt(b.start_at)
            const eEnd = addMinutesToTimeString(eStart, seg.duration_minutes)
            return eStart < endAt && eEnd > startAt
          })
          if (!conflict) {
            found = tm.id
            break
          }
        }
        if (!found) {
          setSubmitError(t.noAvail)
          setSubmitting(false)
          return
        }
        resolvedTechId = found
      }

      // 3. Insert booking — CONFIRMED + source='client' per spec
      const { data: booking, error: bErr } = await supabase
        .from('bookings')
        .insert({
          customer_id: customerId,
          start_at: startAt,
          status: 'CONFIRMED',
          notes: note.trim() || null,
          source: 'client',
        })
        .select('id')
        .single()
      if (bErr || !booking) throw bErr ?? new Error('booking insert failed')

      // 4. Insert appointment segment
      const { error: sErr } = await supabase.from('appointment_segments').insert({
        booking_id: booking.id,
        team_member_id: resolvedTechId,
        service_id: selectedService.id,
        duration_minutes: selectedService.duration_minutes,
      })
      if (sErr) throw sErr

      router.push(`/book/confirmation?id=${booking.id}`)
    } catch (err) {
      console.error('[BookingFlow] submit failed', err)
      setSubmitError(t.submitError)
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
        {/* Language toggle */}
        <div className="flex items-center rounded-full border border-border overflow-hidden text-sm">
          <button
            type="button"
            onClick={() => setLang('fr')}
            className={`px-3 py-1.5 ${lang === 'fr' ? 'bg-primary text-primary-foreground' : 'bg-white'}`}
          >
            FR
          </button>
          <button
            type="button"
            onClick={() => setLang('en')}
            className={`px-3 py-1.5 ${lang === 'en' ? 'bg-primary text-primary-foreground' : 'bg-white'}`}
          >
            EN
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
                      style={{ backgroundColor: tm.color }}
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
                  {availableSlots.length === 0 ? (
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
