-- 0268_fps_attachments_zoom_time_scale
--
-- ADS (aim-down-sight) speed multiplier for weapon attachments, from the
-- p4k SWeaponModifierComponentParams .modifier.weaponStats.aimModifier
-- .zoomTimeScale. >1 = faster ADS (holos/red-dots ~1.05-1.15), <1 = slower
-- (16x sniper scopes 0.75, heavy compensators 0.65). NULL when the game
-- record carries no aim modifier. Backfilled for 4.8.2 from the extracted
-- DataCore records; emitted by the v2 extraction pipeline going forward.

ALTER TABLE fps_attachments ADD COLUMN zoom_time_scale REAL;
