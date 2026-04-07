-- Bug 3 — dedupe loyalty events per booking + event type.
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.

alter table loyalty_events
  add column if not exists booking_id uuid references bookings(id);

-- Index used by the dedupe check in addLoyaltyEvent.
create index if not exists loyalty_events_booking_event_idx
  on loyalty_events (customer_id, booking_id, event_type);

-- Verification: should show the booking_id column.
-- select column_name from information_schema.columns
--   where table_name = 'loyalty_events' and column_name = 'booking_id';
