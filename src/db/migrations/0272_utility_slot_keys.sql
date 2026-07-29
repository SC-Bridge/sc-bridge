-- 0272_utility_slot_keys
--
-- Slice 3 (#200): multi-instance utility slots use ordinal slot KEYS
-- (grenade_1..4, pen_1..4, mag_1..8, sling_1..2, util_gadget, util_knife) on
-- the existing UNIQUE(loadout_id, slot_key) table — no schema change. The
-- three legacy single-tile keys are rewritten to their new homes. Plain
-- UPDATEs: the new keys cannot pre-exist (the old API enum rejected them),
-- and UNIQUE aborts the batch safely if that assumption is ever wrong.
-- Idempotent by construction (re-run finds no legacy rows).

UPDATE user_fps_loadout_slots SET slot_key = 'pen_1'       WHERE slot_key = 'medical';
UPDATE user_fps_loadout_slots SET slot_key = 'util_gadget' WHERE slot_key = 'gadget';
UPDATE user_fps_loadout_slots SET slot_key = 'grenade_1'   WHERE slot_key = 'throwable';
