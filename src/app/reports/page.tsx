import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { DateRangeSelector } from './DateRangeSelector'

export const dynamic = 'force-dynamic'

// T17 — Reporting & Analytics.
//
// All filtering that touches start_at is string-only — slice the first
// 10 chars and compare as a lexical string. The only new Date() use is
// in computing the default "This Month" boundary for the first render
// (no ?start/?end in the URL), which is boundary math, not filtering.

// ─── Types for the joined Supabase row ────────────────────────────────
interface ReportBooking {
  id: string
  start_at: string
  status: string
  customer_id: string | null
  customer: { id: string; first_name: string; last_name: string } | null
  segments: {
    duration_minutes: number
    team_member_id: string
    team_member: { id: string; name: string } | null
    service: { id: string; name: string; price: number } | null
  }[]
}

// ─── Default "This Month" boundary strings ────────────────────────────
function getDefaultRange(): { start: string; end: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const first = new Date(y, m, 1)
  const last = new Date(y, m + 1, 0) // day 0 of next month = last day of this month
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { start: ymd(first), end: ymd(last) }
}

// ─── Utility — format cents/dollars ───────────────────────────────────
function money(n: number): string {
  return `$${n.toFixed(2)}`
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

// ─── Revenue Summary computation ──────────────────────────────────────
interface RevenueSummary {
  totalRevenue: number
  completedVisits: number
  avgTicket: number
  noShows: number
  noShowRate: number
  cancellations: number
}

function computeRevenue(bookings: ReportBooking[]): RevenueSummary {
  let totalRevenue = 0
  let completedVisits = 0
  let noShows = 0
  let cancellations = 0
  for (const b of bookings) {
    if (b.status === 'CONFIRMED' || b.status === 'ARRIVED') {
      completedVisits++
      for (const seg of b.segments) {
        if (seg.service) totalRevenue += seg.service.price
      }
    } else if (b.status === 'NO SHOW') {
      noShows++
    } else if (b.status === 'CANCELLED') {
      cancellations++
    }
  }
  const avgTicket = completedVisits > 0 ? totalRevenue / completedVisits : 0
  const denom = completedVisits + noShows
  const noShowRate = denom > 0 ? noShows / denom : 0
  return { totalRevenue, completedVisits, avgTicket, noShows, noShowRate, cancellations }
}

// ─── Tech Performance computation ─────────────────────────────────────
interface TechRow {
  teamMemberId: string
  name: string
  visits: number
  revenue: number
  avgTicket: number
  noShows: number
}

function computeTechRows(bookings: ReportBooking[]): TechRow[] {
  const map = new Map<string, TechRow>()
  for (const b of bookings) {
    for (const seg of b.segments) {
      if (!seg.team_member) continue
      const id = seg.team_member.id
      let row = map.get(id)
      if (!row) {
        row = {
          teamMemberId: id,
          name: seg.team_member.name,
          visits: 0,
          revenue: 0,
          avgTicket: 0,
          noShows: 0,
        }
        map.set(id, row)
      }
      if (b.status === 'CONFIRMED' || b.status === 'ARRIVED') {
        row.visits++
        if (seg.service) row.revenue += seg.service.price
      } else if (b.status === 'NO SHOW') {
        row.noShows++
      }
    }
  }
  const rows = Array.from(map.values())
  for (const r of rows) r.avgTicket = r.visits > 0 ? r.revenue / r.visits : 0
  rows.sort((a, b) => b.revenue - a.revenue)
  return rows
}

// ─── Top Services computation ─────────────────────────────────────────
interface ServiceRow {
  serviceId: string
  name: string
  bookings: number
  revenue: number
}

function computeServiceRows(bookings: ReportBooking[]): ServiceRow[] {
  const map = new Map<string, ServiceRow>()
  for (const b of bookings) {
    if (b.status !== 'CONFIRMED' && b.status !== 'ARRIVED') continue
    for (const seg of b.segments) {
      if (!seg.service) continue
      const id = seg.service.id
      let row = map.get(id)
      if (!row) {
        row = { serviceId: id, name: seg.service.name, bookings: 0, revenue: 0 }
        map.set(id, row)
      }
      row.bookings++
      row.revenue += seg.service.price
    }
  }
  const rows = Array.from(map.values())
  rows.sort((a, b) => b.revenue - a.revenue)
  return rows
}

// ─── Client Retention computation ─────────────────────────────────────
interface RetentionStats {
  newClients: number
  returningClients: number
  retentionRate: number
  topClients: { customerId: string; name: string; spend: number; visits: number }[]
}

function computeRetention(
  bookings: ReportBooking[],
  returnedIds: Set<string>,
): RetentionStats {
  const inRangeCustomers = new Set<string>()
  const spendByCustomer = new Map<
    string,
    { name: string; spend: number; visits: number }
  >()
  for (const b of bookings) {
    if (!b.customer_id || !b.customer) continue
    inRangeCustomers.add(b.customer_id)
    if (b.status === 'CONFIRMED' || b.status === 'ARRIVED') {
      let bucket = spendByCustomer.get(b.customer_id)
      if (!bucket) {
        bucket = {
          name: `${b.customer.first_name} ${b.customer.last_name}`,
          spend: 0,
          visits: 0,
        }
        spendByCustomer.set(b.customer_id, bucket)
      }
      bucket.visits++
      for (const seg of b.segments) {
        if (seg.service) bucket.spend += seg.service.price
      }
    }
  }
  let newClients = 0
  let returningClients = 0
  for (const id of inRangeCustomers) {
    if (returnedIds.has(id)) returningClients++
    else newClients++
  }
  const denom = newClients + returningClients
  const retentionRate = denom > 0 ? returningClients / denom : 0
  const topClients = Array.from(spendByCustomer.entries())
    .map(([customerId, v]) => ({ customerId, name: v.name, spend: v.spend, visits: v.visits }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 5)
  return { newClients, returningClients, retentionRate, topClients }
}

// ─── Page ──────────────────────────────────────────────────────────────
interface PageProps {
  searchParams: Promise<{ start?: string; end?: string }>
}

export default async function ReportsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const def = getDefaultRange()
  const start = params.start ?? def.start
  const end = params.end ?? def.end

  // One fat query covering Sections 1-3 and the "in-range" side of 4.
  // start_at uses the existing space-separator / T-separator convention
  // so bookings written in either form are captured.
  // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
  const { data } = await supabase
    .from('bookings')
    .select(
      `
      id,
      start_at,
      status,
      customer_id,
      customer:customers (id, first_name, last_name),
      segments:appointment_segments (
        duration_minutes,
        team_member_id,
        team_member:team_members (id, name),
        service:services (id, name, price)
      )
    `,
    )
    .gte('start_at', `${start} 00:00:00`)
    .lte('start_at', `${end}T23:59:59`)

  const bookings = ((data ?? []) as unknown as ReportBooking[]).filter((b) => {
    // Defensive string-only re-filter. Supabase already did a gte/lte
    // on the raw column, but the spec requires the display filter to
    // rely purely on slicing start_at.
    const ymd = b.start_at.slice(0, 10)
    return ymd >= start && ymd <= end
  })

  // Retention side-query: any prior booking for these customers that
  // predates the range start → they count as "returning".
  const customerIdsInRange = Array.from(
    new Set(bookings.map((b) => b.customer_id).filter((v): v is string => !!v)),
  )
  let returnedIds = new Set<string>()
  if (customerIdsInRange.length > 0) {
    const { data: prior } = await supabase
      .from('bookings')
      .select('customer_id, start_at')
      .in('customer_id', customerIdsInRange)
      .lt('start_at', `${start} 00:00:00`)
      .limit(10000)
    returnedIds = new Set(
      ((prior ?? []) as { customer_id: string; start_at: string }[])
        .filter((r) => r.start_at.slice(0, 10) < start)
        .map((r) => r.customer_id),
    )
  }

  const revenue = computeRevenue(bookings)
  const techRows = computeTechRows(bookings)
  const serviceRows = computeServiceRows(bookings)
  const retention = computeRetention(bookings, returnedIds)

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--rs-bg-page)' }}>
      {/* Header bar */}
      <div
        className="border-b px-6 py-4"
        style={{ backgroundColor: 'var(--rs-primary-subtle)', borderColor: 'var(--rs-primary-border)' }}
      >
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <Link href="/">
            <Button variant="outline" size="icon-sm">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1
            className="text-lg font-semibold"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--rs-text-primary)' }}
          >
            Reports
          </h1>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6">
        <DateRangeSelector start={start} end={end} />

        {/* ─── Section 1 — Revenue Summary ─────────────────────────── */}
        <section className="mb-8">
          <h2
            className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3"
          >
            Revenue Summary
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard label="Total Revenue" value={money(revenue.totalRevenue)} />
            <StatCard label="Completed Visits" value={String(revenue.completedVisits)} />
            <StatCard label="Average Ticket" value={money(revenue.avgTicket)} />
            <StatCard label="No-Shows" value={String(revenue.noShows)} />
            <StatCard label="No-Show Rate" value={pct(revenue.noShowRate)} />
            <StatCard label="Cancellations" value={String(revenue.cancellations)} />
          </div>
        </section>

        {/* ─── Section 2 — Tech Performance ────────────────────────── */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Tech Performance
          </h2>
          <div className="bg-white rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left">
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Tech</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground text-right">Visits</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground text-right">Revenue</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground text-right">Avg Ticket</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground text-right">No-Shows</th>
                </tr>
              </thead>
              <tbody>
                {techRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-4 text-center text-muted-foreground">
                      No data in this range
                    </td>
                  </tr>
                ) : (
                  techRows.map((r) => (
                    <tr key={r.teamMemberId} className="border-b border-border/50">
                      <td className="px-4 py-2.5 font-medium">{r.name}</td>
                      <td className="px-4 py-2.5 text-right">{r.visits}</td>
                      <td className="px-4 py-2.5 text-right">{money(r.revenue)}</td>
                      <td className="px-4 py-2.5 text-right">{money(r.avgTicket)}</td>
                      <td className="px-4 py-2.5 text-right">{r.noShows}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ─── Section 3 — Top Services ────────────────────────────── */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Top Services
          </h2>
          <div className="bg-white rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-sm min-w-[400px]">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left">
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Service</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground text-right">Bookings</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {serviceRows.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-4 text-center text-muted-foreground">
                      No data in this range
                    </td>
                  </tr>
                ) : (
                  serviceRows.map((r) => (
                    <tr key={r.serviceId} className="border-b border-border/50">
                      <td className="px-4 py-2.5 font-medium">{r.name}</td>
                      <td className="px-4 py-2.5 text-right">{r.bookings}</td>
                      <td className="px-4 py-2.5 text-right">{money(r.revenue)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ─── Section 4 — Client Retention ────────────────────────── */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Client Retention
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            <StatCard label="New Clients" value={String(retention.newClients)} />
            <StatCard label="Returning Clients" value={String(retention.returningClients)} />
            <StatCard label="Retention Rate" value={pct(retention.retentionRate)} />
          </div>
          <div className="bg-white rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-sm min-w-[400px]">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left">
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Top 5 Clients</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground text-right">Visits</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground text-right">Spend</th>
                </tr>
              </thead>
              <tbody>
                {retention.topClients.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-4 text-center text-muted-foreground">
                      No data in this range
                    </td>
                  </tr>
                ) : (
                  retention.topClients.map((c) => (
                    <tr key={c.customerId} className="border-b border-border/50">
                      <td className="px-4 py-2.5 font-medium">{c.name}</td>
                      <td className="px-4 py-2.5 text-right">{c.visits}</td>
                      <td className="px-4 py-2.5 text-right">{money(c.spend)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg border border-border p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className="text-2xl font-semibold mt-1"
        style={{ fontFamily: 'var(--font-display)', color: 'var(--rs-text-primary)' }}
      >
        {value}
      </p>
    </div>
  )
}
