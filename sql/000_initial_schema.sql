-- Willwin v11 — Canonical initial schema
--
-- Run once in the Supabase SQL editor on a fresh project. Idempotent —
-- every CREATE uses IF NOT EXISTS. Safe to re-run.
--
-- This file is the source of truth for the database structure that the
-- Next.js app and the n8n workflows assume. The booking flow, admin UI,
-- and loyalty system all break silently if a column is missing.
--
-- Notes on conventions:
--   * start_at, open_time, close_time, last_visit_at, logged_in_at are TEXT,
--     never timestamptz. The app does string slicing / comparisons and never
--     calls new Date() on user-facing values. See AGENTS.md.
--   * day_of_week is an int 0..6 (Sun=0, Sat=6) matching JS getDay().
--   * Money is stored as INTEGER (units of the salon's currency — CAD).
--     No fractional cents needed for the current price list.

-- ─── extensions ────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ─── core ──────────────────────────────────────────────────────────────────

create table if not exists customers (
  id                   uuid primary key default gen_random_uuid(),
  first_name           text not null,
  last_name            text not null,
  phone                text,
  email                text,
  notes                text,
  alert                text,
  birthday             text,
  referred_by          uuid,
  preferred_tech_id    uuid,
  loyalty_points       int  not null default 0,
  loyalty_tier         text,
  last_visit_at        text,
  language             text,
  created_at           timestamptz not null default now()
);

create index if not exists customers_phone_idx on customers (phone);
create index if not exists customers_last_name_idx on customers (last_name);

create table if not exists team_members (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  color         text,
  avatar_url    text,
  is_active     boolean not null default true,
  working_days  text,
  created_at    timestamptz not null default now()
);

create table if not exists services (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  name_en           text,
  duration_minutes  int  not null,
  price             int  not null,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);

-- ─── bookings ──────────────────────────────────────────────────────────────

create table if not exists bookings (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references customers(id) on delete restrict,
  start_at     text not null,
  status       text not null default 'PENDING',
  notes        text,
  source       text,           -- 'client' | null (admin-created)
  created_at   timestamptz not null default now()
);

create index if not exists bookings_start_at_idx on bookings (start_at);
create index if not exists bookings_customer_idx on bookings (customer_id);
create index if not exists bookings_status_idx   on bookings (status);

create table if not exists appointment_segments (
  id                uuid primary key default gen_random_uuid(),
  booking_id        uuid not null references bookings(id) on delete cascade,
  team_member_id    uuid not null references team_members(id) on delete restrict,
  service_id        uuid not null references services(id) on delete restrict,
  duration_minutes  int  not null
);

create index if not exists segments_booking_idx       on appointment_segments (booking_id);
create index if not exists segments_team_member_idx   on appointment_segments (team_member_id);

-- ─── availability / hours ─────────────────────────────────────────────────

create table if not exists business_hours (
  id            uuid primary key default gen_random_uuid(),
  day_of_week   int  not null check (day_of_week between 0 and 6),
  is_open       boolean not null default true,
  open_time     text,
  close_time    text,
  unique (day_of_week)
);

create table if not exists tech_availability (
  id              uuid primary key default gen_random_uuid(),
  team_member_id  uuid not null references team_members(id) on delete cascade,
  day_of_week     int  not null check (day_of_week between 0 and 6),
  unique (team_member_id, day_of_week)
);

create index if not exists tech_availability_dow_idx on tech_availability (day_of_week);

-- ─── loyalty ───────────────────────────────────────────────────────────────

create table if not exists loyalty_events (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references customers(id) on delete cascade,
  booking_id   uuid references bookings(id) on delete set null,
  event_type   text not null,
  points       int  not null,
  note         text,
  created_at   timestamptz not null default now()
);

create index if not exists loyalty_events_customer_idx on loyalty_events (customer_id);
create index if not exists loyalty_events_booking_event_idx
  on loyalty_events (customer_id, booking_id, event_type);

-- ─── tenant features (single-row feature flags) ───────────────────────────

create table if not exists tenant_features (
  tenant_id          uuid primary key default gen_random_uuid(),
  loyalty_tiers      boolean not null default true,
  group_booking      boolean not null default false,
  tiered_pricing     boolean not null default false,
  addon_services     boolean not null default false,
  gap_optimization   boolean not null default true,
  admin_signature    text
);

-- Seed a single feature row on first install. The app calls .single() so
-- exactly one row must exist.
insert into tenant_features (loyalty_tiers, group_booking, tiered_pricing, addon_services, gap_optimization)
  select true, false, false, false, true
  where not exists (select 1 from tenant_features);

-- ─── admin login audit ────────────────────────────────────────────────────

create table if not exists admin_login_log (
  id            uuid primary key default gen_random_uuid(),
  logged_in_at  text not null,            -- 'YYYY-MM-DD HH:MM'
  ip_address    text not null default 'unknown',
  user_agent    text not null default 'unknown'
);

create index if not exists admin_login_log_logged_in_at_idx
  on admin_login_log (logged_in_at desc);

-- ─── default business hours (Tue–Sat open, Sun/Mon closed) ────────────────

insert into business_hours (day_of_week, is_open, open_time, close_time)
  select g.dow,
         g.dow between 2 and 6,
         case when g.dow between 2 and 6 then '09:00' else null end,
         case when g.dow between 2 and 6 then '20:00' else null end
  from generate_series(0, 6) as g(dow)
  on conflict (day_of_week) do nothing;
