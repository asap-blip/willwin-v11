import { supabase } from '@/lib/supabase'
import type { Customer, TeamMember } from '@/lib/types'
import { ClientProfileView } from '@/components/client/ClientProfileView'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ClientProfilePage({ params }: PageProps) {
  const { id } = await params

  // TODO: scope to .eq('tenant_id', tenantId) when tenant_id column exists
  const [customerResult, teamMembersResult] = await Promise.all([
    supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .single(),
    supabase
      .from('team_members')
      .select('id, name, is_active')
      .eq('is_active', true)
      .order('name'),
  ])

  if (!customerResult.data) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Client not found</p>
      </div>
    )
  }

  return (
    <ClientProfileView
      customer={customerResult.data as Customer}
      teamMembers={(teamMembersResult.data as TeamMember[]) ?? []}
    />
  )
}
