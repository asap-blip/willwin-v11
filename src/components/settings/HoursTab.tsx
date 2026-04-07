'use client'

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import type { BusinessHours } from '@/lib/types'
import { generateTimeSlots, formatTimeLabel } from '@/lib/calendar-helpers'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Full set of 30-minute slots (00:00 → 23:30) for the open/close pickers
const ALL_SLOTS = generateTimeSlots('00:00', '23:30')

export function HoursTab() {
  const [rows, setRows] = useState<BusinessHours[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function loadHours() {
    // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
    const { data } = await supabase
      .from('business_hours')
      .select('id, day_of_week, is_open, open_time, close_time')
      .order('day_of_week')
    setRows((data ?? []) as BusinessHours[])
    setLoading(false)
  }

  useEffect(() => {
    loadHours()
  }, [])

  // Render in calendar order — Sunday first
  const orderedRows = useMemo(() => {
    return [...rows].sort((a, b) => a.day_of_week - b.day_of_week)
  }, [rows])

  function updateRow(dayOfWeek: number, patch: Partial<BusinessHours>) {
    setRows((prev) =>
      prev.map((r) => (r.day_of_week === dayOfWeek ? { ...r, ...patch } : r)),
    )
  }

  async function handleSaveAll() {
    setSaving(true)
    setError(null)
    // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
    for (const row of rows) {
      // Guard against open_time >= close_time when the day is open
      if (row.is_open && row.open_time >= row.close_time) {
        setError(`${DAY_NAMES[row.day_of_week]}: open time must be before close time.`)
        setSaving(false)
        return
      }
      const { error: upErr } = await supabase
        .from('business_hours')
        .update({
          is_open: row.is_open,
          open_time: row.open_time,
          close_time: row.close_time,
        })
        .eq('id', row.id)
      if (upErr) {
        setError(`${DAY_NAMES[row.day_of_week]}: ${upErr.message}`)
        setSaving(false)
        return
      }
    }
    setSaving(false)
    setSavedAt(Date.now())
    loadHours()
  }

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Business Hours</h2>
        <Button size="sm" onClick={handleSaveAll} disabled={saving || loading || rows.length === 0}>
          {saving ? 'Saving...' : 'Save All'}
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No business hours rows found. Run the T12 schema migration.</p>
      ) : (
        <div className="bg-white rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left">
                <th className="px-4 py-2.5 font-medium text-muted-foreground">Day</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground">Open</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground">Open Time</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground">Close Time</th>
              </tr>
            </thead>
            <tbody>
              {orderedRows.map((row) => (
                <tr key={row.id} className="border-b border-border/50">
                  <td className="px-4 py-2.5 font-medium">{DAY_NAMES[row.day_of_week]}</td>
                  <td className="px-4 py-2.5">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={row.is_open}
                        onChange={(e) =>
                          updateRow(row.day_of_week, { is_open: e.target.checked })
                        }
                        className="h-4 w-4"
                      />
                      <span className={`text-xs font-medium ${row.is_open ? 'text-green-700' : 'text-muted-foreground'}`}>
                        {row.is_open ? 'Open' : 'Closed'}
                      </span>
                    </label>
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={row.open_time}
                      disabled={!row.is_open}
                      onChange={(e) => updateRow(row.day_of_week, { open_time: e.target.value })}
                      className="px-2 py-1.5 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:bg-muted disabled:text-muted-foreground"
                    >
                      {ALL_SLOTS.map((slot) => (
                        <option key={slot} value={slot}>{formatTimeLabel(slot)}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={row.close_time}
                      disabled={!row.is_open}
                      onChange={(e) => updateRow(row.day_of_week, { close_time: e.target.value })}
                      className="px-2 py-1.5 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:bg-muted disabled:text-muted-foreground"
                    >
                      {ALL_SLOTS.map((slot) => (
                        <option key={slot} value={slot}>{formatTimeLabel(slot)}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {savedAt && !error && !saving && (
        <p className="mt-3 text-sm text-green-700">Saved.</p>
      )}
    </div>
  )
}
