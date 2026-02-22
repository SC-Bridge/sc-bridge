-- Auth Migration: Drop old users table, migrate user-scoped tables to TEXT user IDs
-- Better Auth creates its own 'user' table with TEXT UUID primary keys.
-- Existing user data is wiped — fleet data can be re-imported via HangarXplor.

-- Drop dependent tables first (they have FK references to users(id))
DROP TABLE IF EXISTS ai_analyses;
DROP TABLE IF EXISTS user_settings;
DROP TABLE IF EXISTS user_llm_configs;
DROP TABLE IF EXISTS user_paints;
DROP TABLE IF EXISTS user_fleet;

-- Now safe to drop old users table (Better Auth creates 'user' not 'users')
DROP TABLE IF EXISTS users;

-- Recreate user_fleet with TEXT user_id (no FK to users — Better Auth manages its own table)
CREATE TABLE user_fleet (
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
CREATE INDEX IF NOT EXISTS idx_user_fleet_user_id ON user_fleet(user_id);

-- Recreate user_paints with TEXT user_id
CREATE TABLE user_paints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    paint_id INTEGER NOT NULL REFERENCES paints(id),
    UNIQUE(user_id, paint_id)
);

-- Recreate user_llm_configs with TEXT user_id
CREATE TABLE user_llm_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    encrypted_api_key TEXT NOT NULL,
    model TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, provider)
);

-- Recreate user_settings with TEXT user_id
CREATE TABLE user_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    UNIQUE(user_id, key)
);

-- Recreate ai_analyses with TEXT user_id
CREATE TABLE ai_analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    vehicle_count INTEGER NOT NULL,
    analysis TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

