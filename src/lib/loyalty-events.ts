import { supabase } from './supabase'
import { calculateTier } from './loyalty'

/**
 * Insert a loyalty event for a customer, recompute their total points,
 * and update the cached loyalty_points + loyalty_tier columns on the
 * customers row. Caller is responsible for the features.loyalty_tiers
 * flag check — this function does NOT enforce it.
 */
export async function addLoyaltyEvent(
  customerId: string,
  eventType: string,
  points: number,
  note?: string,
  bookingId?: string,
) {
  // Bug 3 — dedupe per booking + event type. If this booking has already
  // fired this event, skip the insert. The customer aggregates already
  // include the prior event so there's nothing to recompute.
  if (bookingId) {
    const { data: existing } = await supabase
      .from('loyalty_events')
      .select('id')
      .eq('customer_id', customerId)
      .eq('booking_id', bookingId)
      .eq('event_type', eventType)
      .maybeSingle()

    if (existing) return null
  }

  // Insert the event
  // TODO: scope to tenant_id when available
  await supabase.from('loyalty_events').insert({
    customer_id: customerId,
    event_type: eventType,
    points,
    note: note ?? null,
    booking_id: bookingId ?? null,
  })

  // Recalculate total points from all events
  // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
  const { data: events } = await supabase
    .from('loyalty_events')
    .select('points')
    .eq('customer_id', customerId)

  const totalPoints = (events ?? []).reduce(
    (sum, e) => sum + (e.points as number),
    0,
  )

  // Read last_visit_at for the Diamond freshness check
  // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
  const { data: customer } = await supabase
    .from('customers')
    .select('last_visit_at')
    .eq('id', customerId)
    .single()

  const newTier = calculateTier(
    totalPoints,
    (customer?.last_visit_at as string | null) ?? null,
  )

  // Update cached aggregates on the customer row
  // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
  await supabase
    .from('customers')
    .update({ loyalty_points: totalPoints, loyalty_tier: newTier })
    .eq('id', customerId)

  return { totalPoints, newTier }
}
