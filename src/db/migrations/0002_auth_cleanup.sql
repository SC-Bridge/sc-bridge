-- Auth Migration: Drop old users table, migrate user-scoped tables to TEXT user IDs
-- Better Auth creates its own 'user' table with TEXT UUID primary keys.
-- Existing user data is wiped — fleet data can be re-imported via HangarXplor.

-- Drop old users table (Better Auth creates 'user' not 'users')
DROP TABLE IF EXISTS users;

-- Clear existing user-scoped data (old INTEGER user_id references are invalid)
DELETE FROM user_fleet;
DELETE FROM user_paints;
DELETE FROM user_llm_configs;
DELETE FROM user_settings;
DELETE FROM ai_analyses;

-- Recreate user_fleet with TEXT user_id
CREATE TABLE IF NOT EXISTS user_fleet_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
    insurance_type_id INTEGER REFERENCES insurance_types(id),
    warbond BOOLEAN NOT NULL DEFAULT FALSE,
    is_loaner BOOLEAN NOT NULL DEFAULT FALSE,
    pledge_id TEXT,
    pledge_name TEXT,
    pledge_cost TEXT,
    pledge_date TEXT,
    custom_name TEXT,
    equipped_paint_id INTEGER REFERENCES paints(id),
    imported_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO user_fleet_new SELECT * FROM user_fleet WHERE 0; -- schema copy, no data
DROP TABLE user_fleet;
ALTER TABLE user_fleet_new RENAME TO user_fleet;
CREATE INDEX IF NOT EXISTS idx_user_fleet_user_id ON user_fleet(user_id);

-- Recreate user_paints with TEXT user_id
CREATE TABLE IF NOT EXISTS user_paints_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    paint_id INTEGER NOT NULL REFERENCES paints(id),
    UNIQUE(user_id, paint_id)
);
DROP TABLE user_paints;
ALTER TABLE user_paints_new RENAME TO user_paints;

-- Recreate user_llm_configs with TEXT user_id
CREATE TABLE IF NOT EXISTS user_llm_configs_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    encrypted_api_key TEXT NOT NULL,
    model TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, provider)
);
DROP TABLE user_llm_configs;
ALTER TABLE user_llm_configs_new RENAME TO user_llm_configs;

-- Recreate user_settings with TEXT user_id
CREATE TABLE IF NOT EXISTS user_settings_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    UNIQUE(user_id, key)
);
DROP TABLE user_settings;
ALTER TABLE user_settings_new RENAME TO user_settings;

-- Recreate ai_analyses with TEXT user_id
CREATE TABLE IF NOT EXISTS ai_analyses_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    vehicle_count INTEGER NOT NULL,
    analysis TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DROP TABLE ai_analyses;
ALTER TABLE ai_analyses_new RENAME TO ai_analyses;
