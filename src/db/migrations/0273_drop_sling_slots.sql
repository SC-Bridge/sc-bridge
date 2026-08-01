-- 0273_drop_sling_slots
--
-- Slings removed (2026-07-30): the game's wep_stocked ports are where
-- primary/secondary physically live — modeling them as EXTRA slots
-- double-counted long-gun capacity, and gating weapon slots by armour was
-- rejected for usability. Deletes any rows saved while slings existed on
-- staging (slings never reached prod). Idempotent by construction.

DELETE FROM user_fps_loadout_slots WHERE slot_key IN ('sling_1', 'sling_2');
