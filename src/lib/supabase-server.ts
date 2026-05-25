import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cached: SupabaseClient | null = null

export function getServerSupabase(): SupabaseClient {
  if (cached) return cached
  // Accept either the NEXT_PUBLIC_* names (used by the browser client) or the
  // bare SUPABASE_* names — Vercel projects have been configured with both.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error(
      `Supabase env vars missing on server (url:${url ? 'ok' : 'MISSING'} key:${key ? 'ok' : 'MISSING'}). ` +
        'Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and an anon/service-role key in Vercel.',
    )
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cached
}
