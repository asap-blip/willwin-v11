import { TIERS } from '@/lib/loyalty'

/**
 * Tier pill — emoji + name on a tinted background.
 * Caller must guard rendering on features.loyalty_tiers; this component
 * does not check the flag itself.
 */
export function TierBadge({ tier }: { tier: string }) {
  const t = TIERS[tier as keyof typeof TIERS] ?? TIERS.PEARL
  return (
    <span
      style={{
        background: t.color + '33',
        color: t.color,
        border: `1px solid ${t.color}`,
        borderRadius: '999px',
        padding: '2px 8px',
        fontSize: '11px',
        fontWeight: 500,
        whiteSpace: 'nowrap',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {t.emoji} {t.name}
    </span>
  )
}
