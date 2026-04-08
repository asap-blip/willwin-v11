'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'

// T20 — Admin Signature input lives here so Stephany can control how the
// booking detail modal displays "Booked by X" for admin-created bookings.
// Writes straight to tenant_features.admin_signature.
export function GeneralTab() {
  const [signature, setSignature] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)

  async function load() {
    // TODO: scope to .eq('tenant_id', tenantId) when multi-tenant
    const { data, error: fetchErr } = await supabase
      .from('tenant_features')
      .select('tenant_id, admin_signature')
      .single()
    if (fetchErr) {
      setError(fetchErr.message)
      setLoading(false)
      return
    }
    setTenantId((data?.tenant_id as string) ?? null)
    setSignature((data?.admin_signature as string) ?? '')
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleSave() {
    if (!tenantId) return
    setSaving(true)
    setError(null)
    const { error: upErr } = await supabase
      .from('tenant_features')
      .update({ admin_signature: signature.trim() || null })
      .eq('tenant_id', tenantId)
    setSaving(false)
    if (upErr) {
      setError(upErr.message)
      return
    }
    setSavedAt(Date.now())
  }

  return (
    <div className="mt-4 space-y-8">
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Admin Signature
          </h2>
          <Button size="sm" onClick={handleSave} disabled={saving || loading || !tenantId}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>

        <div className="bg-white rounded-lg border border-border p-4 max-w-md">
          <label className="block text-sm font-medium mb-1">Admin signature</label>
          <p className="text-xs text-muted-foreground mb-2">
            Shown as &ldquo;Booked by…&rdquo; on admin-created bookings.
          </p>
          <input
            type="text"
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            placeholder="ST"
            disabled={loading}
            maxLength={32}
            className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:bg-muted"
          />
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {savedAt && !error && !saving && (
          <p className="mt-3 text-sm text-green-700">Saved.</p>
        )}
      </section>
    </div>
  )
}
