-- Willwin v11 — Restore / correct the service menu
--
-- Run this ONLY if the Services list is actually empty or has wrong prices.
-- (If /book was failing because of a missing column, fixing the app code is
-- enough — the rows were never deleted — and this script is a no-op-ish
-- correction.)
--
-- Idempotent and safe to re-run: it corrects the price of any service that
-- already exists (matched by exact name) and inserts only the ones that are
-- missing. It never duplicates rows and never deletes anything (so it can't
-- trip the appointment_segments FK).
--
-- Prices come from the salon's reference menu. Names match the canonical
-- stored names (with their parenthetical notes). Category is NOT set here —
-- the app derives NAILS/LASHES from the name (see src/lib/service-categories.ts).

with menu(name, price) as (
  values
    -- NAILS
    ('Full set extensions (1 color)', 60),
    ('Full set with french or design', 70),
    ('Refill up to 3 weeks (french/design not included)', 50),
    ('Shellac manicure (with cuticle care)', 50),
    ('Shellac color change (no cuticle care)', 40),
    ('Gel color change on toes (no cuticle care)', 40),
    ('Pedicure with gel polish (french not included)', 60),
    ('Pedicure with gel polish + 2 big toe extensions', 75),
    ('Pedicure (cleaning only)', 50),
    ('Pedicure + gel manicure (french not included)', 105),
    ('Nail design (price varies by complexity)', 15),
    -- LASHES
    ('3D extensions full set', 120),
    ('Volume full set', 140),
    ('Mega volume full set', 160),
    ('3D refill (2 weeks) (shampoo included)', 75),
    ('3D refill (3 weeks) (shampoo included)', 85),
    ('Volume refill (2 weeks) (shampoo included)', 85),
    ('Volume refill (3 weeks) (shampoo included)', 95),
    ('Mega volume refill (2 weeks) (shampoo included)', 95),
    ('Mega volume refill (3 weeks) (shampoo included)', 105)
)
-- 1) Correct price + reactivate any service that already exists.
, corrected as (
  update services s
     set price = m.price,
         is_active = true
    from menu m
   where s.name = m.name
  returning s.name
)
-- 2) Insert only the services that are missing (default 30 min duration).
insert into services (name, duration_minutes, price, is_active)
select m.name, 30, m.price, true
  from menu m
 where m.name not in (select name from corrected)
   and not exists (select 1 from services s where s.name = m.name);
