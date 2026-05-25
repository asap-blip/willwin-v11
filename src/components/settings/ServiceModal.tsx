'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import type { Service } from '@/lib/types'

interface ServiceModalProps {
  open: boolean
  service: Service | null // null = add mode, populated = edit mode
  onClose: () => void
  onSaved: () => void
}

export function ServiceModal({ open, service, onClose, onSaved }: ServiceModalProps) {
  const [name, setName] = useState('')
  const [durationMinutes, setDurationMinutes] = useState(30)
  const [price, setPrice] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEdit = service !== null

  useEffect(() => {
    if (open) {
      setName(service?.name ?? '')
      setDurationMinutes(service?.duration_minutes ?? 30)
      setPrice(service?.price ?? 0)
      setSaving(false)
      setError(null)
    }
  }, [open, service])

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    setError(null)

    // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
    const { error: saveErr } =
      isEdit && service
        ? await supabase
            .from('services')
            .update({ name: name.trim(), duration_minutes: durationMinutes, price })
            .eq('id', service.id)
        : await supabase
            .from('services')
            .insert({ name: name.trim(), duration_minutes: durationMinutes, price, is_active: true })

    setSaving(false)
    if (saveErr) {
      setError(saveErr.message)
      return
    }
    onSaved()
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">{isEdit ? 'Edit Service' : 'Add Service'}</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          <fieldset>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </fieldset>

          <fieldset>
            <label className="block text-sm font-medium mb-1">Duration (minutes)</label>
            <input
              type="number"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10) || 0)}
              min={1}
              className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </fieldset>

          <fieldset>
            <label className="block text-sm font-medium mb-1">Price ($)</label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
              min={0}
              step={0.01}
              className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </fieldset>


          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}
