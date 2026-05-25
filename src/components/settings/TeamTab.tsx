'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import type { TeamMember } from '@/lib/types'
import { TechModal } from './TechModal'

export function TeamTab() {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function loadMembers() {
    // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
    const { data } = await supabase
      .from('team_members')
      .select('id, name, color, avatar_url, is_active, working_days')
      .order('name')
    setMembers(data ?? [])
    setLoading(false)
  }

  useEffect(() => { loadMembers() }, [])

  function handleAdd() {
    setEditingMember(null)
    setModalOpen(true)
  }

  function handleEdit(member: TeamMember) {
    setEditingMember(member)
    setModalOpen(true)
  }

  async function handleToggleActive(member: TeamMember) {
    setError(null)
    setNotice(null)
    // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
    const { error: upErr } = await supabase
      .from('team_members')
      .update({ is_active: !member.is_active })
      .eq('id', member.id)
    if (upErr) {
      setError(`Couldn't update "${member.name}": ${upErr.message}`)
      return
    }
    await loadMembers()
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    setError(null)
    setNotice(null)
    const member = members.find((m) => m.id === id)

    // Cascade: remove availability rows first, then the member.
    // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
    const { error: availErr } = await supabase
      .from('tech_availability')
      .delete()
      .eq('team_member_id', id)
    if (availErr) {
      setError(`Couldn't remove availability for this tech: ${availErr.message}`)
      setDeletingId(null)
      setConfirmDeleteId(null)
      await loadMembers()
      return
    }

    const { error: delErr } = await supabase.from('team_members').delete().eq('id', id)

    if (delErr) {
      // 23503 = FK violation: the tech is referenced by existing
      // appointment_segments (ON DELETE RESTRICT). Booking history must be
      // preserved, so soft-delete instead — deactivating drops the tech from
      // the public booking flow (which only loads is_active techs).
      if (delErr.code === '23503') {
        const { error: deactErr } = await supabase
          .from('team_members')
          .update({ is_active: false })
          .eq('id', id)
        if (deactErr) {
          setError(`Couldn't delete or deactivate this tech: ${deactErr.message}`)
        } else {
          setNotice(
            `${member?.name ?? 'This tech'} has existing bookings, so they were deactivated (hidden from new bookings) instead of deleted.`,
          )
        }
      } else {
        setError(`Couldn't delete this tech: ${delErr.message}`)
      }
    }

    setDeletingId(null)
    setConfirmDeleteId(null)
    await loadMembers()
  }

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Team</h2>
        <Button size="sm" className="gap-1.5" onClick={handleAdd}>
          <Plus className="h-3.5 w-3.5" />
          Add Tech
        </Button>
      </div>

      {error && (
        <p className="mb-3 text-sm text-red-600">{error}</p>
      )}
      {notice && (
        <p className="mb-3 text-sm text-amber-600">{notice}</p>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : members.length === 0 ? (
        <p className="text-sm text-muted-foreground">No team members yet</p>
      ) : (
        <div className="bg-white rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left">
                <th className="px-4 py-2.5 font-medium text-muted-foreground">Tech</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((tm) => (
                <tr
                  key={tm.id}
                  className={`border-b border-border/50 ${!tm.is_active ? 'opacity-50' : ''}`}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: tm.color ?? undefined }}
                      />
                      {tm.name}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                      tm.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {tm.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {confirmDeleteId === tm.id ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="text-xs text-red-600 font-medium">Delete?</span>
                        <Button
                          variant="destructive"
                          size="xs"
                          disabled={deletingId === tm.id}
                          onClick={() => handleDelete(tm.id)}
                        >
                          {deletingId === tm.id ? '…' : 'Yes'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          No
                        </Button>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <Button variant="outline" size="xs" onClick={() => handleEdit(tm)}>
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => handleToggleActive(tm)}
                        >
                          {tm.is_active ? 'Deactivate' : 'Reactivate'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => setConfirmDeleteId(tm.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <TechModal
        open={modalOpen}
        member={editingMember}
        onClose={() => setModalOpen(false)}
        onSaved={loadMembers}
      />
    </div>
  )
}
