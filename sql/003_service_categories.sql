-- Willwin v11 — Service categories (NAILS / LASHES grouping)
--
-- Adds services.category so the admin and client booking UIs can render
-- services grouped into NAILS then LASHES instead of one alphabetical list.
--
-- Backfill rule (mirrors deriveServiceCategory in src/lib/service-categories.ts):
-- lash services are exactly those whose name contains "3D" or "volume"
-- (3D / Volume / Mega volume full sets and refills). Everything else is nails.
--
-- New services default to 'nails'; admins can change the category in the
-- Service editor.
--
-- Idempotent — safe to re-run. Run after 000_initial_schema.sql.

alter table services add column if not exists category text not null default 'nails';

update services
  set category = 'lashes'
  where name ilike '%3d%' or name ilike '%volume%';

-- Everything not matched above stays 'nails' (the column default).
