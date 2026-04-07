@AGENTS.md

## Permanent Rules

- start_at date range filters in Supabase must use space separator for dayStart ("2026-04-06 00:00:00") and T separator for dayEnd ("2026-04-06T23:59:59") to capture both formats. Never use T separator for dayStart — it will exclude all space-separated bookings.
- Deployed to Vercel. ADMIN_PASSWORD, SUPABASE_URL, SUPABASE_ANON_KEY must all be set in Vercel dashboard.
