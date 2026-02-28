-- Add props FK to loot_map
ALTER TABLE loot_map ADD COLUMN props_id INTEGER REFERENCES props(id);

CREATE INDEX IF NOT EXISTS idx_loot_map_props ON loot_map(props_id);
