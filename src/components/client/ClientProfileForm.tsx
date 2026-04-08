'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { syncCustomerToLedger } from '@/lib/ledger-sync-client'
import type { Customer, TeamMember } from '@/lib/types'

interface ClientProfileFormProps {
  customer: Customer
  teamMembers: TeamMember[]
  onAlertChange: (alert: string | null) => void
}

export function ClientProfileForm({ customer, teamMembers, onAlertChange }: ClientProfileFormProps) {
  const [firstName, setFirstName] = useState(customer.first_name)
  const [lastName, setLastName] = useState(customer.last_name)
  const [phone, setPhone] = useState(customer.phone ?? '')
  const [email, setEmail] = useState(customer.email ?? '')
  const [birthday, setBirthday] = useState(customer.birthday ?? '')
  const [referredBy, setReferredBy] = useState(customer.referred_by ?? '')
  const [preferredTechId, setPreferredTechId] = useState(customer.preferred_tech_id ?? '')
  const [alert, setAlert] = useState(customer.alert ?? '')
  const [notes, setNotes] = useState(customer.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setSaving(true)
    setSaved(false)

    // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
    const { error } = await supabase
      .from('customers')
      .update({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        birthday: birthday.trim() || null,
        referred_by: referredBy.trim() || null,
        preferred_tech_id: preferredTechId || null,
        alert: alert.trim() || null,
        notes: notes.trim() || null,
      })
      .eq('id', customer.id)

    setSaving(false)

    if (!error) {
      // Fire-and-forget ledger sync (T04.5) — Steven's independent data layer
      syncCustomerToLedger({
        id: customer.id,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim(),
        email: email.trim() || null,
        language: customer.language ?? null,
        loyalty_tier: customer.loyalty_tier ?? null,
        loyalty_points: customer.loyalty_points ?? null,
      }).catch(console.error)

      setSaved(true)
      onAlertChange(alert.trim() || null)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  return (
    <div className="bg-white rounded-lg border border-border p-6 space-y-4">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Profile</h2>

      <fieldset>
        <label className="block text-sm font-medium mb-1">First name</label>
        <input
          type="text"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </fieldset>

      <fieldset>
        <label className="block text-sm font-medium mb-1">Last name</label>
        <input
          type="text"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </fieldset>

      <fieldset>
        <label className="block text-sm font-medium mb-1">Phone</label>
        <input
          type="text"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </fieldset>

      <fieldset>
        <label className="block text-sm font-medium mb-1">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Optional"
          className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </fieldset>

      <fieldset>
        <label className="block text-sm font-medium mb-1">Birthday</label>
        <input
          type="text"
          value={birthday}
          onChange={(e) => setBirthday(e.target.value)}
          placeholder="Optional"
          className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </fieldset>

      <fieldset>
        <label className="block text-sm font-medium mb-1">Referred by</label>
        <input
          type="text"
          value={referredBy}
          onChange={(e) => setReferredBy(e.target.value)}
          placeholder="Optional"
          className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </fieldset>

      <fieldset>
        <label className="block text-sm font-medium mb-1">Preferred tech</label>
        <select
          value={preferredTechId}
          onChange={(e) => setPreferredTechId(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">None</option>
          {teamMembers.map((tm) => (
            <option key={tm.id} value={tm.id}>{tm.name}</option>
          ))}
        </select>
      </fieldset>

      <fieldset>
        <label className="block text-sm font-medium mb-1">Alert</label>
        <input
          type="text"
          value={alert}
          onChange={(e) => setAlert(e.target.value)}
          placeholder="Visible as warning banner"
          className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </fieldset>

      <fieldset>
        <label className="block text-sm font-medium mb-1">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 border border-border rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </fieldset>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving || !firstName.trim() || !lastName.trim()}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-green-600">
            <Check className="h-4 w-4" />
            Saved
          </span>
        )}
      </div>
    </div>
  )
}
