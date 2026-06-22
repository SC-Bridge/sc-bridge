-- Distinguish how a fleet ship was acquired so in-game (aUEC) purchases can be
-- tracked alongside real-money pledges. 'pledge' = imported from HangarXplor /
-- RSI hangar (managed by re-import); 'ingame' = manually added, bought in-game,
-- and reset on a server wipe. The import sweep (executeFleetSwap) only deletes
-- source='pledge' rows, so in-game ships survive re-imports.
ALTER TABLE user_fleet ADD COLUMN source TEXT NOT NULL DEFAULT 'pledge';
CREATE INDEX idx_user_fleet_source ON user_fleet(user_id, source);
