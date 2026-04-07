'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import type { TeamMember, Service } from '@/lib/types'
import { TIME_SLOTS, formatTimeLabel, roundToSlot, addMinutesToTimeString } from '@/lib/calendar-helpers'
import { ClientSearch } from './ClientSearch'

interface SelectedClient {
  id: string
  first_name: string
  last_name: string
}

interface NewBookingModalProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  teamMembers: TeamMember[]
  prefilledTeamMemberId: string
  prefilledDate: string   // YYYY-MM-DD
  prefilledTime: string   // HH:MM
}

export function NewBookingModal({
  open,
  onClose,
  onSaved,
  teamMembers,
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

      // Check overlap using string comparison — works because format is consistent
      const hasConflict = (segments ?? []).some((seg) => {
        const booking = seg.booking as unknown as { start_at: string }
        const existingStart = booking.start_at
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

  const canSave = selectedClient && serviceId && !servicesEmpty && !saving && !conflict && !checking

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
        customer_id: selectedClient.id,
        start_at: startAt,
        status: 'CONFIRMED',
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

    onSaved()
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

          {/* Tech */}
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

          {/* Time */}
          <fieldset>
            <label className="block text-sm font-medium mb-1">Time</label>
            <select
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {TIME_SLOTS.map((slot) => (
                <option key={slot} value={slot}>{formatTimeLabel(slot)}</option>
              ))}
            </select>
            {conflict && (
              <p className="mt-1.5 text-sm text-red-600">{conflict}</p>
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
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {s.duration_minutes} min — ${s.price}
                  </option>
                ))}
              </select>
            )}
          </fieldset>

          {/* Status */}
          <fieldset>
            <label className="block text-sm font-medium mb-1">Status</label>
            <span className="inline-block px-2.5 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
              CONFIRMED
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
