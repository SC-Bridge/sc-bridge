-- 0252_mining_data_source.sql
--
-- Add data_source TEXT to mineable_rock_entities and mining_global_params
-- (plus their PTU shadows) for provenance — the v2 extractor emits
-- data_source='p4k' on every row, and without this column the upsert SQL
-- fails with "no such column". Matches the pattern used by other
-- p4k-extracted tables (rock_compositions, vehicles, fps_armour, etc.).

ALTER TABLE mineable_rock_entities ADD COLUMN data_source TEXT;
ALTER TABLE ptu_mineable_rock_entities ADD COLUMN data_source TEXT;

ALTER TABLE mining_global_params ADD COLUMN data_source TEXT;
ALTER TABLE ptu_mining_global_params ADD COLUMN data_source TEXT;
