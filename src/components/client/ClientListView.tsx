'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'

interface ClientRow {
  id: string
  first_name: string
  last_name: string
  phone: string | null
  visitCount: number
  lastVisit: string | null
  totalSpend: number
}

export function ClientListView() {
  const router = useRouter()
  const [clients, setClients] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    async function load() {
      // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
      const { data: customers } = await supabase
        .from('customers')
        .select('id, first_name, last_name, phone')
        .order('last_name')

      if (!customers || customers.length === 0) {
        setClients([])
        setLoading(false)
        return
      }

      // Batch-fetch stats for all customers
      const customerIds = customers.map((c) => c.id)

      // Visit counts + last visit (CONFIRMED or ARRIVED)
      // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
      const { data: bookings } = await supabase
        .from('bookings')
        .select('id, customer_id, start_at, status')
        .in('customer_id', customerIds)
        .in('status', ['CONFIRMED', 'ARRIVED'])

      // Total spend through appointment_segments
      // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
      const { data: segments } = await supabase
        .from('appointment_segments')
        .select(`
          booking:bookings!inner (customer_id, status),
          service:services!inner (price)
        `)
        .in('booking.customer_id', customerIds)
        .in('booking.status', ['CONFIRMED', 'ARRIVED'])

      // Build lookup maps
      const visitMap: Record<string, { count: number; lastVisit: string | null }> = {}
      for (const b of bookings ?? []) {
        const cid = b.customer_id as string
        if (!visitMap[cid]) visitMap[cid] = { count: 0, lastVisit: null }
        visitMap[cid].count++
        const startAt = b.start_at as string
        // Compare as string — lexicographic works for YYYY-MM-DD format
        if (!visitMap[cid].lastVisit || startAt > visitMap[cid].lastVisit!) {
          visitMap[cid].lastVisit = startAt
        }
      }

      const spendMap: Record<string, number> = {}
      for (const seg of segments ?? []) {
        const booking = seg.booking as unknown as { customer_id: string }
        const service = seg.service as unknown as { price: number }
        const cid = booking.customer_id
        spendMap[cid] = (spendMap[cid] ?? 0) + service.price
      }

      const rows: ClientRow[] = customers.map((c) => ({
        id: c.id,
        first_name: c.first_name,
        last_name: c.last_name,
        phone: c.phone,
        visitCount: visitMap[c.id]?.count ?? 0,
        // Slice to YYYY-MM-DD — never new Date()
        lastVisit: visitMap[c.id]?.lastVisit?.slice(0, 10) ?? null,
        totalSpend: spendMap[c.id] ?? 0,
      }))

      setClients(rows)
      setLoading(false)
    }

    load()
  }, [])

  // Client-side filtering — no extra Supabase calls
  const filtered = useMemo(() => {
    if (!query.trim()) return clients
    const q = query.toLowerCase()
    return clients.filter(
      (c) =>
        c.first_name.toLowerCase().includes(q) ||
        c.last_name.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q))
    )
  }, [clients, query])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-border px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="outline" size="icon-sm">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-lg font-semibold">Clients</h1>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => setModalOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Add Client
          </Button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or phone..."
            className="w-full pl-9 pr-9 py-2.5 border border-border rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* List */}
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No clients found</p>
        ) : (
          <div className="bg-white rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left">
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Phone</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Visits</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Last visit</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground text-right">Total spend</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer">
                    <td className="px-4 py-2.5">
                      <Link href={`/clients/${c.id}`} className="block">
                        {c.first_name} {c.last_name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <Link href={`/clients/${c.id}`} className="block text-muted-foreground">
                        {c.phone ?? '—'}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <Link href={`/clients/${c.id}`} className="block">
                        {c.visitCount}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <Link href={`/clients/${c.id}`} className="block text-muted-foreground">
                        {c.lastVisit ?? '—'}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link href={`/clients/${c.id}`} className="block">
                        ${c.totalSpend}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Client Modal */}
      {modalOpen && (
        <AddClientModal
          onClose={() => setModalOpen(false)}
          onCreated={(newId) => router.push(`/clients/${newId}`)}
        />
      )}
    </div>
  )
}

function AddClientModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!firstName.trim() || !lastName.trim() || !phone.trim()) return
    setSaving(true)

    // TODO: include tenant_id when tenant_id column exists
    const { data, error } = await supabase
      .from('customers')
      .insert({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim(),
        ...(email.trim() ? { email: email.trim() } : {}),
      })
      .select('id')
      .single()

    setSaving(false)
    if (error || !data) return

    onCreated(data.id)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">Add Client</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
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
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={saving || !firstName.trim() || !lastName.trim() || !phone.trim()}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}
