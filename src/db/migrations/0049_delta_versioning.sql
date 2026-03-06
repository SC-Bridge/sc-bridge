-- Delta versioning support for loot_map
--
-- Enables "latest as of" queries so that only changed items need new rows
-- per game version. Items unchanged between patches are not duplicated.
--
-- Changes:
--   1. Add `removed` column (tombstone for items deleted in a patch)
--   2. Add composite index on (uuid, game_version_id) for efficient
--      MAX(game_version_id) GROUP BY uuid lookups

ALTER TABLE loot_map ADD COLUMN removed INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_loot_map_uuid_gv ON loot_map(uuid, game_version_id);
