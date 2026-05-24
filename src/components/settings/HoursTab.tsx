'use client'

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import type { BusinessHours, TeamMember, TechAvailability } from '@/lib/types'
import { generateTimeSlots, formatTimeLabel } from '@/lib/calendar-helpers'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const DAY_ORDER: number[] = [1, 2, 3, 4, 5, 6, 0]
const ALL_SLOTS = generateTimeSlots('00:00', '23:30')

export function HoursTab() {
  const [rows, setRows] = useState<BusinessHours[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [techs, setTechs] = useState<TeamMember[]>([])
  const [availability, setAvailability] = useState<Record<string, Set<number>>>({})
  const [techsLoading, setTechsLoading] = useState(true)
  const [techsSaving, setTechsSaving] = useState(false)
  const [techsSavedAt, setTechsSavedAt] = useState<number | null>(null)
  const [techsError, setTechsError] = useState<string | null>(null)

  async function loadHours() {
    const { data } = await supabase
      .from('business_hours')
      .select('id, day_of_week, is_open, open_time, close_time')
      .order('day_of_week')

    setRows((data ?? []) as BusinessHours[])
    setLoading(false)
  }

  async function loadTechAvailability() {
    const { data: members } = await supabase
      .from('team_members')
      .select('id, name, color, avatar_url, is_active, working_days')
      .eq('is_active', true)
      .order('name')

    const { data: avail } = await supabase
      .from('tech_availability')
      .select('id, team_member_id, day_of_week')
      .order('team_member_id')
      .order('day_of_week')

    const map: Record<string, Set<number>> = {}
    for (const tm of members ?? []) {
      map[tm.id] = new Set<number>()
    }
    for (const a of (avail ?? []) as TechAvailability[]) {
      if (!map[a.team_member_id]) map[a.team_member_id] = new Set<number>()
      map[a.team_member_id].add(a.day_of_week)
    }

    setTechs((members ?? []) as TeamMember[])
    setAvailability(map)
    setTechsLoading(false)
  }

  useEffect(() => {
    loadHours()
    loadTechAvailability()
  }, [])

  const orderedRows = useMemo(() => {
    const byDay = new Map<number, BusinessHours>()
    for (const r of rows) byDay.set(r.day_of_week, r)
    return DAY_ORDER.map((d) => byDay.get(d)).filter((r): r is BusinessHours => Boolean(r))
  }, [rows])

  function updateRow(dayOfWeek: number, patch: Partial<BusinessHours>) {
    setRows((prev) =>
      prev.map((r) => (r.day_of_week === dayOfWeek ? { ...r, ...patch } : r)),
    )
  }

  function toggleAvailability(techId: string, day: number) {
    setAvailability((prev) => {
      const next: Record<string, Set<number>> = {}
      for (const k of Object.keys(prev)) next[k] = new Set(prev[k])
      if (!next[techId]) next[techId] = new Set<number>()
      if (next[techId].has(day)) next[techId].delete(day)
      else next[techId].add(day)
      return next
    })
  }

  async function handleSaveHours() {
    setSaving(true)
    setError(null)

    for (const row of rows) {
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
    await loadHours()
  }

  async function handleSaveTechAvailability() {
    setTechsSaving(true)
    setTechsError(null)

    const { data: existingRows, error: fetchErr } = await supabase
      .from('tech_availability')
      .select('id, team_member_id, day_of_week')
      .order('team_member_id')
      .order('day_of_week')

    if (fetchErr) {
      setTechsError(fetchErr.message)
      setTechsSaving(false)
      return
    }

    const nextAvailability: Record<string, Set<number>> = {}
    for (const [techId, days] of Object.entries(availability)) {
      nextAvailability[techId] = new Set(days)
    }

    for (const tech of techs) {
      const existingForTech = ((existingRows ?? []) as TechAvailability[]).filter(
        (row) => row.team_member_id === tech.id,
      )

      const existingDays = new Set(existingForTech.map((row) => row.day_of_week))
      const desiredDays = availability[tech.id] ?? new Set<number>()

      const rowsToDelete = existingForTech.filter((row) => !desiredDays.has(row.day_of_week))
      const daysToInsert = Array.from(desiredDays).filter((day) => !existingDays.has(day))

      if (rowsToDelete.length > 0) {
        const ids = rowsToDelete.map((row) => row.id)
        const { error: delErr } = await supabase
          .from('tech_availability')
          .delete()
          .in('id', ids)

        if (delErr) {
          setTechsError(`${tech.name}: ${delErr.message}`)
          setTechsSaving(false)
          return
        }
      }

      if (daysToInsert.length > 0) {
        const { error: insErr } = await supabase
          .from('tech_availability')
          .insert(
            daysToInsert.map((day) => ({
              team_member_id: tech.id,
              day_of_week: day,
            })),
          )

        if (insErr) {
          setTechsError(`${tech.name}: ${insErr.message}`)
          setTechsSaving(false)
          return
        }
      }

      nextAvailability[tech.id] = new Set(desiredDays)
    }

    setAvailability(nextAvailability)
    setTechsSaving(false)
    setTechsSavedAt(Date.now())
  }

  return (
    <div className="mt-4 space-y-8">
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Business Hours
          </h2>
          <Button
            size="sm"
            onClick={handleSaveHours}
            disabled={saving || loading || rows.length === 0}
          >
            {saving ? 'Saving...' : 'Save Hours'}
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No business hours rows found. Run the T12 schema migration.
          </p>
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
                        <span
                          className={`text-xs font-medium ${
                            row.is_open ? 'text-green-700' : 'text-muted-foreground'
                          }`}
                        >
                          {row.is_open ? 'Open' : 'Closed'}
                        </span>
                      </label>
                    </td>
                    <td className="px-4 py-2.5">
                      <select
                        value={row.open_time}
                        disabled={!row.is_open}
                        onChange={(e) =>
                          updateRow(row.day_of_week, { open_time: e.target.value })
                        }
                        className="px-2 py-1.5 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:bg-muted disabled:text-muted-foreground"
                      >
                        {ALL_SLOTS.map((slot) => (
                          <option key={slot} value={slot}>
                            {formatTimeLabel(slot)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2.5">
                      <select
                        value={row.close_time}
                        disabled={!row.is_open}
                        onChange={(e) =>
                          updateRow(row.day_of_week, { close_time: e.target.value })
                        }
                        className="px-2 py-1.5 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:bg-muted disabled:text-muted-foreground"
                      >
                        {ALL_SLOTS.map((slot) => (
                          <option key={slot} value={slot}>
                            {formatTimeLabel(slot)}
                          </option>
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
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Tech Availability
          </h2>
          <Button
            size="sm"
            onClick={handleSaveTechAvailability}
            disabled={techsSaving || techsLoading || techs.length === 0}
          >
            {techsSaving ? 'Saving...' : 'Save Availability'}
          </Button>
        </div>

        {techsLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : techs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active techs.</p>
        ) : (
          <div className="bg-white rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left">
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Tech</th>
                  {DAY_ORDER.map((d) => (
                    <th
                      key={d}
                      className="px-2 py-2.5 font-medium text-muted-foreground text-center"
                    >
                      {DAY_SHORT[d]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {techs.map((tech) => (
                  <tr key={tech.id} className="border-b border-border/50">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: tech.color }}
                        />
                        <span className="font-medium">{tech.name}</span>
                      </div>
                    </td>
                    {DAY_ORDER.map((d) => (
                      <td key={d} className="px-2 py-2.5 text-center">
                        <input
                          type="checkbox"
                          className="h-4 w-4 cursor-pointer"
                          checked={availability[tech.id]?.has(d) ?? false}
                          onChange={() => toggleAvailability(tech.id, d)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {techsError && <p className="mt-3 text-sm text-red-600">{techsError}</p>}
        {techsSavedAt && !techsError && !techsSaving && (
          <p className="mt-3 text-sm text-green-700">Saved.</p>
        )}
      </section>
    </div>
  )
}
