-- User Change History: audit trail for all user-scoped changes

-- ============================================================
-- Lookup: Change Event Types
-- ============================================================

CREATE TABLE IF NOT EXISTS change_event_types (
    id INTEGER PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL,
    category TEXT NOT NULL
);

INSERT OR IGNORE INTO change_event_types (id, key, label, category) VALUES (1, 'provider_linked', 'Provider Linked', 'auth');
INSERT OR IGNORE INTO change_event_types (id, key, label, category) VALUES (2, 'provider_unlinked', 'Provider Unlinked', 'auth');
INSERT OR IGNORE INTO change_event_types (id, key, label, category) VALUES (3, 'password_set', 'Password Set', 'auth');
INSERT OR IGNORE INTO change_event_types (id, key, label, category) VALUES (4, 'password_changed', 'Password Changed', 'auth');
INSERT OR IGNORE INTO change_event_types (id, key, label, category) VALUES (5, 'profile_updated', 'Profile Updated', 'profile');
INSERT OR IGNORE INTO change_event_types (id, key, label, category) VALUES (6, 'email_changed', 'Email Changed', 'profile');
INSERT OR IGNORE INTO change_event_types (id, key, label, category) VALUES (7, '2fa_enabled', '2FA Enabled', 'auth');
INSERT OR IGNORE INTO change_event_types (id, key, label, category) VALUES (8, '2fa_disabled', '2FA Disabled', 'auth');
INSERT OR IGNORE INTO change_event_types (id, key, label, category) VALUES (9, 'passkey_added', 'Passkey Added', 'auth');
INSERT OR IGNORE INTO change_event_types (id, key, label, category) VALUES (10, 'passkey_removed', 'Passkey Removed', 'auth');
INSERT OR IGNORE INTO change_event_types (id, key, label, category) VALUES (11, 'passkey_renamed', 'Passkey Renamed', 'auth');
INSERT OR IGNORE INTO change_event_types (id, key, label, category) VALUES (12, 'session_revoked', 'Session Revoked', 'session');
INSERT OR IGNORE INTO change_event_types (id, key, label, category) VALUES (13, 'account_deleted', 'Account Deleted', 'account');
INSERT OR IGNORE INTO change_event_types (id, key, label, category) VALUES (14, 'fleet_imported', 'Fleet Imported', 'fleet');
INSERT OR IGNORE INTO change_event_types (id, key, label, category) VALUES (15, 'settings_changed', 'Settings Changed', 'settings');
INSERT OR IGNORE INTO change_event_types (id, key, label, category) VALUES (16, 'llm_config_changed', 'LLM Config Changed', 'settings');

-- ============================================================
-- History Table
-- ============================================================

CREATE TABLE IF NOT EXISTS user_change_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    event_type_id INTEGER NOT NULL REFERENCES change_event_types(id),
    provider_id TEXT,
    field_name TEXT,
    old_value TEXT,
    new_value TEXT,
    metadata TEXT,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_change_history_user_id ON user_change_history(user_id);
CREATE INDEX IF NOT EXISTS idx_user_change_history_event_type ON user_change_history(event_type_id);
CREATE INDEX IF NOT EXISTS idx_user_change_history_created_at ON user_change_history(created_at);
