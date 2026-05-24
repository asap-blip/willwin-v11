'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import type { Service } from '@/lib/types'
import { ServiceModal } from './ServiceModal'

export function ServicesTab() {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingService, setEditingService] = useState<Service | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  async function loadServices() {
    // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
    const { data } = await supabase
      .from('services')
      .select('id, name, duration_minutes, price, is_active')
      .order('name')
    setServices(data ?? [])
    setLoading(false)
  }

  useEffect(() => { loadServices() }, [])

  function handleAdd() {
    setEditingService(null)
    setModalOpen(true)
  }

  function handleEdit(service: Service) {
    setEditingService(service)
    setModalOpen(true)
  }

  async function handleToggleActive(service: Service) {
    // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
    await supabase
      .from('services')
      .update({ is_active: !service.is_active })
      .eq('id', service.id)
    loadServices()
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
    await supabase.from('services').delete().eq('id', id)
    setDeletingId(null)
    setConfirmDeleteId(null)
    loadServices()
  }

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Services</h2>
        <Button size="sm" className="gap-1.5" onClick={handleAdd}>
          <Plus className="h-3.5 w-3.5" />
          Add Service
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : services.length === 0 ? (
        <p className="text-sm text-muted-foreground">No services yet</p>
      ) : (
        <div className="bg-white rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left">
                <th className="px-4 py-2.5 font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground">Duration</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground">Price</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {services.map((svc) => (
                <tr
                  key={svc.id}
                  className={`border-b border-border/50 ${!svc.is_active ? 'opacity-50' : ''}`}
                >
                  <td className="px-4 py-2.5">{svc.name}</td>
                  <td className="px-4 py-2.5">{svc.duration_minutes} min</td>
                  <td className="px-4 py-2.5">${svc.price}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                      svc.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {svc.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {confirmDeleteId === svc.id ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="text-xs text-red-600 font-medium">Delete?</span>
                        <Button
                          variant="destructive"
                          size="xs"
                          disabled={deletingId === svc.id}
                          onClick={() => handleDelete(svc.id)}
                        >
                          {deletingId === svc.id ? '…' : 'Yes'}
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
                        <Button variant="outline" size="xs" onClick={() => handleEdit(svc)}>
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => handleToggleActive(svc)}
                        >
                          {svc.is_active ? 'Deactivate' : 'Reactivate'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => setConfirmDeleteId(svc.id)}
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

      <ServiceModal
        open={modalOpen}
        service={editingService}
        onClose={() => setModalOpen(false)}
        onSaved={loadServices}
      />
    </div>
  )
}
