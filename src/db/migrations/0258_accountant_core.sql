-- Accountant M1–M3 core schema (design: accountant-m1-m3-design.md §3).
-- Single-ledger architecture: accountant_entries is the only source of truth;
-- balance is SUM(amount), Sorting List is the WHERE category IS NULL slice.
-- Loans/tags tables are created here too — schema is locked by the approved
-- design; their endpoints arrive in cycle M2.

CREATE TABLE accountant_loans (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id           TEXT NOT NULL,
    direction         TEXT NOT NULL,
    counterparty      TEXT NOT NULL,
    principal         INTEGER NOT NULL,
    interest_rate     REAL NOT NULL,
    interest_interval TEXT NOT NULL,
    fee_multiplier    REAL NOT NULL DEFAULT 0,
    started_at        TEXT NOT NULL,
    due_at            TEXT,
    status            TEXT NOT NULL DEFAULT 'open',
    last_accrued_tick INTEGER NOT NULL DEFAULT 0,
    notes             TEXT,
    created_at        TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_accountant_loans_user_status ON accountant_loans (user_id, status);

CREATE TABLE accountant_entries (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         TEXT NOT NULL,
    occurred_at     TEXT NOT NULL,
    amount          INTEGER NOT NULL,
    category        TEXT,
    tag             TEXT,
    source          TEXT NOT NULL,
    description     TEXT,
    location        TEXT,
    quantity        REAL,
    price_per_unit  INTEGER,
    loan_id         INTEGER REFERENCES accountant_loans(id),
    tick_index      INTEGER,
    source_ref      TEXT,
    notes           TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_accountant_entries_user_occurred ON accountant_entries (user_id, occurred_at DESC);
CREATE INDEX idx_accountant_entries_user_category ON accountant_entries (user_id, category);
CREATE INDEX idx_accountant_entries_sorting ON accountant_entries (user_id)
    WHERE category IS NULL AND source = 'parsed';
CREATE UNIQUE INDEX idx_accountant_entries_loan_tick ON accountant_entries (loan_id, tick_index)
    WHERE tick_index IS NOT NULL;
CREATE UNIQUE INDEX idx_accountant_entries_user_source_ref ON accountant_entries (user_id, source_ref)
    WHERE source_ref IS NOT NULL;

CREATE TABLE accountant_tags (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    TEXT NOT NULL,
    category   TEXT NOT NULL,
    name       TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE (user_id, category, name)
);
