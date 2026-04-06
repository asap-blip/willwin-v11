import { supabase } from '@/lib/supabase'
import type { BookingDetail } from '@/lib/types'

/**
 * Fetch full booking detail by booking ID — used by the edit modal.
 * Queries through appointment_segments to get the segment + service + customer data.
 */
export async function fetchBookingDetail(bookingId: string): Promise<BookingDetail | null> {
  // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
  const { data: segments } = await supabase
    .from('appointment_segments')
    .select(`
      id,
      duration_minutes,
      team_member_id,
      service_id,
      booking:bookings!inner (
        id,
        start_at,
        status,
        notes,
        customer_id,
        customer:customers!inner (
          id,
          first_name,
          last_name,
          phone,
          alert,
          notes
        )
      ),
      service:services!inner (
        id,
        name,
        price
      )
    `)
    .eq('booking_id', bookingId)
    .limit(1)

  if (!segments || segments.length === 0) return null

  const seg = segments[0] as Record<string, unknown>
  const booking = seg.booking as Record<string, unknown>
  const customer = booking.customer as Record<string, unknown>
  const service = seg.service as Record<string, unknown>

  return {
    booking_id: booking.id as string,
    segment_id: seg.id as string,
    customer_id: customer.id as string,
    customer_first_name: customer.first_name as string,
    customer_last_name: customer.last_name as string,
    customer_phone: customer.phone as string | null,
    customer_alert: (customer.alert ?? null) as string | null,
    customer_notes: customer.notes as string | null,
    team_member_id: seg.team_member_id as string,
    service_id: service.id as string,
    service_name: service.name as string,
    service_price: service.price as number,
    duration_minutes: seg.duration_minutes as number,
    start_at: booking.start_at as string,
    status: booking.status as string,
    notes: booking.notes as string | null,
  }
}

/**
 * Fetch visit count + last visit date for a customer.
 * Only counts CONFIRMED or ARRIVED bookings.
 */
export async function fetchCustomerVisitStats(customerId: string): Promise<{
  visitCount: number
  lastVisit: string | null
}> {
  // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
  const { data, count } = await supabase
    .from('bookings')
    .select('start_at', { count: 'exact' })
    .eq('customer_id', customerId)
    .in('status', ['CONFIRMED', 'ARRIVED'])
    .order('start_at', { ascending: false })
    .limit(1)

  return {
    visitCount: count ?? 0,
    // Slice to YYYY-MM-DD — never new Date()
    lastVisit: data && data.length > 0 ? (data[0].start_at as string).slice(0, 10) : null,
  }
}
