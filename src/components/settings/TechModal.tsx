'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import type { TeamMember } from '@/lib/types'

const COLOR_PALETTE = [
  { name: 'Purple', hex: '#8B5CF6' },
  { name: 'Pink', hex: '#EC4899' },
  { name: 'Amber', hex: '#F59E0B' },
  { name: 'Green', hex: '#10B981' },
  { name: 'Blue', hex: '#3B82F6' },
  { name: 'Red', hex: '#EF4444' },
  { name: 'Teal', hex: '#14B8A6' },
]

// Display Mon → Sun, but day numbers map to JS getDay() (0 = Sun, 1 = Mon ...)
const DAY_OPTIONS: { num: number; label: string }[] = [
  { num: 1, label: 'Mon' },
  { num: 2, label: 'Tue' },
  { num: 3, label: 'Wed' },
  { num: 4, label: 'Thu' },
  { num: 5, label: 'Fri' },
  { num: 6, label: 'Sat' },
  { num: 0, label: 'Sun' },
]

const DEFAULT_WORKING_DAYS = '1,2,3,4,5,6'

function parseWorkingDays(raw: string | null | undefined): number[] {
  if (raw === null || raw === undefined) return [1, 2, 3, 4, 5, 6]
  if (raw.trim() === '') return []
  return raw
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n))
}

function serializeWorkingDays(days: number[]): string {
  return [...days].sort((a, b) => a - b).join(',')
}

interface TechModalProps {
  open: boolean
  member: TeamMember | null // null = add mode
  onClose: () => void
  onSaved: () => void
}

export function TechModal({ open, member, onClose, onSaved }: TechModalProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(COLOR_PALETTE[0].hex)
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5, 6])
  const [saving, setSaving] = useState(false)

  const isEdit = member !== null

  useEffect(() => {
    if (open) {
      setName(member?.name ?? '')
      setColor(member?.color ?? COLOR_PALETTE[0].hex)
      setWorkingDays(
        member ? parseWorkingDays(member.working_days) : parseWorkingDays(DEFAULT_WORKING_DAYS),
      )
      setSaving(false)
    }
  }, [open, member])

  function toggleDay(num: number) {
    setWorkingDays((prev) =>
      prev.includes(num) ? prev.filter((d) => d !== num) : [...prev, num],
    )
  }

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)

    const workingDaysStr = serializeWorkingDays(workingDays)

    if (isEdit && member) {
      // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
      await supabase
        .from('team_members')
        .update({ name: name.trim(), color, working_days: workingDaysStr })
        .eq('id', member.id)
    } else {
      // TODO: include tenant_id when tenant_id column exists
      await supabase
        .from('team_members')
        .insert({ name: name.trim(), color, is_active: true, working_days: workingDaysStr })
    }

    setSaving(false)
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
          <h2 className="text-lg font-semibold">{isEdit ? 'Edit Tech' : 'Add Tech'}</h2>
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
            <label className="block text-sm font-medium mb-2">Color</label>
            <div className="flex gap-2">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  title={c.name}
                  onClick={() => setColor(c.hex)}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${color === c.hex ? 'border-foreground scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>
          </fieldset>

          <fieldset>
            <label className="block text-sm font-medium mb-2">Working Days</label>
            <div className="flex flex-wrap gap-2">
              {DAY_OPTIONS.map((d) => {
                const checked = workingDays.includes(d.num)
                return (
                  <label
                    key={d.num}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border cursor-pointer text-xs font-medium transition-colors ${
                      checked
                        ? 'bg-primary/10 border-primary text-primary'
                        : 'bg-white border-border text-muted-foreground hover:bg-muted/40'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleDay(d.num)}
                      className="h-3.5 w-3.5"
                    />
                    {d.label}
                  </label>
                )
              })}
            </div>
          </fieldset>
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
