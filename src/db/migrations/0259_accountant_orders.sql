-- Accountant M5 — Orders, private Order Market & Workorders (design: accountant-m5-design.md §3).
-- Orders/workorders are agreement state; every aUEC movement is an accountant_entries row.
-- The ledger stays the single source of financial truth.

CREATE TABLE accountant_workorders (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id            TEXT NOT NULL,
    title              TEXT NOT NULL,
    description        TEXT,
    counterparty       TEXT,
    status             TEXT NOT NULL DEFAULT 'draft',
                       -- 'draft'|'open'|'in_progress'|'complete'|'cancelled'|'terminated'
    terminated_by      TEXT,                        -- 'you' | 'counterparty' (terminated only)
    termination_note   TEXT,                        -- MANDATORY when terminated (master doc)
    start_at           TEXT,
    deliver_by         TEXT,
    fine_interval      TEXT NOT NULL DEFAULT 'daily',
    fine_rate_type     TEXT NOT NULL DEFAULT 'percent',
    fine_rate          REAL NOT NULL DEFAULT 0.5,
    rate_change_condition TEXT,
    rate_change_pct    REAL NOT NULL DEFAULT 0,
    termination_clause TEXT NOT NULL DEFAULT 'standard',
    modified_fields    TEXT,
    vis_corp           INTEGER NOT NULL DEFAULT 0,
    vis_public         INTEGER NOT NULL DEFAULT 0,
    completed_at       TEXT,
    created_at         TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_accountant_workorders_user_status ON accountant_workorders (user_id, status);

CREATE TABLE accountant_orders (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id               TEXT NOT NULL,
    type                  TEXT NOT NULL,            -- 'sale' | 'purchase'
    category              TEXT NOT NULL,            -- the original five; NOT mission_income
    tag                   TEXT,
    item                  TEXT NOT NULL,
    quantity              REAL NOT NULL,            -- SCU / units; > 0
    price_per_unit        INTEGER NOT NULL,         -- base contract rate, aUEC
    total                 INTEGER NOT NULL,         -- round(quantity × price_per_unit), server-computed
    counterparty          TEXT,
    status                TEXT NOT NULL DEFAULT 'open',  -- 'open'|'in_progress'|'complete'|'cancelled'
    workorder_id          INTEGER REFERENCES accountant_workorders(id),
    start_at              TEXT NOT NULL,
    deliver_by            TEXT,                     -- NULL = no deadline → no fines possible
    fine_interval         TEXT NOT NULL DEFAULT 'daily',
    fine_rate_type        TEXT NOT NULL DEFAULT 'percent',
    fine_rate             REAL NOT NULL DEFAULT 0.5,
    rate_change_condition TEXT,                     -- NULL | 'late' | 'partial'
    rate_change_pct       REAL NOT NULL DEFAULT 0,
    termination_clause    TEXT NOT NULL DEFAULT 'standard',
    modified_fields       TEXT,                     -- JSON array of contract fields ≠ template default
    vis_corp              INTEGER NOT NULL DEFAULT 0,
    vis_public            INTEGER NOT NULL DEFAULT 0,
    last_fine_day         INTEGER NOT NULL DEFAULT 0,   -- lazy fine-tick bookmark (loan pattern)
    notes                 TEXT,
    created_at            TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_accountant_orders_user_status ON accountant_orders (user_id, status);
CREATE INDEX idx_accountant_orders_workorder   ON accountant_orders (workorder_id)
    WHERE workorder_id IS NOT NULL;

ALTER TABLE accountant_entries ADD COLUMN order_id     INTEGER REFERENCES accountant_orders(id);
ALTER TABLE accountant_entries ADD COLUMN workorder_id INTEGER REFERENCES accountant_workorders(id);
CREATE INDEX idx_accountant_entries_order     ON accountant_entries (order_id)     WHERE order_id IS NOT NULL;
CREATE INDEX idx_accountant_entries_workorder ON accountant_entries (workorder_id) WHERE workorder_id IS NOT NULL;
CREATE UNIQUE INDEX idx_accountant_entries_order_tick ON accountant_entries (order_id, tick_index)
    WHERE order_id IS NOT NULL AND tick_index IS NOT NULL;   -- fine-tick idempotency (loan pattern)
