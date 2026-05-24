'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { LoyaltyEvent } from '@/lib/types'
import { TIERS, getNextTier, pointsToNextTier } from '@/lib/loyalty'
import { TierBadge } from './TierBadge'

// Display labels for loyalty event types. Historical `LATE_CANCEL_PENALTY`
// rows predate the split into late-arrival vs late-cancellation; they're
// shown with their original label so the audit trail stays readable.
const EVENT_LABELS: Record<string, string> = {
  VISIT_SPEND: 'Visit spend',
  REFERRAL: 'Referral',
  REVIEW_GOOGLE: 'Google review',
  REVIEW_FACEBOOK: 'Facebook review',
  REVIEW_INSTAGRAM: 'Instagram review',
  INSTAGRAM_TAG: 'Instagram tag',
  BIRTHDAY_BONUS: 'Birthday bonus',
  NO_SHOW_PENALTY: 'No-show penalty',
  NO_SHOW_REVERSAL: 'No-show reversal',
  LATE_ARRIVAL_PENALTY: 'Late arrival penalty',
  LATE_CANCEL_PENALTY: 'Late cancellation penalty',
  LATE_REVERSAL: 'Late reversal',
}

function labelForEvent(eventType: string): string {
  return EVENT_LABELS[eventType] ?? eventType
}

interface LoyaltySectionProps {
  customerId: string
  loyaltyPoints: number | null
  loyaltyTier: string | null
}

export function LoyaltySection({ customerId, loyaltyPoints, loyaltyTier }: LoyaltySectionProps) {
  const points = loyaltyPoints ?? 0
  const tier = loyaltyTier ?? 'PEARL'

  const [events, setEvents] = useState<LoyaltyEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadEvents() {
      // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
      const { data } = await supabase
        .from('loyalty_events')
        .select('id, customer_id, event_type, points, note, created_at')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
      setEvents((data ?? []) as LoyaltyEvent[])
      setLoading(false)
    }
    loadEvents()
  }, [customerId])

  const nextTier = getNextTier(tier)
  const remaining = pointsToNextTier(points, tier)
  const currentTierMin = TIERS[tier as keyof typeof TIERS]?.minPoints ?? 0
  const nextTierMin = nextTier ? TIERS[nextTier as keyof typeof TIERS].minPoints : currentTierMin
  const span = Math.max(1, nextTierMin - currentTierMin)
  const filled = nextTier ? Math.min(100, Math.max(0, ((points - currentTierMin) / span) * 100)) : 100

  return (
    <div className="bg-white rounded-lg border border-border p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Loyalty</h2>
        <TierBadge tier={tier} />
      </div>

      {/* Points + progress */}
      <div>
        <div className="flex items-baseline justify-between">
          <p className="text-2xl font-semibold">{points} <span className="text-sm font-normal text-muted-foreground">points</span></p>
          {nextTier ? (
            <p className="text-xs text-muted-foreground">
              {remaining > 0 ? `${remaining} to ${TIERS[nextTier as keyof typeof TIERS].name}` : `Eligible for ${TIERS[nextTier as keyof typeof TIERS].name}`}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Top tier reached</p>
          )}
        </div>
        <div className="mt-2 h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full transition-[width] duration-300"
            style={{
              width: `${filled}%`,
              backgroundColor: TIERS[(nextTier ?? tier) as keyof typeof TIERS]?.color ?? '#9e9e9e',
            }}
          />
        </div>
      </div>

      {/* Event history */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">History</p>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No loyalty activity yet.</p>
        ) : (
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left">
                  <th className="px-3 py-2 font-medium text-muted-foreground">Date</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground">Event</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground text-right">Points</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev.id} className="border-b border-border/50 last:border-b-0">
                    {/* Slice the YYYY-MM-DD off created_at — never new Date() */}
                    <td className="px-3 py-2 text-muted-foreground">{(ev.created_at ?? '').slice(0, 10)}</td>
                    <td className="px-3 py-2">
                      <span className="font-medium">{labelForEvent(ev.event_type)}</span>
                      {ev.note && (
                        <span className="ml-2 text-xs text-muted-foreground">{ev.note}</span>
                      )}
                    </td>
                    <td className={`px-3 py-2 text-right font-semibold ${ev.points < 0 ? 'text-red-600' : 'text-green-700'}`}>
                      {ev.points > 0 ? `+${ev.points}` : ev.points}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
