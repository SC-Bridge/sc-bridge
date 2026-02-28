-- Add fps_clothing FK to loot_map
ALTER TABLE loot_map ADD COLUMN fps_clothing_id INTEGER REFERENCES fps_clothing(id);

CREATE INDEX IF NOT EXISTS idx_loot_map_fps_clothing ON loot_map(fps_clothing_id);
