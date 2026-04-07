export const TIERS = {
  PEARL: { name: 'Perle', emoji: '🩵', minPoints: 0, color: '#9e9e9e' },
  ROSE: { name: 'Rose', emoji: '🌸', minPoints: 300, color: '#f2a7a7' },
  GOLD: { name: 'Or', emoji: '💛', minPoints: 750, color: '#ffc97a' },
  DIAMOND: { name: 'Diamant', emoji: '✨', minPoints: 1500, color: '#9eb8c4' },
}

export const POINTS_CONFIG = {
  VISIT_SPEND_PER_DOLLAR: 1,
  REFERRAL: 50,
  REVIEW_GOOGLE: 30,
  REVIEW_FACEBOOK: 25,
  REVIEW_INSTAGRAM: 20,
  INSTAGRAM_TAG: 20,
  BIRTHDAY_BONUS: 25,
  NO_SHOW_PENALTY: -25,
  LATE_CANCEL_PENALTY: -10,
}

export function calculateTier(points: number, lastVisitAt: string | null): string {
  if (points >= 1500) {
    if (lastVisitAt) {
      const now = new Date()
      const cutoff = new Date(now.getFullYear(), now.getMonth() - 15, now.getDate())
      const cutoffStr = cutoff.toISOString().slice(0, 10)
      if (lastVisitAt.slice(0, 10) >= cutoffStr) return 'DIAMOND'
    }
    return 'GOLD'
  }
  if (points >= 750) return 'GOLD'
  if (points >= 300) return 'ROSE'
  return 'PEARL'
}

export function getNextTier(currentTier: string): string | null {
  const order = ['PEARL', 'ROSE', 'GOLD', 'DIAMOND']
  const idx = order.indexOf(currentTier)
  return idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null
}

export function pointsToNextTier(points: number, currentTier: string): number {
  const nextTier = getNextTier(currentTier)
  if (!nextTier) return 0
  return TIERS[nextTier as keyof typeof TIERS].minPoints - points
}
