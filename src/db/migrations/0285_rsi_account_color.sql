-- Multi-account phase 2: a colour per RSI account, shown as a marker next to
-- every row so the user can tell which account a ship or pledge belongs to.
-- Existing accounts get palette colours in id order, per user. The palette
-- lives in src/lib/rsi-accounts.ts (ACCOUNT_COLORS); keep the two in step.
--
-- NOTE: ALTER TABLE ... ADD COLUMN is NOT idempotent. Applied once by
-- wrangler; if re-run by hand, skip it when pragma_table_info already lists
-- color. No compound SELECT (D1 rejects more than 5 terms).

ALTER TABLE user_rsi_accounts ADD COLUMN color TEXT;

UPDATE user_rsi_accounts SET color = (
  SELECT CASE (r.rn - 1) % 10
    WHEN 0 THEN '#22d3ee' WHEN 1 THEN '#f97316' WHEN 2 THEN '#a855f7' WHEN 3 THEN '#84cc16' WHEN 4 THEN '#f43f5e' WHEN 5 THEN '#eab308' WHEN 6 THEN '#3b82f6' WHEN 7 THEN '#10b981' WHEN 8 THEN '#ec4899' WHEN 9 THEN '#94a3b8'
  END
  FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY id) AS rn FROM user_rsi_accounts) r
  WHERE r.id = user_rsi_accounts.id
) WHERE color IS NULL;
