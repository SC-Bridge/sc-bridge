-- Hull HP total and per-part breakdown for the ship pages ("Total + parts").
--
-- vehicles.hull_hp keeps its meaning: the hull (body) part's damageMax, the
-- part whose destruction is the ship's. Two new columns come from the same
-- vehicle implementation XML (tools pipeline, enrich/vehicle_xml.py):
--   hull_hp_total   REAL  sum of damageMax over every structural Part (every
--                         Part that is not an ItemPort), modification applied.
--   hull_parts_json TEXT  those parts in XML order:
--                         [{"name","hp","parent","vital"}]; vital = the part
--                         runs the vehicle's Destroy damage group.
-- A JSON column rather than a vehicle_* child table: the parts are only ever
-- read together with their vehicle on /api/ships/:slug, never queried or
-- filtered, so a child table would add a versioned table, a PTU shadow and
-- FK resolution in the loader for no reader.
--
-- Deploy order: apply this migration BEFORE deploying code that reads the
-- columns (the ship detail SELECT names them) and BEFORE any load with the
-- tools pipeline that emits them (the vehicles upsert names them).
--
-- NOTE: ALTER TABLE ... ADD COLUMN is NOT idempotent. This is a normal
-- numbered migration applied once by wrangler; if it ever has to be re-run by
-- hand (`d1 execute --file`), skip each statement whose column
-- pragma_table_info('<table>') already lists. All four add nullable columns:
-- zero row writes.
--
-- 1. PTU shadow. ptu_vehicles exists on staging and production (checked
--    2026-11-14). It already lacks hull_hp and several other base columns;
--    that drift is left as it is. If a PTU purge has dropped the table, skip
--    these two statements.
ALTER TABLE ptu_vehicles ADD COLUMN hull_hp_total REAL;
ALTER TABLE ptu_vehicles ADD COLUMN hull_parts_json TEXT;

-- 2. Base table.
ALTER TABLE vehicles ADD COLUMN hull_hp_total REAL;
ALTER TABLE vehicles ADD COLUMN hull_parts_json TEXT;
