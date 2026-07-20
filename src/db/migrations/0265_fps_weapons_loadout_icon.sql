-- 0265_fps_weapons_loadout_icon
--
-- Per-weapon loadout icon URL (#200). Resolved by the fps_weapons extractor from
-- the weapon's displayIcon (or a guarded name-match to the loadouticons set),
-- emitted as a deterministic Cloudflare Images URL. NULL when the game ships no
-- icon for the weapon (e.g. A03 sniper, Zenith laser sniper) — the UI then shows
-- placeholder text.

ALTER TABLE fps_weapons ADD COLUMN loadout_icon TEXT;
