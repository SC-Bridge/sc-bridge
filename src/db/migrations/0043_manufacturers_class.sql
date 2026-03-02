-- 0043_manufacturers_class.sql
--
-- Add class column to manufacturers.
-- This column was present before migration 0037 rebuilt the table but was not
-- included in the 0037 CREATE TABLE statement, causing the loadout query
-- (getShipLoadout in queries.ts) to fail with 'no such column: m.class'.

ALTER TABLE manufacturers ADD COLUMN class TEXT;
