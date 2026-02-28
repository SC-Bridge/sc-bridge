-- Add consumables FK to loot_map
ALTER TABLE loot_map ADD COLUMN consumable_id INTEGER REFERENCES consumables(id);

CREATE INDEX IF NOT EXISTS idx_loot_map_consumable ON loot_map(consumable_id);
