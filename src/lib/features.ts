import { supabase } from './supabase'

export type TenantFeatures = {
  tenant_id: string
  loyalty_tiers: boolean
  group_booking: boolean
  tiered_pricing: boolean
  addon_services: boolean
  gap_optimization: boolean
  admin_signature: string | null
}

export async function getFeatures(): Promise<TenantFeatures | null> {
  // TODO: scope to .eq('tenant_id', tenantId) when multi-tenant
  const { data } = await supabase
    .from('tenant_features')
    .select('*')
    .single()
  return data as TenantFeatures | null
}
