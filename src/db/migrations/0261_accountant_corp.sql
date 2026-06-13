-- Accountant M4 Phase A — Corp/Group ledger scope (design: accountant-m4-design.md §5.1).
-- Adds a nullable org_id scope dimension to every accountant table: NULL = the
-- player's private ledger (unchanged), set = an organisation's corp ledger. The
-- single-ledger architecture is preserved — corp is the same engine scoped one
-- dimension wider. All existing rows default org_id NULL, so every current ledger
-- stays private and untouched (additive, safe backfill).
--
-- ALTER ... ADD COLUMN ... REFERENCES is the same pattern migration 0259 used for
-- order_id/workorder_id; SQLite permits it because the added columns default NULL.

ALTER TABLE accountant_entries    ADD COLUMN org_id TEXT REFERENCES organization(id);
ALTER TABLE accountant_loans      ADD COLUMN org_id TEXT REFERENCES organization(id);
ALTER TABLE accountant_orders     ADD COLUMN org_id TEXT REFERENCES organization(id);
ALTER TABLE accountant_workorders ADD COLUMN org_id TEXT REFERENCES organization(id);
ALTER TABLE accountant_tags       ADD COLUMN org_id TEXT REFERENCES organization(id);

-- Corp-level accountant settings on the organisation row:
--   accountant_tier    — corp tier (D10), owner-set, overrides member personal tier in corp mode
--   accountant_user_id — the single Accountant custodian (D13); NULL ⇒ owner is custodian by default
ALTER TABLE organization ADD COLUMN accountant_tier TEXT NOT NULL DEFAULT 'easy';
ALTER TABLE organization ADD COLUMN accountant_user_id TEXT REFERENCES "user"(id);

-- Corp-scoped read indexes (mirror the private ones, org-keyed).
CREATE INDEX idx_accountant_entries_org_occurred ON accountant_entries (org_id, occurred_at DESC)
    WHERE org_id IS NOT NULL;
CREATE INDEX idx_accountant_entries_org_sorting ON accountant_entries (org_id, occurred_at DESC)
    WHERE org_id IS NOT NULL AND category IS NULL AND source = 'parsed';
CREATE INDEX idx_accountant_loans_org      ON accountant_loans (org_id)      WHERE org_id IS NOT NULL;
CREATE INDEX idx_accountant_orders_org     ON accountant_orders (org_id)     WHERE org_id IS NOT NULL;
CREATE INDEX idx_accountant_workorders_org ON accountant_workorders (org_id) WHERE org_id IS NOT NULL;
