@AGENTS.md

## Permanent Rules

- start_at date range filters in Supabase must use space separator for dayStart ("2026-04-06 00:00:00") and T separator for dayEnd ("2026-04-06T23:59:59") to capture both formats. Never use T separator for dayStart — it will exclude all space-separated bookings.
- Deployed to Vercel. ADMIN_PASSWORD, SUPABASE_URL, SUPABASE_ANON_KEY must all be set in Vercel dashboard.
- Booking status lifecycle: PENDING → CONFIRMED → ARRIVED. VISIT_SPEND fires on ARRIVED only. CANCELLED frees the slot. PENDING is the default on create.
- Admin Settings writes (services, team_members, business_hours, tech_availability, tenant_features) go through the browser anon client and require the anon write RLS policies in sql/002_admin_settings_write_policies.sql. Without that migration applied, RLS silently blocks the writes (UPDATE/DELETE hit 0 rows, INSERT is rejected) and Settings changes revert on refresh. The anon key is a low-trust password behind ADMIN_PASSWORD — keep the dashboard URL non-guessable until these writes move server-side to the service role.
- Services render grouped by services.category (NAILS then LASHES, name A–Z within each). The column is added/backfilled by sql/003_service_categories.sql; service SELECTs reference it, so that migration must be applied or services queries error. Grouping/ordering lives in src/lib/service-categories.ts, which falls back to deriving the category from the service name ("3D"/"volume" → lashes, else nails) when category is null.
