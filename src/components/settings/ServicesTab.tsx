'use client'

import { useState, useEffect, Fragment } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import type { Service } from '@/lib/types'
import { groupServicesByCategory } from '@/lib/service-categories'
import { ServiceModal } from './ServiceModal'

export function ServicesTab() {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingService, setEditingService] = useState<Service | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

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
    setError(null)
    setNotice(null)
    // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
    const { error: upErr } = await supabase
      .from('services')
      .update({ is_active: !service.is_active })
      .eq('id', service.id)
    if (upErr) {
      setError(`Couldn't update "${service.name}": ${upErr.message}`)
      return
    }
    await loadServices()
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    setError(null)
    setNotice(null)
    // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
    const { error: delErr } = await supabase.from('services').delete().eq('id', id)

    if (delErr) {
      // 23503 = FK violation: the service is referenced by existing
      // appointment_segments (ON DELETE RESTRICT). Booking history must be
      // preserved, so soft-delete instead — deactivating drops it from the
      // public booking flow (which only loads is_active services).
      if (delErr.code === '23503') {
        const { error: deactErr } = await supabase
          .from('services')
          .update({ is_active: false })
          .eq('id', id)
        if (deactErr) {
          setError(`Couldn't delete or deactivate this service: ${deactErr.message}`)
        } else {
          setNotice(
            'This service has existing bookings, so it was deactivated (hidden from new bookings) instead of deleted.',
          )
        }
      } else {
        setError(`Couldn't delete this service: ${delErr.message}`)
      }
    }

    setDeletingId(null)
    setConfirmDeleteId(null)
    await loadServices()
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

      {error && (
        <p className="mb-3 text-sm text-red-600">{error}</p>
      )}
      {notice && (
        <p className="mb-3 text-sm text-amber-600">{notice}</p>
      )}

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
              {groupServicesByCategory(services).map((group) => (
                <Fragment key={group.key}>
                  <tr className="bg-muted/40">
                    <td
                      colSpan={5}
                      className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {group.label}
                    </td>
                  </tr>
                  {group.services.map((svc) => (
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
                </Fragment>
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
