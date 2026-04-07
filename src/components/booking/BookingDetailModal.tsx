'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { X, AlertTriangle, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import type { TeamMember, Service, BookingDetail, BusinessHours } from '@/lib/types'
import {
  formatTimeLabel,
  roundToSlot,
  generateTimeSlots,
  getDayOfWeek,
  techWorksOnDay,
} from '@/lib/calendar-helpers'
import { fetchBookingDetail, fetchCustomerVisitStats } from '@/lib/fetch-booking-detail'
import { addLoyaltyEvent } from '@/lib/loyalty-events'
import { TierBadge } from '@/components/loyalty/TierBadge'

const EDITABLE_STATUSES = ['CONFIRMED', 'ARRIVED', 'LATE', 'NO SHOW']

interface BookingDetailModalProps {
  open: boolean
  bookingId: string | null
  onClose: () => void
  onSaved: () => void
  teamMembers: TeamMember[]
  businessHours: BusinessHours[]
  loyaltyEnabled: boolean
}

export function BookingDetailModal({
  open,
  bookingId,
  onClose,
  onSaved,
  teamMembers,
  businessHours,
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
  const [status, setStatus] = useState('CONFIRMED')
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
  const techsForDay = useMemo(
    () => teamMembers.filter((tm) => techWorksOnDay(tm.working_days, dayOfWeek)),
    [teamMembers, dayOfWeek],
  )

  async function handleSave() {
    if (!detail || !selectedService) return
    setSaving(true)

    // Capture previous status for loyalty event diffing
    const prevStatus = detail.status
    const newStatus = status

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

    // Loyalty side effects — only when the feature flag is on.
    // Fire on status transitions, never retroactively.
    if (loyaltyEnabled) {
      const wasVisit = prevStatus === 'ARRIVED' || prevStatus === 'CONFIRMED'
      const isVisit = newStatus === 'ARRIVED' || newStatus === 'CONFIRMED'

      if (isVisit && !wasVisit) {
        // VISIT_SPEND uses the service price as the points value
        await addLoyaltyEvent(
          detail.customer_id,
          'VISIT_SPEND',
          selectedService.price,
          'Auto: visit spend',
        )
        // Update last_visit_at to the booking date (sliced — never new Date())
        // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
        await supabase
          .from('customers')
          .update({ last_visit_at: startAt.slice(0, 10) })
          .eq('id', detail.customer_id)
      }

      if (newStatus === 'NO SHOW' && prevStatus !== 'NO SHOW') {
        await addLoyaltyEvent(
          detail.customer_id,
          'NO_SHOW_PENALTY',
          -25,
          'Auto: no-show',
        )
      }
    }

    setSaving(false)
    onSaved()
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

    setCancelling(false)
    if (error) return

    onSaved()
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
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
                      {(() => {
                        const techIds = new Set(techsForDay.map((t) => t.id))
                        const list = [...techsForDay]
                        if (teamMemberId && !techIds.has(teamMemberId)) {
                          const current = teamMembers.find((t) => t.id === teamMemberId)
                          if (current) list.unshift(current)
                        }
                        return list.map((tm) => (
                          <option key={tm.id} value={tm.id}>{tm.name}</option>
                        ))
                      })()}
                    </select>
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
                <Button onClick={handleSave} disabled={saving || !selectedService || isClosed}>
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
