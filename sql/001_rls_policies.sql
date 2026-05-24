-- Willwin v11 — Row-Level Security policy guidance
--
-- The Next.js app uses the public anon key and is gated by a single shared
-- ADMIN_PASSWORD cookie. There is no per-row Supabase auth user. The public
-- /book flow goes through n8n webhooks (server-side service role), NOT the
-- anon client, so we can lock the anon role down hard.
--
-- TL;DR for production:
--   * Anon role: read-only access to non-PII reference tables, no writes.
--   * Service role (used by n8n): unrestricted (RLS bypassed by default).
--   * Admin app: should be migrated to use the service role via a
--     server-side Next.js API route. Until then, treat the anon key as
--     a low-trust password — never expose it on a public URL that
--     mutates customer or booking data.
--
-- Run after 000_initial_schema.sql.

-- ─── enable RLS on every table ────────────────────────────────────────────

alter table customers              enable row level security;
alter table team_members           enable row level security;
alter table services               enable row level security;
alter table bookings               enable row level security;
alter table appointment_segments   enable row level security;
alter table business_hours         enable row level security;
alter table tech_availability      enable row level security;
alter table loyalty_events         enable row level security;
alter table tenant_features        enable row level security;
alter table admin_login_log        enable row level security;

-- ─── anon: read-only reference data ───────────────────────────────────────
-- These rows are non-PII and the public /book page reads them at SSR time
-- through the n8n init webhook, but the admin SPA still calls them
-- directly via the anon client.

create policy "anon read services" on services
  for select to anon using (true);

create policy "anon read team_members" on team_members
  for select to anon using (true);

create policy "anon read business_hours" on business_hours
  for select to anon using (true);

create policy "anon read tech_availability" on tech_availability
  for select to anon using (true);

create policy "anon read tenant_features" on tenant_features
  for select to anon using (true);

-- ─── anon: customers / bookings / segments / loyalty ─────────────────────
--
-- The current admin SPA reads and writes these tables with the anon key
-- because it lives behind the ADMIN_PASSWORD cookie. That's a known
-- temporary shortcut documented in CLAUDE.md.
--
-- For first launch we leave full anon access ON for these tables so the
-- admin UI keeps working. Before you make the dashboard URL publicly
-- guessable, migrate writes to server routes that use the service role
-- and remove the policies below.

create policy "anon rw customers" on customers
  for all to anon using (true) with check (true);

create policy "anon rw bookings" on bookings
  for all to anon using (true) with check (true);

create policy "anon rw appointment_segments" on appointment_segments
  for all to anon using (true) with check (true);

create policy "anon rw loyalty_events" on loyalty_events
  for all to anon using (true) with check (true);

-- ─── admin_login_log: insert-only from anon ──────────────────────────────
-- Successful logins POST a row from the login route (server-side, but
-- still using the anon key). Never expose SELECT.

create policy "anon insert admin_login_log" on admin_login_log
  for insert to anon with check (true);

-- service_role (Supabase default) bypasses all of the above. n8n should
-- always use the SERVICE_ROLE key, never the anon key.
