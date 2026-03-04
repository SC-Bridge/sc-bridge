-- Fleet Manager D1 Schema
-- Ported from internal/database/migrations.go (25 tables)

-- ============================================================
-- Lookup Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS vehicle_types (
    id INTEGER PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS insurance_types (
    id INTEGER PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL,
    duration_months INTEGER,
    is_lifetime BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS sync_sources (
    id INTEGER PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS production_statuses (
    id INTEGER PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL
);

-- ============================================================
-- Core Reference Data
-- ============================================================

CREATE TABLE IF NOT EXISTS manufacturers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    code TEXT,
    known_for TEXT,
    description TEXT,
    logo_url TEXT,
    raw_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS game_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE NOT NULL,
    code TEXT UNIQUE NOT NULL,
    channel TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    released_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vehicles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    class_name TEXT,
    manufacturer_id INTEGER REFERENCES manufacturers(id),
    vehicle_type_id INTEGER REFERENCES vehicle_types(id),
    production_status_id INTEGER REFERENCES production_statuses(id),
    size INTEGER,
    size_label TEXT,
    focus TEXT,
    classification TEXT,
    description TEXT,
    length REAL,
    beam REAL,
    height REAL,
    mass REAL,
    cargo REAL,
    vehicle_inventory REAL,
    crew_min INTEGER,
    crew_max INTEGER,
    speed_scm REAL,
    speed_max REAL,
    health REAL,
    pledge_price REAL,
    price_auec REAL,
    on_sale BOOLEAN DEFAULT FALSE,
    image_url TEXT,
    image_url_small TEXT,
    image_url_medium TEXT,
    image_url_large TEXT,
    pledge_url TEXT,
    game_version_id INTEGER REFERENCES game_versions(id),
    acquisition_type TEXT,
    raw_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE NOT NULL,
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
    parent_port_id INTEGER REFERENCES ports(id),
    name TEXT NOT NULL,
    position TEXT,
    category_label TEXT,
    size_min INTEGER,
    size_max INTEGER,
    port_type TEXT,
    port_subtype TEXT,
    equipped_item_uuid TEXT,
    editable BOOLEAN DEFAULT TRUE,
    health REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS components (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    slug TEXT,
    class_name TEXT,
    manufacturer_id INTEGER REFERENCES manufacturers(id),
    type TEXT NOT NULL,
    sub_type TEXT,
    size INTEGER,
    grade TEXT,
    description TEXT,
    game_version_id INTEGER REFERENCES game_versions(id),
    raw_data TEXT,
    stats_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fps_weapons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    slug TEXT,
    class_name TEXT,
    manufacturer_id INTEGER REFERENCES manufacturers(id),
    sub_type TEXT,
    size INTEGER,
    description TEXT,
    game_version_id INTEGER REFERENCES game_versions(id),
    raw_data TEXT,
    stats_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fps_armour (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    slug TEXT,
    class_name TEXT,
    manufacturer_id INTEGER REFERENCES manufacturers(id),
    sub_type TEXT,
    size INTEGER,
    grade TEXT,
    description TEXT,
    game_version_id INTEGER REFERENCES game_versions(id),
    raw_data TEXT,
    stats_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fps_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    slug TEXT,
    class_name TEXT,
    manufacturer_id INTEGER REFERENCES manufacturers(id),
    sub_type TEXT,
    size INTEGER,
    description TEXT,
    game_version_id INTEGER REFERENCES game_versions(id),
    raw_data TEXT,
    stats_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fps_ammo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    slug TEXT,
    class_name TEXT,
    manufacturer_id INTEGER REFERENCES manufacturers(id),
    sub_type TEXT,
    description TEXT,
    game_version_id INTEGER REFERENCES game_versions(id),
    raw_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fps_utilities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    slug TEXT,
    class_name TEXT,
    manufacturer_id INTEGER REFERENCES manufacturers(id),
    sub_type TEXT,
    description TEXT,
    game_version_id INTEGER REFERENCES game_versions(id),
    raw_data TEXT,
    stats_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS paints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE,
    name TEXT NOT NULL,
    slug TEXT,
    class_name TEXT UNIQUE,
    description TEXT,
    image_url TEXT,
    image_url_small TEXT,
    image_url_medium TEXT,
    image_url_large TEXT,
    raw_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS paint_vehicles (
    paint_id INTEGER NOT NULL REFERENCES paints(id),
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
    PRIMARY KEY (paint_id, vehicle_id)
);

CREATE TABLE IF NOT EXISTS vehicle_loaners (
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
    loaner_id INTEGER NOT NULL REFERENCES vehicles(id),
    PRIMARY KEY (vehicle_id, loaner_id)
);

-- ============================================================
-- User Data
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    handle TEXT,
    email TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_fleet (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
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

CREATE TABLE IF NOT EXISTS user_paints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    paint_id INTEGER NOT NULL REFERENCES paints(id),
    UNIQUE(user_id, paint_id)
);

CREATE TABLE IF NOT EXISTS user_llm_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    provider TEXT NOT NULL,
    encrypted_api_key TEXT NOT NULL,
    model TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, provider)
);

CREATE TABLE IF NOT EXISTS user_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    UNIQUE(user_id, key)
);

-- ============================================================
-- Sync & Audit
-- ============================================================

CREATE TABLE IF NOT EXISTS sync_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER NOT NULL REFERENCES sync_sources(id),
    endpoint TEXT,
    status TEXT NOT NULL,
    record_count INTEGER DEFAULT 0,
    error_message TEXT,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
);

CREATE TABLE IF NOT EXISTS ai_analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    vehicle_count INTEGER NOT NULL,
    analysis TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_paint_vehicles_vehicle_id ON paint_vehicles(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_user_fleet_user_id ON user_fleet(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_history_started_at ON sync_history(started_at);

-- ============================================================
-- Seed: Lookup Tables
-- ============================================================

-- Vehicle types
INSERT OR IGNORE INTO vehicle_types (id, key, label) VALUES (1, 'spaceship', 'Spaceship');
INSERT OR IGNORE INTO vehicle_types (id, key, label) VALUES (2, 'ground_vehicle', 'Ground Vehicle');
INSERT OR IGNORE INTO vehicle_types (id, key, label) VALUES (3, 'gravlev', 'Gravlev');

-- Insurance types
INSERT OR IGNORE INTO insurance_types (id, key, label, duration_months, is_lifetime) VALUES (1, 'lti', 'Lifetime Insurance', NULL, TRUE);
INSERT OR IGNORE INTO insurance_types (id, key, label, duration_months, is_lifetime) VALUES (2, '120_month', '120-Month Insurance', 120, FALSE);
INSERT OR IGNORE INTO insurance_types (id, key, label, duration_months, is_lifetime) VALUES (3, '72_month', '72-Month Insurance', 72, FALSE);
INSERT OR IGNORE INTO insurance_types (id, key, label, duration_months, is_lifetime) VALUES (4, '6_month', '6-Month Insurance', 6, FALSE);
INSERT OR IGNORE INTO insurance_types (id, key, label, duration_months, is_lifetime) VALUES (5, '3_month', '3-Month Insurance', 3, FALSE);
INSERT OR IGNORE INTO insurance_types (id, key, label, duration_months, is_lifetime) VALUES (6, 'standard', 'Standard Insurance', NULL, FALSE);
INSERT OR IGNORE INTO insurance_types (id, key, label, duration_months, is_lifetime) VALUES (7, 'unknown', 'Unknown Insurance', NULL, FALSE);

-- Sync sources
INSERT OR IGNORE INTO sync_sources (id, key, label) VALUES (1, 'scwiki', 'SC Wiki API');
INSERT OR IGNORE INTO sync_sources (id, key, label) VALUES (2, 'fleetyards', 'FleetYards (Images Only)');
INSERT OR IGNORE INTO sync_sources (id, key, label) VALUES (3, 'hangarxplor', 'HangarXplor');
INSERT OR IGNORE INTO sync_sources (id, key, label) VALUES (4, 'scunpacked', 'scunpacked-data (Paints)');
INSERT OR IGNORE INTO sync_sources (id, key, label) VALUES (5, 'rsi_api', 'RSI API (Images)');

-- Production statuses
INSERT OR IGNORE INTO production_statuses (id, key, label) VALUES (1, 'flight_ready', 'Flight Ready');
INSERT OR IGNORE INTO production_statuses (id, key, label) VALUES (2, 'in_production', 'In Production');
INSERT OR IGNORE INTO production_statuses (id, key, label) VALUES (3, 'in_concept', 'In Concept');
INSERT OR IGNORE INTO production_statuses (id, key, label) VALUES (4, 'unknown', 'Unknown');

-- ============================================================
-- Seed: Default User
-- ============================================================

INSERT OR IGNORE INTO users (id, username, handle) VALUES (1, 'default', '');
