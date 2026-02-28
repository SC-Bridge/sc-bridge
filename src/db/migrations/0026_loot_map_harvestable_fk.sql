-- Add harvestables FK to loot_map
ALTER TABLE loot_map ADD COLUMN harvestable_id INTEGER REFERENCES harvestables(id);

CREATE INDEX IF NOT EXISTS idx_loot_map_harvestable ON loot_map(harvestable_id);
