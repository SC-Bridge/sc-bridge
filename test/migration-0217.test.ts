import { env, reset } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";

// Migration 0217 adds slot_type + item_class to crafting_blueprint_slots
// and to ptu_crafting_blueprint_slots (created in 0216).
//
// readFileSync does not work inside miniflare's worker runtime — SQL is
// inlined here. Must stay in sync with 0217_crafting_item_slots.sql.

// Minimal schema state as-of post-0216 (tables 0217 touches + prerequisites).
// Post-0216 baseline — must include all columns added by migrations 0129 + 0178
// to crafting_blueprint_slots. The ptu_* table mirrors this schema.
const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS crafting_blueprints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    tag TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'general',
    sub_type TEXT,
    craft_time_seconds INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS crafting_blueprint_slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    crafting_blueprint_id INTEGER NOT NULL REFERENCES crafting_blueprints(id),
    slot_index INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL,
    resource_name TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 0,
    min_quality INTEGER NOT NULL DEFAULT 0,
    blueprint_uuid TEXT,
    slot_name TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS ptu_crafting_blueprints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    tag TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'general',
    sub_type TEXT,
    craft_time_seconds INTEGER NOT NULL DEFAULT 0
  )`,
  // ptu_crafting_blueprint_slots as created by migration 0216.
  `CREATE TABLE IF NOT EXISTS ptu_crafting_blueprint_slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    crafting_blueprint_id INTEGER NOT NULL REFERENCES ptu_crafting_blueprints(id),
    slot_index INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL,
    resource_name TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 0,
    min_quality INTEGER NOT NULL DEFAULT 0,
    blueprint_uuid TEXT,
    slot_name TEXT,
    data_source TEXT,
    is_deleted INTEGER DEFAULT 0,
    deleted_at TEXT,
    deleted_in_patch TEXT
  )`,
];

// Migration 0217 statements inlined.
const MIGRATION_STATEMENTS = [
  `ALTER TABLE crafting_blueprint_slots
  ADD COLUMN slot_type TEXT NOT NULL DEFAULT 'resource'`,
  `ALTER TABLE crafting_blueprint_slots
  ADD COLUMN item_class TEXT`,
  `ALTER TABLE ptu_crafting_blueprint_slots
  ADD COLUMN slot_type TEXT NOT NULL DEFAULT 'resource'`,
  `ALTER TABLE ptu_crafting_blueprint_slots
  ADD COLUMN item_class TEXT`,
];

async function setupSchema() {
  const db = env.DB as D1Database;
  for (const sql of SCHEMA_STATEMENTS) {
    await db.prepare(sql).run();
  }
}

async function applyMigration() {
  const db = env.DB as D1Database;
  for (const s of MIGRATION_STATEMENTS) {
    await db.prepare(s).run();
  }
}

async function getColumns(
  table: string
): Promise<{ name: string; type: string; notnull: number; dflt_value: string | null }[]> {
  const db = env.DB as D1Database;
  const r = await db
    .prepare(`PRAGMA table_info(${table})`)
    .all<{ name: string; type: string; notnull: number; dflt_value: string | null }>();
  return r.results;
}

describe("migration 0217 — crafting_blueprint_slots item slots", () => {
  beforeAll(async () => {
    // pool-workers v0.16 dropped per-test isolatedStorage — wipe any baseline
    // state left by other suites so applyMigration() runs against a fresh DB.
    await reset();
    await setupSchema();
    await applyMigration();
  });

  it("adds slot_type column with default 'resource' to crafting_blueprint_slots", async () => {
    const cols = await getColumns("crafting_blueprint_slots");
    const slotType = cols.find((c) => c.name === "slot_type");
    expect(slotType).toBeDefined();
    expect(slotType!.type.toUpperCase()).toBe("TEXT");
    expect(slotType!.notnull).toBe(1);
    // SQLite quotes string defaults — strip outer quotes
    expect(slotType!.dflt_value?.replace(/^'|'$/g, "")).toBe("resource");
  });

  it("adds item_class column (nullable) to crafting_blueprint_slots", async () => {
    const cols = await getColumns("crafting_blueprint_slots");
    const itemClass = cols.find((c) => c.name === "item_class");
    expect(itemClass).toBeDefined();
    expect(itemClass!.type.toUpperCase()).toBe("TEXT");
    expect(itemClass!.notnull).toBe(0);
  });

  it("INSERTs that omit slot_type get DEFAULT 'resource' (and item_class=NULL)", async () => {
    // SQLite's ALTER TABLE ADD COLUMN with DEFAULT applies the default to
    // pre-existing rows in the same way that an INSERT omitting the column
    // applies the default to new rows. This test exercises the latter path
    // (which is what miniflare's auto-applied migration produces) and that
    // result is identical to the post-migration state of any row that
    // existed before the ALTER ran.
    const db = env.DB as D1Database;
    // Seed a blueprint then a slot using only pre-0217 columns.
    await db
      .prepare(
        `INSERT INTO crafting_blueprints (uuid, tag, name, type, sub_type, craft_time_seconds)
       VALUES ('mig-0217-bp', 'BP_CRAFT_MIG_0217', 'Mig 0217 Test', 'weapons', 'rifle', 60)`
      )
      .run();
    const bp = await db
      .prepare("SELECT id FROM crafting_blueprints WHERE uuid = 'mig-0217-bp'")
      .first<{ id: number }>();
    await db
      .prepare(
        `INSERT INTO crafting_blueprint_slots (crafting_blueprint_id, slot_index, name, resource_name, quantity, min_quality)
       VALUES (?, 0, 'TestSlot', 'Iron', 1, 0)`
      )
      .bind(bp!.id)
      .run();

    const row = await db
      .prepare(
        `SELECT slot_type, item_class FROM crafting_blueprint_slots WHERE crafting_blueprint_id = ?`
      )
      .bind(bp!.id)
      .first<{ slot_type: string; item_class: string | null }>();

    expect(row!.slot_type).toBe("resource");
    expect(row!.item_class).toBeNull();
  });

  it("mirrors the same columns on ptu_crafting_blueprint_slots", async () => {
    const cols = await getColumns("ptu_crafting_blueprint_slots");
    const slotType = cols.find((c) => c.name === "slot_type");
    const itemClass = cols.find((c) => c.name === "item_class");
    expect(slotType).toBeDefined();
    expect(itemClass).toBeDefined();
    expect(slotType!.type.toUpperCase()).toBe("TEXT");
    expect(slotType!.notnull).toBe(1);
    expect(slotType!.dflt_value?.replace(/^'|'$/g, "")).toBe("resource");
    expect(itemClass!.notnull).toBe(0);
  });
});
