-- Bug 3 — dedupe loyalty events per booking + event type.
-- Run in the Supabase SQL editor.
alter table loyalty_events add column booking_id uuid references bookings(id);
