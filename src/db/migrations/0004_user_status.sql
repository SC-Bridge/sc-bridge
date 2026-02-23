-- Migration 0004: User status + soft deletion
ALTER TABLE user ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE user ADD COLUMN deleted_at TEXT NULL;

-- New change event types for moderation
INSERT OR IGNORE INTO change_event_types (id, key, label, category)
  VALUES (17, 'account_suspended', 'Account Suspended', 'account');
INSERT OR IGNORE INTO change_event_types (id, key, label, category)
  VALUES (18, 'account_banned', 'Account Banned', 'account');
INSERT OR IGNORE INTO change_event_types (id, key, label, category)
  VALUES (19, 'account_reinstated', 'Account Reinstated', 'account');
