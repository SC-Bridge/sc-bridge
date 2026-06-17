-- Saved "Chat about my fleet" conversations.
-- One row per conversation; many message rows. user_id cascades from the
-- Better Auth user row on account deletion (matches ai_analyses), and
-- ai_chat_messages in turn cascade from their parent chat — so deleting a
-- user removes chats which removes their messages (recursive cascade).

CREATE TABLE ai_chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_ai_chats_user ON ai_chats(user_id, updated_at);

CREATE TABLE ai_chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL REFERENCES ai_chats(id) ON DELETE CASCADE,
  role TEXT NOT NULL,            -- 'user' | 'assistant'
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_ai_chat_messages_chat ON ai_chat_messages(chat_id, id);
