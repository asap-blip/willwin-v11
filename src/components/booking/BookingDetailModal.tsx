'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { X, AlertTriangle, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import type { TeamMember, Service, BookingDetail, BusinessHours, TechAvailability } from '@/lib/types'
import {
  formatTimeLabel,
  roundToSlot,
  generateTimeSlots,
  getDayOfWeek,
  isTechAvailable,
} from '@/lib/calendar-helpers'
import { fetchBookingDetail, fetchCustomerVisitStats } from '@/lib/fetch-booking-detail'
import { addLoyaltyEvent } from '@/lib/loyalty-events'
import { TierBadge } from '@/components/loyalty/TierBadge'

// T-BUG-02 — booking status lifecycle. CANCELLED is set ONLY by the
// "Cancel Booking" button, never via this dropdown.
const EDITABLE_STATUSES = ['PENDING', 'CONFIRMED', 'ARRIVED', 'LATE', 'NO SHOW']

interface BookingDetailModalProps {
  open: boolean
  bookingId: string | null
  onClose: () => void
  onSaved: () => void | Promise<void>
  teamMembers: TeamMember[]
  businessHours: BusinessHours[]
  techAvailability: TechAvailability[]
  loyaltyEnabled: boolean
}

export function BookingDetailModal({
  open,
  bookingId,
  onClose,
  onSaved,
  teamMembers,
  businessHours,
  techAvailability,
  loyaltyEnabled,
}: BookingDetailModalProps) {
  // Loading state
  const [detail, setDetail] = useState<BookingDetail | null>(null)
  const [loading, setLoading] = useState(false)

  // Visit stats
  const [visitCount, setVisitCount] = useState(0)
  const [lastVisit, setLastVisit] = useState<string | null>(null)

  // Editable form fields — initialized from detail
  const [teamMemberId, setTeamMemberId] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [status, setStatus] = useState('PENDING')
  const [notes, setNotes] = useState('')

  // Services
  const [services, setServices] = useState<Service[]>([])
  const [saving, setSaving] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)

  // Fetch detail + services when modal opens
  useEffect(() => {
    if (!open || !bookingId) return
    setLoading(true)
    setConfirmCancel(false)
    setDetail(null)

    async function load() {
      const [det, svcResult] = await Promise.all([
        fetchBookingDetail(bookingId!),
        // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
        supabase
          .from('services')
          .select('id, name, duration_minutes, price, is_active')
          .eq('is_active', true)
          .order('name'),
      ])

      setServices(svcResult.data ?? [])

      if (det) {
        setDetail(det)
        setTeamMemberId(det.team_member_id)
        // Slice date and time from start_at — string only, never new Date()
        setDate(det.start_at.slice(0, 10))
        setTime(roundToSlot(det.start_at.slice(11, 16)))
        setServiceId(det.service_id)
        setStatus(det.status)
        setNotes(det.notes ?? '')

        // Fetch visit stats
        const stats = await fetchCustomerVisitStats(det.customer_id)
        setVisitCount(stats.visitCount)
        setLastVisit(stats.lastVisit)
      }

      setLoading(false)
    }

    load()
  }, [open, bookingId])

  const selectedService = services.find((s) => s.id === serviceId) ?? null

  // Day-of-week + business hours derived from the currently-selected date
  const dayOfWeek = useMemo(() => (date ? getDayOfWeek(date) : 0), [date])
  const hoursForDay = useMemo<BusinessHours | undefined>(
    () => businessHours.find((h) => h.day_of_week === dayOfWeek),
    [businessHours, dayOfWeek],
  )
  const isClosed = !!date && (!hoursForDay || !hoursForDay.is_open)
  const slotsForDay = useMemo(
    () => (isClosed || !hoursForDay ? [] : generateTimeSlots(hoursForDay.open_time, hoursForDay.close_time)),
    [hoursForDay, isClosed],
  )
  // Selected tech's availability on the chosen date. The dropdown shows the
  // full team list (the originally-assigned tech may legitimately be off);
  // Save is disabled and a warning shown when the picked tech is off.
  const selectedTechAvailable = useMemo(
    () => (teamMemberId ? isTechAvailable(techAvailability, teamMemberId, dayOfWeek) : true),
    [techAvailability, teamMemberId, dayOfWeek],
  )

  async function handleSave() {
    if (!detail || !selectedService) return
    setSaving(true)

    // Bug A — capture prevStatus from the ORIGINAL fetched booking data
    // (`detail.status`), NOT from the form `status` state. `detail` is
    // populated once in the load effect and is never mutated by edits, so
    // it preserves what the DB had when the modal opened. `status` is the
    // form value the user just chose.
    const prevStatus = detail.status
    const newStatus = status

    // Loyalty debug instrumentation — confirms prev/new are read correctly
    // before the Supabase update fires. Removable once loyalty rules are
    // confirmed stable in production.
    console.log('[BookingDetailModal] save', {
      bookingId: detail.booking_id,
      customerId: detail.customer_id,
      prevStatus,
      newStatus,
      loyaltyEnabled,
    })

    // Assemble start_at as TEXT — space separated, no T, no seconds, never new Date()
    const startAt = `${date} ${time}`

    // Update booking
    // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
    const { error: bkErr } = await supabase
      .from('bookings')
      .update({
        start_at: startAt,
        status: newStatus,
        notes: notes.trim() || null,
      })
      .eq('id', detail.booking_id)

    if (bkErr) {
      setSaving(false)
      return
    }

    // Update appointment segment
    // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
    const { error: segErr } = await supabase
      .from('appointment_segments')
      .update({
        team_member_id: teamMemberId,
        service_id: serviceId,
        duration_minutes: selectedService.duration_minutes,
      })
      .eq('id', detail.segment_id)

    if (segErr) {
      setSaving(false)
      return
    }

    // Loyalty side effects — only when the feature flag is on. Each rule
    // checks its own per-event transition gate so saves that don't move
    // status never double-credit.
    if (loyaltyEnabled) {
      // T-BUG-02 — VISIT_SPEND fires ONLY when status transitions into
      // ARRIVED. CONFIRMED no longer earns points. Lifecycle is:
      //   PENDING → CONFIRMED → ARRIVED   (points fire here)
      if (newStatus === 'ARRIVED' && prevStatus !== 'ARRIVED') {
        console.log('[BookingDetailModal] firing VISIT_SPEND', {
          customerId: detail.customer_id,
          points: selectedService.price,
        })
        await addLoyaltyEvent(
          detail.customer_id,
          'VISIT_SPEND',
          selectedService.price,
          'Auto: visit spend',
          detail.booking_id,
        )
        // Update last_visit_at to the booking date (sliced — never new Date())
        // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
        await supabase
          .from('customers')
          .update({ last_visit_at: detail.start_at.slice(0, 10) })
          .eq('id', detail.customer_id)
      }

      // Bug C — LATE_CANCEL_PENALTY: newStatus === 'LATE' AND prevStatus !== 'LATE'
      if (newStatus === 'LATE' && prevStatus !== 'LATE') {
        console.log('[BookingDetailModal] firing LATE_CANCEL_PENALTY', {
          customerId: detail.customer_id,
        })
        await addLoyaltyEvent(
          detail.customer_id,
          'LATE_CANCEL_PENALTY',
          -10,
          'Auto: late',
          detail.booking_id,
        )
      }

      // NO_SHOW_PENALTY: newStatus === 'NO SHOW' AND prevStatus !== 'NO SHOW'
      if (newStatus === 'NO SHOW' && prevStatus !== 'NO SHOW') {
        console.log('[BookingDetailModal] firing NO_SHOW_PENALTY', {
          customerId: detail.customer_id,
        })
        await addLoyaltyEvent(
          detail.customer_id,
          'NO_SHOW_PENALTY',
          -25,
          'Auto: no-show',
          detail.booking_id,
        )
      }

      // Reversals — when status moves AWAY from a penalty state, compensate
      // the prior penalty so the customer is made whole. The dedupe in
      // addLoyaltyEvent (per booking + event_type) ensures each reversal
      // can only fire once per booking even if the user toggles back and
      // forth.
      if (prevStatus === 'NO SHOW' && newStatus !== 'NO SHOW') {
        console.log('[BookingDetailModal] firing NO_SHOW_REVERSAL', {
          customerId: detail.customer_id,
        })
        await addLoyaltyEvent(
          detail.customer_id,
          'NO_SHOW_REVERSAL',
          25,
          'Auto: status corrected',
          detail.booking_id,
        )
      }

      if (prevStatus === 'LATE' && newStatus !== 'LATE') {
        console.log('[BookingDetailModal] firing LATE_REVERSAL', {
          customerId: detail.customer_id,
        })
        await addLoyaltyEvent(
          detail.customer_id,
          'LATE_REVERSAL',
          10,
          'Auto: status corrected',
          detail.booking_id,
        )
      }
    }

    // Bug 2 fix: AWAIT the parent's reload so the booking grid actually has
    // the new status painted before the modal closes. Without the await this
    // was a fire-and-forget call that raced with onClose() — the calendar
    // appeared to keep the old status until another booking was touched.
    await onSaved()
    setSaving(false)
    onClose()
  }

  async function handleCancelBooking() {
    if (!detail) return
    setCancelling(true)

    // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'CANCELLED' })
      .eq('id', detail.booking_id)

    if (error) {
      setCancelling(false)
      return
    }

    // Bug 2 fix: await the parent reload before closing so the cancelled
    // booking disappears from the grid in the same tick.
    await onSaved()
    setCancelling(false)
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay — Bug 2: dismissing the modal must NEVER call onSaved.
          onSaved fires only from handleSave / handleCancelBooking. */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel — wider for two-panel layout */}
      <div className="relative z-10 bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold truncate">
            {loading
              ? 'Loading...'
              : detail
                ? `${detail.customer_first_name} ${detail.customer_last_name} — ${selectedService?.name ?? detail.service_name}`
                : 'Booking Detail'}
          </h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground flex-shrink-0 ml-4">
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="px-6 py-12 text-center text-muted-foreground">Loading booking...</div>
        ) : !detail ? (
          <div className="px-6 py-12 text-center text-muted-foreground">Booking not found</div>
        ) : (
          <>
            {/* Body — two panels */}
            <div className="flex-1 overflow-y-auto">
              <div className="flex flex-col md:flex-row">
                {/* Left panel — Client Card */}
                <div className="md:w-1/2 p-6 md:border-r border-border space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Client</h3>

                  {/* Name + phone */}
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      <User className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/clients/${detail.customer_id}`}
                          className="text-sm font-medium text-primary hover:underline"
                        >
                          {detail.customer_first_name} {detail.customer_last_name}
                        </Link>
                        {loyaltyEnabled && detail.customer_tier && (
                          <TierBadge tier={detail.customer_tier} />
                        )}
                      </div>
                      {detail.customer_phone && (
                        <p className="text-sm text-muted-foreground">{detail.customer_phone}</p>
                      )}
                    </div>
                  </div>

                  {/* Alert banner */}
                  {detail.customer_alert && (
                    <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-md">
                      <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-amber-800">{detail.customer_alert}</p>
                    </div>
                  )}

                  {/* Client notes */}
                  {detail.customer_notes && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
                      <p className="text-sm text-foreground">{detail.customer_notes}</p>
                    </div>
                  )}

                  {/* Visit stats */}
                  <div className="flex gap-6 pt-2 border-t border-border">
                    <div>
                      <p className="text-xs text-muted-foreground">Visits</p>
                      <p className="text-sm font-semibold">{visitCount}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Last visit</p>
                      <p className="text-sm font-semibold">{lastVisit ?? '—'}</p>
                    </div>
                  </div>
                </div>

                {/* Right panel — Appointment */}
                <div className="md:w-1/2 p-6 space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Appointment</h3>

                  {/* Tech — only techs who work on this day of week.
                      The currently-assigned tech is always retained even if they don't work today. */}
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
                        This tech is off on the selected day.
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

                  {/* Time — slots are limited to business hours for this day.
                      The currently-saved time is always retained as a fallback. */}
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
                        {(slotsForDay.includes(time) ? slotsForDay : [time, ...slotsForDay]).map((slot) => (
                          <option key={slot} value={slot}>{formatTimeLabel(slot)}</option>
                        ))}
                      </select>
                    )}
                  </fieldset>

                  {/* Service */}
                  <fieldset>
                    <label className="block text-sm font-medium mb-1">Service</label>
                    <select
                      value={serviceId}
                      onChange={(e) => setServiceId(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} — {s.duration_minutes} min — ${s.price}
                        </option>
                      ))}
                    </select>
                  </fieldset>

                  {/* Price + Duration — read-only, derived from service */}
                  {selectedService && (
                    <div className="flex gap-6">
                      <div>
                        <p className="text-xs text-muted-foreground">Price</p>
                        <p className="text-sm font-semibold">${selectedService.price}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Duration</p>
                        <p className="text-sm font-semibold">{selectedService.duration_minutes} min</p>
                      </div>
                    </div>
                  )}

                  {/* Status */}
                  <fieldset>
                    <label className="block text-sm font-medium mb-1">Status</label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {EDITABLE_STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
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
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-border">
              {/* Cancel booking — left side */}
              <div>
                {!confirmCancel ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setConfirmCancel(true)}
                  >
                    Cancel Booking
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-destructive">Cancel this booking?</span>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleCancelBooking}
                      disabled={cancelling}
                    >
                      {cancelling ? 'Cancelling...' : 'Yes'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmCancel(false)}
                    >
                      No
                    </Button>
                  </div>
                )}
              </div>

              {/* Save + close — right side */}
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={onClose}>Close</Button>
                <Button onClick={handleSave} disabled={saving || !selectedService || isClosed || !selectedTechAvailable}>
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
