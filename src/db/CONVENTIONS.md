# Database Conventions — SC Companion (D1)

Rules for schema design in this project. Follow these when writing migrations or adding tables.

---

## Table Naming

- **snake_case, plural nouns** — `vehicles`, `fps_weapons`, `vehicle_components`
- **Namespace prefixes** group related tables:
  - `vehicle_*` — ship/vehicle items (`vehicle_components`, `vehicle_images`, `vehicle_loaners`)
  - `fps_*` — personal gear (`fps_weapons`, `fps_armour`, `fps_attachments`, `fps_utilities`)
  - `user_*` — per-user data (`user_fleet`, `user_paints`, `user_settings`, `user_rsi_profile`)
  - No prefix for core entities (`vehicles`, `paints`, `manufacturers`, `organizations`)

---

## Primary Keys

Always use:
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT
```
Never use UUID as a primary key — D1 rowid lookups on INTEGER PK are significantly faster.

---

## UUIDs

When a row has a game-side UUID (DataCore, SC Wiki), store it as a separate column:
```sql
uuid TEXT NOT NULL UNIQUE
```
Never use UUID as PK. FK lookups use the integer `id`.

---

## Foreign Keys

Name format: `{singular_referenced_table}_id INTEGER REFERENCES {table}(id)`

Examples:
```sql
manufacturer_id INTEGER REFERENCES manufacturers(id)
fps_weapon_id   INTEGER REFERENCES fps_weapons(id)
vehicle_id      INTEGER REFERENCES vehicles(id)
```

---

## Junction Tables

Named `{table1}_{table2}` in alphabetical order:
- `paint_vehicles` (not `vehicle_paints`)
- Columns reference both parent tables by integer FK

---

## JSON Blob Columns

Use `{field}_json TEXT` for structured data that would otherwise require schema changes:
```sql
containers_json TEXT   -- JSON array of container refs
stats_json      TEXT   -- JSON object of type-specific stats
```
Use sparingly — prefer proper columns for anything queried/filtered.

---

## Booleans

Use `INTEGER` with `DEFAULT 0`:
```sql
is_active INTEGER NOT NULL DEFAULT 0
```
Values: `0` = false, `1` = true. No SQLite `BOOLEAN` type.

---

## Timestamps

Use `TEXT` in ISO 8601 format. Default to `datetime('now')`:
```sql
updated_at TEXT DEFAULT (datetime('now'))
created_at TEXT DEFAULT (datetime('now'))
```

---

## Enum-like Values

For small, stable sets (production status, vehicle type), use a lookup table:
```sql
CREATE TABLE production_statuses (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  key   TEXT NOT NULL UNIQUE,   -- machine-readable: 'flight_ready'
  label TEXT NOT NULL           -- display: 'Flight Ready'
);
```
FK from the referencing table: `production_status_id INTEGER REFERENCES production_statuses(id)`

---

## Migrations

- Files: `src/db/migrations/NNNN_description.sql` (zero-padded 4-digit sequence)
- Apply: `npx wrangler d1 migrations apply sc-companion --remote`
- Never skip numbers or reuse applied migration names
- **Never alter PK or UNIQUE constraints in-place** — create new table, copy data, drop old
- D1 tracks applied migrations in `d1_migrations` table automatically

---

## Index Naming

Format: `idx_{table}_{column}` (or `idx_{table}_{col1}_{col2}` for composite)

Examples:
```sql
CREATE INDEX IF NOT EXISTS idx_loot_map_type     ON loot_map(type);
CREATE INDEX IF NOT EXISTS idx_loot_map_sub_type ON loot_map(sub_type);
```

---

## Out-of-Band Changes

Schema changes applied directly via `wrangler d1 execute` (not through a migration file) are
tracked in the session journal. They **do not** appear in `d1_migrations` and are not
re-applied by `wrangler d1 migrations apply`. Document them in the journal when applied.

Current out-of-band columns (as of 2026-02-28):
- `vehicle_components.stats_json` — added directly, not in migration file
- `fps_weapons.stats_json` — same
- `fps_armour.stats_json` — same
- `fps_attachments.stats_json` — same
- `fps_utilities.stats_json` — same
- `vehicles.price_auec` — added directly for aUEC pricing data
