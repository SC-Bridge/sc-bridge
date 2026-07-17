-- Deduplicate mining_location_deposits and add the missing natural-key UNIQUE.
--
-- The table had no unique constraint, so the data pipeline's INSERT OR IGNORE
-- never ignored anything: every load re-inserted its full deposit set, and
-- staging had accumulated ~74x duplication (36,570 rows for ~620 distinct
-- deposits). Nothing references mining_location_deposits.id, so keeping
-- MIN(id) per natural key loses nothing.
--
-- NULLs never conflict in SQLite UNIQUE indexes, so the two nullable key
-- columns are wrapped in COALESCE — otherwise rows with NULL rock/clustering
-- would keep duplicating forever.
DELETE FROM mining_location_deposits WHERE id NOT IN (
  SELECT MIN(id) FROM mining_location_deposits
  GROUP BY mining_location_id, group_name, composition_guid,
           COALESCE(clustering_preset_guid, ''), COALESCE(rock_composition_id, -1)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mining_location_deposits_natural_key
  ON mining_location_deposits(
    mining_location_id, group_name, composition_guid,
    COALESCE(clustering_preset_guid, ''), COALESCE(rock_composition_id, -1));
