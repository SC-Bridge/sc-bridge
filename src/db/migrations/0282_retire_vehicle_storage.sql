-- Retire the stale storage taxonomy: vehicle_storage, ptu_vehicle_storage and
-- vehicles.internal_cargo_scu (added by 0238 / 0239 / 0240).
--
-- They were filled once, in May 2026, by a pipeline stage that never reached
-- the tools main branch. No load since has written them: vehicle_storage has
-- 0 rows on staging and production, and internal_cargo_scu is NULL for every
-- ship added since and contradicts vehicles.cargo for others (Argo MOLE 96 vs
-- 32). vehicles.cargo (+ vehicle_modules.cargo) is the maintained figure.
-- external_cargo_scu, fuel_cargo_scu, personal_grid_microscu and locker_count
-- stay as they are.
--
-- ORDER OF OPERATIONS — apply this AFTER the code that no longer reads these
-- is deployed (the previous worker selects v.internal_cargo_scu and queries
-- vehicle_storage on every ship page, and would 500 without them). Staging
-- first, then production.
--
-- 1. Detail tables. IF EXISTS throughout: the ptu_ shadow table may not exist
--    on a given environment (a PTU purge, DELETE /api/admin/versions/ptu,
--    drops shadows). Nothing references either table by foreign key. Both
--    are empty, so these are zero row writes.
DROP INDEX IF EXISTS idx_ptu_vehicle_storage_vehicle;
DROP INDEX IF EXISTS idx_ptu_vehicle_storage_type;
DROP TABLE IF EXISTS ptu_vehicle_storage;

DROP INDEX IF EXISTS idx_vehicle_storage_vehicle;
DROP INDEX IF EXISTS idx_vehicle_storage_type;
DROP TABLE IF EXISTS vehicle_storage;

-- 2. Base column. Kept last on purpose. ptu_vehicles never had this column.
--    Plain REAL column: no index, view, trigger, PK, FK or UNIQUE mentions it,
--    so DROP COLUMN is allowed and leaves every other column untouched
--    (checked on local copies of the staging and production databases with
--    foreign keys ON: row count and a checksum of the remaining columns are
--    identical before and after).
--    NOTE: DROP COLUMN is NOT idempotent. Applied once by wrangler; if ever
--    re-run by hand, skip this statement when pragma_table_info('vehicles')
--    no longer lists internal_cargo_scu (everything above is safe to repeat).
--    Row writes: SQLite rewrites every vehicles row — one write per row
--    (334 on production and 334 on staging as of 2026-11-13).
ALTER TABLE vehicles DROP COLUMN internal_cargo_scu;
