-- 0247_terminal_inventory_uex_timestamps.sql
--
-- Capture the community-report timestamps that UEX exposes per row in
-- commodities_prices_all and items_prices_all. The existing
-- `latest_observed_at` column records when WE last polled UEX (every 2h
-- for commodities, daily for items), which tells us nothing about how
-- fresh the underlying community report is. With 30,000+ rows in
-- terminal_inventory, low-traffic terminals can have prices that haven't
-- been updated by a community member in weeks while still looking
-- "fresh as of now" in our DB.
--
-- Stored as INTEGER (unix epoch seconds) to match UEX's wire format
-- exactly — no parsing, no timezone ambiguity, natural ordering.

ALTER TABLE terminal_inventory ADD COLUMN uex_date_modified INTEGER;
ALTER TABLE terminal_inventory ADD COLUMN uex_date_added INTEGER;

-- Index supports "show me stale prices" / "report age" queries without
-- a full scan. Partial index — only rows that have a UEX report.
CREATE INDEX idx_terminal_inventory_uex_modified
  ON terminal_inventory(uex_date_modified)
  WHERE uex_date_modified IS NOT NULL;
