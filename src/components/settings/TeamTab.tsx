'use client'

import { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import type { TeamMember } from '@/lib/types'
import { TechModal } from './TechModal'

export function TeamTab() {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null)

  async function loadMembers() {
    // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
    const { data } = await supabase
      .from('team_members')
      .select('id, name, color, avatar_url, is_active')
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
    // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
    await supabase
      .from('team_members')
      .update({ is_active: !member.is_active })
      .eq('id', member.id)
    loadMembers()
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
                        style={{ backgroundColor: tm.color }}
                      />
                      {tm.name}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${tm.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {tm.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right space-x-2">
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
