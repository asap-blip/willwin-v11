// Service category grouping + ordering.
//
// Services render in two fixed sections — NAILS first, then LASHES — instead
// of one alphabetical master list. Ordering is: category rank first, then name
// within each category.
//
// The persisted `services.category` column (migration 003) is the source of
// truth. When it is absent/null (older rows, or n8n init payloads that don't
// include it) we derive the category deterministically from the service name
// so grouping always works.

export type ServiceCategory = 'nails' | 'lashes'

// Display order + headings. Add new categories here to extend the sections.
export const SERVICE_CATEGORY_ORDER: Record<string, number> = { nails: 1, lashes: 2 }
export const SERVICE_CATEGORY_LABELS: Record<string, string> = {
  nails: 'NAILS',
  lashes: 'LASHES',
}

interface ServiceLike {
  name: string
  category?: string | null
}

// Lash services are the only ones whose names contain "3D" or "volume"
// (3D / Volume / Mega volume full sets + refills). Everything else is nails.
// Mirrors the WHERE clause in sql/003_service_categories.sql.
export function deriveServiceCategory(name: string): ServiceCategory {
  const n = name.toLowerCase()
  if (n.includes('3d') || n.includes('volume')) return 'lashes'
  return 'nails'
}

export function resolveServiceCategory(service: ServiceLike): ServiceCategory {
  if (service.category === 'nails' || service.category === 'lashes') {
    return service.category
  }
  return deriveServiceCategory(service.name)
}

function categoryRank(service: ServiceLike): number {
  return SERVICE_CATEGORY_ORDER[resolveServiceCategory(service)] ?? 99
}

// Stable sort: category rank, then name A–Z within the category.
export function sortServicesByCategory<T extends ServiceLike>(services: T[]): T[] {
  return [...services].sort((a, b) => {
    const ra = categoryRank(a)
    const rb = categoryRank(b)
    if (ra !== rb) return ra - rb
    return a.name.localeCompare(b.name)
  })
}

export interface ServiceGroup<T> {
  key: string
  label: string
  services: T[]
}

// Group into ordered sections (NAILS, then LASHES). Empty sections are omitted.
export function groupServicesByCategory<T extends ServiceLike>(
  services: T[],
): ServiceGroup<T>[] {
  const buckets = new Map<string, T[]>()
  for (const s of sortServicesByCategory(services)) {
    const key = resolveServiceCategory(s)
    const list = buckets.get(key) ?? []
    list.push(s)
    buckets.set(key, list)
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => (SERVICE_CATEGORY_ORDER[a] ?? 99) - (SERVICE_CATEGORY_ORDER[b] ?? 99))
    .map(([key, list]) => ({
      key,
      label: SERVICE_CATEGORY_LABELS[key] ?? key.toUpperCase(),
      services: list,
    }))
}
