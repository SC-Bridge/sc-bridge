-- Add fps_helmets FK to loot_map
ALTER TABLE loot_map ADD COLUMN fps_helmet_id INTEGER REFERENCES fps_helmets(id);

CREATE INDEX IF NOT EXISTS idx_loot_map_fps_helmet ON loot_map(fps_helmet_id);
