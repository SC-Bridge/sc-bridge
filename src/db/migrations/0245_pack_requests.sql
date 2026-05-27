-- Community localization pack requests: a user drops a link to a pack they'd
-- like added; the team is notified (Discord webhook) and can review here.
-- Deliberately stores NO user_id — requests are operational, not user-owned
-- content, so this stays out of the GDPR account-deletion cascade. The
-- requester's display name is sent to Discord transiently, not persisted.
CREATE TABLE pack_requests (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  url           TEXT NOT NULL,
  note          TEXT,
  status        TEXT NOT NULL DEFAULT 'new',
  created_at    TEXT DEFAULT (datetime('now'))
);
