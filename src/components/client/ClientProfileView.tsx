'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import type { Customer, TeamMember } from '@/lib/types'
import { ClientProfileForm } from './ClientProfileForm'
import { BookingHistory } from './BookingHistory'

interface ClientStats {
  visitCount: number
  lastVisit: string | null
  totalSpend: number
  noShowCount: number
}

interface ClientProfileViewProps {
  customer: Customer
  teamMembers: TeamMember[]
}

export function ClientProfileView({ customer, teamMembers }: ClientProfileViewProps) {
  const [stats, setStats] = useState<ClientStats>({
    visitCount: 0,
    lastVisit: null,
    totalSpend: 0,
    noShowCount: 0,
  })
  const [alert, setAlert] = useState(customer.alert)

  useEffect(() => {
    async function loadStats() {
      // Visit count + last visit: CONFIRMED or ARRIVED
      // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
      const { data: visitData, count: visitCount } = await supabase
        .from('bookings')
        .select('start_at', { count: 'exact' })
        .eq('customer_id', customer.id)
        .in('status', ['CONFIRMED', 'ARRIVED'])
        .order('start_at', { ascending: false })
        .limit(1)

      // No-show count
      // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
      const { count: noShowCount } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('customer_id', customer.id)
        .eq('status', 'NO SHOW')

      // Total spend — sum service prices through appointment_segments
      // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
      const { data: spendData } = await supabase
        .from('appointment_segments')
        .select(`
          service:services!inner (price),
          booking:bookings!inner (id, customer_id, status)
        `)
        .eq('booking.customer_id', customer.id)
        .in('booking.status', ['CONFIRMED', 'ARRIVED'])

      const totalSpend = (spendData ?? []).reduce((sum, seg) => {
        const service = seg.service as unknown as { price: number }
        return sum + service.price
      }, 0)

      setStats({
        visitCount: visitCount ?? 0,
        // Slice to YYYY-MM-DD — never new Date()
        lastVisit: visitData && visitData.length > 0 ? (visitData[0].start_at as string).slice(0, 10) : null,
        totalSpend,
        noShowCount: noShowCount ?? 0,
      })
    }

    loadStats()
  }, [customer.id])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-border px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <Link href="/">
            <Button variant="outline" size="icon-sm">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-lg font-semibold">
            {customer.first_name} {customer.last_name}
          </h1>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Visits" value={String(stats.visitCount)} />
          <StatCard label="Last visit" value={stats.lastVisit ?? '—'} />
          <StatCard label="Total spend" value={`$${stats.totalSpend}`} />
          <StatCard label="No-shows" value={String(stats.noShowCount)} />
        </div>

        {/* Alert banner */}
        {alert && (
          <div className="flex items-start gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-md">
            <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">{alert}</p>
          </div>
        )}

        {/* Two-column layout */}
        <div className="flex flex-col md:flex-row gap-6">
          {/* Left — Profile form */}
          <div className="md:w-1/2">
            <ClientProfileForm
              customer={customer}
              teamMembers={teamMembers}
              onAlertChange={setAlert}
            />
          </div>

          {/* Right — Booking history */}
          <div className="md:w-1/2">
            <BookingHistory customerId={customer.id} />
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg border border-border px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold mt-0.5">{value}</p>
    </div>
  )
}
