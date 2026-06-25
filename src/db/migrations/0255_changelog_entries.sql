-- 0255_changelog_entries
--
-- Public changelog (#124). A simple list of notable, user-facing changes shown
-- at /changelog. Entries are authored manually (admin can add more later) and
-- served published-only to all users. `category` is one of feature|fix|
-- improvement; `entry_date` is the user-facing ship date (TEXT YYYY-MM-DD).

CREATE TABLE IF NOT EXISTS changelog_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT,
  entry_date TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'feature',
  is_published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_changelog_published_date
  ON changelog_entries(is_published, entry_date);

-- Seed with recent user-facing releases so the page is useful on day one.
INSERT INTO changelog_entries (entry_date, title, description, category) VALUES
  ('2026-06-06', 'Ship bomb stats on item pages',
   'Ship-launched bombs now show their full damage and blast-radius stats on the item detail page.', 'feature'),
  ('2026-06-05', 'Refuelling nozzle deep stats',
   'Ship refuelling nozzles now display hydrogen/quantum flow rates and integrity on their detail pages.', 'feature'),
  ('2026-06-05', 'Where to Buy + community price reporting',
   'Loot items now show where to buy them, with community-reported prices you can contribute to and a freshness indicator.', 'feature'),
  ('2026-06-05', 'Faction panel no longer clips long lists',
   'The faction detail panel now scrolls correctly when a faction has a long list of blueprint rewards.', 'fix'),
  ('2026-06-04', 'Component role/class labels in Localization',
   'The Localization builder can now show a component''s role/class as an in-game label.', 'feature'),
  ('2026-06-02', 'Rock Calculator: shareable configs + saved loadouts',
   'Mining rock configurations are now captured in the URL for sharing, and you can save/reload ship loadouts.', 'improvement');
