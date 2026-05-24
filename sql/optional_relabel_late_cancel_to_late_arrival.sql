-- Optional, non-destructive cleanup for loyalty history.
--
-- Until first-launch-prep, the app fired `LATE_CANCEL_PENALTY` rows for
-- bookings whose status was set to `LATE` (late arrival). The new policy
-- splits these concepts: late arrival uses `LATE_ARRIVAL_PENALTY`, and
-- `LATE_CANCEL_PENALTY` is reserved for an explicit late-cancellation
-- status that does not exist in the schema yet.
--
-- Production history can remain as-is — the UI maps both event types to
-- distinct labels and the point totals are unaffected (both events are
-- -10). Run this migration ONLY if you want the audit trail to reflect
-- the new naming for past late-arrival events.
--
-- Safety: this is an opt-in script. It is NOT auto-applied by deploys.
-- Take a backup of loyalty_events before running. The update is scoped
-- to rows whose note matches the legacy auto-tag.

BEGIN;

UPDATE loyalty_events
SET event_type = 'LATE_ARRIVAL_PENALTY'
WHERE event_type = 'LATE_CANCEL_PENALTY'
  AND note = 'Auto: late';

COMMIT;
