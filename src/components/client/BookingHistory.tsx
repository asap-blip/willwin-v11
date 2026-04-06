'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface HistoryRow {
  date: string
  serviceName: string
  techName: string
  status: string
  price: number
}

const STATUS_STYLES: Record<string, string> = {
  CONFIRMED: 'bg-green-100 text-green-800',
  ARRIVED: 'bg-blue-100 text-blue-800',
  LATE: 'bg-amber-100 text-amber-800',
  'NO SHOW': 'bg-red-100 text-red-800',
  CANCELLED: 'bg-gray-100 text-gray-800',
}

interface BookingHistoryProps {
  customerId: string
}

export function BookingHistory({ customerId }: BookingHistoryProps) {
  const [rows, setRows] = useState<HistoryRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
      const { data: segments } = await supabase
        .from('appointment_segments')
        .select(`
          id,
          booking:bookings!inner (
            start_at,
            status,
            customer_id
          ),
          service:services!inner (
            name,
            price
          ),
          team_member:team_members!inner (
            name
          )
        `)
        .eq('booking.customer_id', customerId)
        .order('booking(start_at)', { ascending: false })

      const mapped: HistoryRow[] = (segments ?? []).map((seg) => {
        const booking = seg.booking as unknown as { start_at: string; status: string }
        const service = seg.service as unknown as { name: string; price: number }
        const teamMember = seg.team_member as unknown as { name: string }

        return {
          // Slice date from start_at — never new Date()
          date: booking.start_at.slice(0, 10),
          serviceName: service.name,
          techName: teamMember.name,
          status: booking.status,
          price: service.price,
        }
      })

      setRows(mapped)
      setLoading(false)
    }

    load()
  }, [customerId])

  return (
    <div className="bg-white rounded-lg border border-border p-6">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">Booking History</h2>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No bookings yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="pb-2 font-medium text-muted-foreground">Date</th>
                <th className="pb-2 font-medium text-muted-foreground">Service</th>
                <th className="pb-2 font-medium text-muted-foreground">Tech</th>
                <th className="pb-2 font-medium text-muted-foreground">Status</th>
                <th className="pb-2 font-medium text-muted-foreground text-right">Price</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const statusClass = STATUS_STYLES[row.status] ?? 'bg-gray-100 text-gray-800'
                return (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-2.5">{row.date}</td>
                    <td className="py-2.5">{row.serviceName}</td>
                    <td className="py-2.5">{row.techName}</td>
                    <td className="py-2.5">
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${statusClass}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="py-2.5 text-right">${row.price}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
