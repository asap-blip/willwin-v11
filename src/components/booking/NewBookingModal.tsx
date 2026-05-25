'use client'

import { useState, useEffect, useMemo } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { getFeatures } from '@/lib/features'
import type { TeamMember, Service, BusinessHours, TechAvailability } from '@/lib/types'
import {
  formatTimeLabel,
  roundToSlot,
  addMinutesToTimeString,
  normalizeStartAt,
  generateTimeSlots,
  getDayOfWeek,
  isTechAvailable,
} from '@/lib/calendar-helpers'
import { groupServicesByCategory } from '@/lib/service-categories'
import { ClientSearch } from './ClientSearch'

interface SelectedClient {
  id: string
  first_name: string
  last_name: string
}

interface NewBookingModalProps {
  open: boolean
  onClose: () => void
  onSaved: () => void | Promise<void>
  teamMembers: TeamMember[]
  businessHours: BusinessHours[]
  techAvailability: TechAvailability[]
  prefilledTeamMemberId: string
  prefilledDate: string   // YYYY-MM-DD
  prefilledTime: string   // HH:MM
}

export function NewBookingModal({
  open,
  onClose,
  onSaved,
  teamMembers,
  businessHours,
  techAvailability,
  prefilledTeamMemberId,
  prefilledDate,
  prefilledTime,
}: NewBookingModalProps) {
  // Form state
  const [selectedClient, setSelectedClient] = useState<SelectedClient | null>(null)
  const [teamMemberId, setTeamMemberId] = useState(prefilledTeamMemberId)
  const [date, setDate] = useState(prefilledDate)
  const [time, setTime] = useState(roundToSlot(prefilledTime))
  const [serviceId, setServiceId] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // Services fetched on mount
  const [services, setServices] = useState<Service[]>([])
  const [servicesLoaded, setServicesLoaded] = useState(false)

  // T-FEAT-03 — tenant feature flag gates the whole "Best Available" UI
  const [gapOptimization, setGapOptimization] = useState(false)
  const [bestLoading, setBestLoading] = useState(false)
  const [bestError, setBestError] = useState<string | null>(null)

  // Day-of-week + business hours for the selected date
  const dayOfWeek = useMemo(() => getDayOfWeek(date), [date])
  const hoursForDay = useMemo<BusinessHours | undefined>(
    () => businessHours.find((h) => h.day_of_week === dayOfWeek),
    [businessHours, dayOfWeek],
  )
  const isClosed = !hoursForDay || !hoursForDay.is_open
  const slotsForDay = useMemo(
    () => (isClosed || !hoursForDay ? [] : generateTimeSlots(hoursForDay.open_time, hoursForDay.close_time)),
    [hoursForDay, isClosed],
  )
  // Selected tech's availability on the chosen date. Spec: do not filter the
  // dropdown — show all techs and warn + disable Save when the selection is off.
  const selectedTechAvailable = useMemo(
    () => (teamMemberId ? isTechAvailable(techAvailability, teamMemberId, dayOfWeek) : true),
    [techAvailability, teamMemberId, dayOfWeek],
  )

  // Clamp time to the open window when the selected date changes
  useEffect(() => {
    if (!open || isClosed || slotsForDay.length === 0) return
    if (!slotsForDay.includes(time)) {
      setTime(slotsForDay[0])
    }
  }, [open, isClosed, slotsForDay, time])

  // Reset form when modal opens with new prefill values
  useEffect(() => {
    if (open) {
      setSelectedClient(null)
      setTeamMemberId(prefilledTeamMemberId)
      setDate(prefilledDate)
      setTime(roundToSlot(prefilledTime))
      setServiceId(null)
      setNotes('')
      setSaving(false)
      setConflict(null)
      setChecking(false)
    }
  }, [open, prefilledTeamMemberId, prefilledDate, prefilledTime])

  // Fetch services once when modal opens
  useEffect(() => {
    if (!open) return
    async function loadServices() {
      // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
      const { data } = await supabase
        .from('services')
        .select('id, name, duration_minutes, price, is_active')
        .eq('is_active', true)
        .order('name')
      setServices(data ?? [])
      setServicesLoaded(true)
    }
    loadServices()
  }, [open])

  // T-FEAT-03 — fetch the gap_optimization feature flag on open. Resolved
  // once per modal open; falls back to false on any fetch failure so a
  // broken tenant_features row never flashes the button.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    async function loadFlag() {
      const features = await getFeatures()
      if (cancelled) return
      setGapOptimization(features?.gap_optimization ?? false)
    }
    loadFlag()
    return () => {
      cancelled = true
    }
  }, [open])

  // Reset the best-available error message whenever the user touches the
  // date / tech / service so a stale "no slots" never lingers.
  useEffect(() => {
    setBestError(null)
  }, [date, teamMemberId, serviceId])

  const selectedServiceForBest = services.find((s) => s.id === serviceId) ?? null
  const canUseBestAvailable =
    gapOptimization && !!date && !!selectedServiceForBest && !bestLoading

  async function handleBestAvailable() {
    if (!canUseBestAvailable || !selectedServiceForBest) return
    setBestLoading(true)
    setBestError(null)
    try {
      const res = await fetch('/api/booking/best-available', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          // team_member_id is null = "any tech" — the endpoint scores
          // across every available tech for the day and returns the
          // winner.
          team_member_id: teamMemberId || null,
          service_id: selectedServiceForBest.id,
          duration_minutes: selectedServiceForBest.duration_minutes,
        }),
      })
      const data = (await res.json()) as {
        slot: string | null
        team_member_id?: string
        tech_name?: string
      }
      if (!data.slot) {
        setBestError('No available slots for this date.')
        return
      }
      // Auto-fill time, and tech if it came back different (or the user
      // was in "any tech" mode with teamMemberId === '').
      setTime(data.slot)
      if (data.team_member_id && data.team_member_id !== teamMemberId) {
        setTeamMemberId(data.team_member_id)
      }
    } catch (err) {
      console.error('[best-available] fetch failed', err)
      setBestError('Could not compute best slot.')
    } finally {
      setBestLoading(false)
    }
  }

  // Conflict check state
  const [conflict, setConflict] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  const selectedService = services.find((s) => s.id === serviceId) ?? null
  const servicesEmpty = servicesLoaded && services.length === 0

  // Check for conflicts whenever tech, date, time, or service changes
  useEffect(() => {
    if (!open || !teamMemberId || !date || !time || !selectedService) {
      setConflict(null)
      return
    }

    let cancelled = false
    async function checkConflict() {
      setChecking(true)

      const newStartAt = `${date} ${time}`
      const newEndAt = addMinutesToTimeString(newStartAt, selectedService!.duration_minutes)

      // Find existing segments for this tech on this date that overlap
      // Overlap condition: existing start < new end AND existing end > new start
      // Use space for dayStart, T for dayEnd per CLAUDE.md permanent rules
      const dayStart = `${date} 00:00:00`
      const dayEnd = `${date}T23:59:59`

      // T-BUG-01 — Slot blocking rule:
      //   ALL booking statuses block a slot EXCEPT 'CANCELLED'.
      //   That includes NO SHOW, LATE, ARRIVED, and CONFIRMED.
      // The .neq filter is namespaced to the joined `booking.status` column
      // (NOT `appointment_segments.status` — that column does not exist).
      // Combined with `bookings!inner`, segments whose booking is CANCELLED
      // are excluded entirely from the result set.
      // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
      const { data: segments } = await supabase
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

      // Check overlap using string comparison. Both sides MUST be in canonical
      // "YYYY-MM-DD HH:MM" form — Supabase can return start_at with a 'T'
      // separator or trailing seconds, and char-level compare against the
      // space-separated newEndAt then silently misfires (T-BUG-01 root cause).
      const hasConflict = (segments ?? []).some((seg) => {
        const booking = seg.booking as unknown as { start_at: string }
        const existingStart = normalizeStartAt(booking.start_at)
        const existingEnd = addMinutesToTimeString(existingStart, seg.duration_minutes)
        // Overlap: existingStart < newEnd AND existingEnd > newStart
        return existingStart < newEndAt && existingEnd > newStartAt
      })

      if (hasConflict) {
        const techName = teamMembers.find((tm) => tm.id === teamMemberId)?.name ?? 'Tech'
        setConflict(`Conflict: ${techName} already has a booking at this time.`)
      } else {
        setConflict(null)
      }
      setChecking(false)
    }

    checkConflict()
    return () => { cancelled = true }
  }, [open, teamMemberId, date, time, selectedService, teamMembers])

  const canSave =
    selectedClient &&
    serviceId &&
    !servicesEmpty &&
    !saving &&
    !conflict &&
    !checking &&
    !isClosed &&
    selectedTechAvailable

  async function handleSave() {
    if (!canSave || !selectedClient || !serviceId || !selectedService) return
    setSaving(true)

    // Assemble start_at as TEXT — space separated, no T, no seconds, never new Date()
    const startAt = `${date} ${time}`

    // Insert booking
    // TODO: include tenant_id when tenant_id column exists
    const { data: booking, error: bkErr } = await supabase
      .from('bookings')
      .insert({
        // T-BUG-02 — new bookings start as PENDING (awaiting SMS confirmation).
        // Lifecycle: PENDING → CONFIRMED → ARRIVED. CANCELLED frees the slot.
        customer_id: selectedClient.id,
        start_at: startAt,
        status: 'PENDING',
        notes: notes.trim() || null,
      })
      .select('id')
      .single()

    if (bkErr || !booking) {
      setSaving(false)
      return
    }

    // Insert appointment segment
    // TODO: include tenant_id when tenant_id column exists
    const { error: segErr } = await supabase
      .from('appointment_segments')
      .insert({
        booking_id: booking.id,
        team_member_id: teamMemberId,
        service_id: serviceId,
        duration_minutes: selectedService.duration_minutes,
      })

    if (segErr) {
      setSaving(false)
      return
    }

    // Bug 2 fix companion: await reload before close so the new booking
    // is painted on the calendar grid before the modal disappears.
    await onSaved()
    setSaving(false)
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="relative z-10 bg-white rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">New Booking</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Client */}
          <fieldset>
            <label className="block text-sm font-medium mb-1">Client</label>
            <ClientSearch
              selectedClient={selectedClient}
              onSelect={setSelectedClient}
            />
          </fieldset>

          {/* Tech — full list; warn inline when the selection is off this day */}
          <fieldset>
            <label className="block text-sm font-medium mb-1">Tech</label>
            <select
              value={teamMemberId}
              onChange={(e) => setTeamMemberId(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {teamMembers.map((tm) => (
                <option key={tm.id} value={tm.id}>{tm.name}</option>
              ))}
            </select>
            {!selectedTechAvailable && (
              <p className="mt-1.5 text-sm text-amber-600">
                This tech is off on the selected day. Pick another tech or change the date.
              </p>
            )}
          </fieldset>

          {/* Date */}
          <fieldset>
            <label className="block text-sm font-medium mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </fieldset>

          {/* Time — slots are limited to business hours for this day */}
          <fieldset>
            <label className="block text-sm font-medium mb-1">Time</label>
            {isClosed ? (
              <p className="text-sm text-amber-600">The salon is closed on this day.</p>
            ) : (
              <select
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {slotsForDay.map((slot) => (
                  <option key={slot} value={slot}>{formatTimeLabel(slot)}</option>
                ))}
              </select>
            )}
            {conflict && (
              <p className="mt-1.5 text-sm text-red-600">{conflict}</p>
            )}

            {/* T-FEAT-03 — Best Available button, gap_optimization-gated.
                Disabled until date AND service are selected. Scored
                server-side; autofills time (and tech when "any tech"). */}
            {gapOptimization && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={handleBestAvailable}
                  disabled={!canUseBestAvailable}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-white text-xs font-medium hover:bg-muted/40 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ color: 'var(--rs-text-primary)' }}
                >
                  {bestLoading ? (
                    <>
                      <span className="inline-block h-3 w-3 rounded-full border-2 border-muted-foreground/40 border-t-transparent animate-spin" />
                      Finding best slot…
                    </>
                  ) : (
                    <>✨ Best Available</>
                  )}
                </button>
                {bestError && (
                  <p className="mt-1.5 text-xs text-amber-600">{bestError}</p>
                )}
              </div>
            )}
          </fieldset>

          {/* Service */}
          <fieldset>
            <label className="block text-sm font-medium mb-1">Service</label>
            {servicesEmpty ? (
              <p className="text-sm text-amber-600">No services found — add services first</p>
            ) : (
              <select
                value={serviceId ?? ''}
                onChange={(e) => setServiceId(e.target.value || null)}
                className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select a service...</option>
                {groupServicesByCategory(services).map((group) => (
                  <optgroup key={group.key} label={group.label}>
                    {group.services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} — {s.duration_minutes} min — ${s.price}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            )}
          </fieldset>

          {/* Status — new bookings always start as PENDING (read-only display) */}
          <fieldset>
            <label className="block text-sm font-medium mb-1">Status</label>
            <span className="inline-block px-2.5 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-700">
              PENDING
            </span>
          </fieldset>

          {/* Notes */}
          <fieldset>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Optional notes..."
              className="w-full px-3 py-2 border border-border rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </fieldset>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}
