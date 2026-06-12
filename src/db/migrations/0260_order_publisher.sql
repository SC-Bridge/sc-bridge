-- Accountant M5 follow-up — order publisher (owner spec 2026-06-13).
-- The poster's display name is SNAPSHOTTED onto the order at creation time
-- (design accountant-m5-design.md §10: poster display handle is the only
-- identity the future public market exposes). A later account rename must
-- NOT change historical orders, so this is a stored column, not a JOIN.

ALTER TABLE accountant_orders ADD COLUMN publisher TEXT;

-- Backfill existing rows from the Better Auth user table.
UPDATE accountant_orders
SET publisher = (SELECT name FROM "user" WHERE "user".id = accountant_orders.user_id);
