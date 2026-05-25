-- Willwin v11 — Admin settings write policies
--
-- Fixes the admin Settings page (Hours, Tech Availability, Services, Team,
-- General/signature) silently failing to persist — changes reverted on hard
-- refresh and deletes did nothing.
--
-- Root cause: the admin SPA writes these tables with the ANON key (behind the
-- ADMIN_PASSWORD cookie), but 001_rls_policies.sql granted anon SELECT-only on
-- them. With RLS on and no write policy, UPDATE/DELETE matched zero rows (no
-- error) and INSERT was rejected. This grants anon write access, exactly
-- mirroring the existing "anon rw bookings / customers / ..." policies in 001.
--
-- Security posture is unchanged from 001's documented first-launch model: the
-- anon key is treated as a low-trust password and the dashboard URL must not be
-- publicly guessable. These five tables are non-PII reference data — strictly
-- less sensitive than customers/bookings, which 001 already exposes to anon.
-- To harden before the URL is public: move admin writes to server routes using
-- the service role and drop the policies below (and the anon rw policies in 001).
--
-- Idempotent — safe to re-run. Run after 001_rls_policies.sql.

drop policy if exists "anon write services" on services;
create policy "anon write services" on services
  for all to anon using (true) with check (true);

drop policy if exists "anon write team_members" on team_members;
create policy "anon write team_members" on team_members
  for all to anon using (true) with check (true);

drop policy if exists "anon write business_hours" on business_hours;
create policy "anon write business_hours" on business_hours
  for all to anon using (true) with check (true);

drop policy if exists "anon write tech_availability" on tech_availability;
create policy "anon write tech_availability" on tech_availability
  for all to anon using (true) with check (true);

drop policy if exists "anon write tenant_features" on tenant_features;
create policy "anon write tenant_features" on tenant_features
  for all to anon using (true) with check (true);
