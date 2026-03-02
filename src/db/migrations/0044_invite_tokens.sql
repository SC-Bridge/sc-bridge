-- 0044_invite_tokens.sql
--
-- Invite token table for beta access control.
-- Tokens are single-use: once consumed (used_at set), they cannot be reused.
-- No expiry — tokens stay valid until used or manually deleted.

CREATE TABLE IF NOT EXISTS invite_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  token      TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT (datetime('now')),
  used_at    TEXT
);
CREATE INDEX idx_invite_tokens_token ON invite_tokens(token);
