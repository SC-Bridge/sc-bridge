import { env, reset } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";

// Minimal schema needed for this migration test.
// We deliberately do NOT call setupTestDatabase / applyD1Migrations because
// that would apply migration 0216 (adding the UNIQUE index) before we can
// seed duplicate rows. Instead, we create only the tables this migration touches.
const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS crafting_properties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    unit TEXT,
    category TEXT NOT NULL DEFAULT 'general'
  )`,
  `INSERT OR IGNORE INTO crafting_properties (id, key, name, unit, category)
   VALUES (1, 'weapon_recoil_handling', 'Recoil Handling', NULL, 'weapons')`,
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
    min_quality INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS crafting_slot_modifiers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    crafting_blueprint_slot_id INTEGER NOT NULL REFERENCES crafting_blueprint_slots(id),
    crafting_property_id INTEGER NOT NULL REFERENCES crafting_properties(id),
    start_quality INTEGER NOT NULL DEFAULT 0,
    end_quality INTEGER NOT NULL DEFAULT 1000,
    modifier_at_start REAL NOT NULL DEFAULT 1.0,
    modifier_at_end REAL NOT NULL DEFAULT 1.0
  )`,
  // PTU shadow of blueprints — needed by 0216's CREATE TABLE for ptu_crafting_blueprint_slots
  `CREATE TABLE IF NOT EXISTS ptu_crafting_blueprints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    tag TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'general',
    sub_type TEXT,
    craft_time_seconds INTEGER NOT NULL DEFAULT 0
  )`,
];

// Migration 0216 statements inlined — readFileSync does not work inside miniflare's
// worker runtime, so we embed them directly. Must stay in sync with the SQL file.
const MIGRATION_STATEMENTS = [
  `DELETE FROM crafting_slot_modifiers
WHERE crafting_blueprint_slot_id NOT IN (
  SELECT MIN(id)
  FROM crafting_blueprint_slots
  GROUP BY crafting_blueprint_id, slot_index
)`,
  `DELETE FROM crafting_blueprint_slots
WHERE id NOT IN (
  SELECT MIN(id)
  FROM crafting_blueprint_slots
  GROUP BY crafting_blueprint_id, slot_index
)`,
  `DELETE FROM crafting_slot_modifiers
WHERE id NOT IN (
  SELECT MIN(id)
  FROM crafting_slot_modifiers
  GROUP BY crafting_blueprint_slot_id, crafting_property_id
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_crafting_blueprint_slots_unique
  ON crafting_blueprint_slots(crafting_blueprint_id, slot_index)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_crafting_slot_modifiers_unique
  ON crafting_slot_modifiers(crafting_blueprint_slot_id, crafting_property_id)`,
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
    data_source TEXT, is_deleted INTEGER DEFAULT 0, deleted_at TEXT, deleted_in_patch TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS ptu_idx_crafting_blueprint_slots_blueprint
  ON ptu_crafting_blueprint_slots(crafting_blueprint_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_ptu_crafting_blueprint_slots_unique
  ON ptu_crafting_blueprint_slots(crafting_blueprint_id, slot_index)`,
  `CREATE TABLE IF NOT EXISTS ptu_crafting_slot_modifiers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    crafting_blueprint_slot_id INTEGER NOT NULL REFERENCES ptu_crafting_blueprint_slots(id),
    crafting_property_id INTEGER NOT NULL REFERENCES crafting_properties(id),
    start_quality INTEGER NOT NULL DEFAULT 0,
    end_quality INTEGER NOT NULL DEFAULT 1000,
    modifier_at_start REAL NOT NULL DEFAULT 1.0,
    modifier_at_end REAL NOT NULL DEFAULT 1.0,
    blueprint_uuid TEXT,
    property_id TEXT,
    slot_index INTEGER,
    data_source TEXT, is_deleted INTEGER DEFAULT 0, deleted_at TEXT, deleted_in_patch TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS ptu_idx_crafting_slot_modifiers_slot
  ON ptu_crafting_slot_modifiers(crafting_blueprint_slot_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_ptu_crafting_slot_modifiers_unique
  ON ptu_crafting_slot_modifiers(crafting_blueprint_slot_id, crafting_property_id)`,
];

async function setupSchema() {
  const db = env.DB as D1Database;
  for (const sql of SCHEMA_STATEMENTS) {
    await db.prepare(sql).run();
  }
}

async function seedDupes() {
  const db = env.DB as D1Database;
  await db.batch([
    db.prepare("DELETE FROM crafting_slot_modifiers"),
    db.prepare("DELETE FROM crafting_blueprint_slots"),
    db.prepare("DELETE FROM crafting_blueprints WHERE uuid = 'mig-test-bp-uuid'"),
  ]);
  await db.prepare(
    `INSERT INTO crafting_blueprints (uuid, tag, name, type, sub_type, craft_time_seconds)
     VALUES ('mig-test-bp-uuid', 'BP_CRAFT_MIG_TEST', 'Mig Test', 'weapons', 'rifle', 60)`
  ).run();
  const bp = await db.prepare("SELECT id FROM crafting_blueprints WHERE uuid = 'mig-test-bp-uuid'").first<{ id: number }>();
  // 5 duplicate slot rows for slot_index=0
  for (let i = 0; i < 5; i++) {
    await db.prepare(
      `INSERT INTO crafting_blueprint_slots (crafting_blueprint_id, slot_index, name, resource_name, quantity, min_quality)
       VALUES (?, 0, 'Barrel', 'Steel', 1, 0)`
    ).bind(bp!.id).run();
  }
  const slots = await db.prepare("SELECT id FROM crafting_blueprint_slots WHERE crafting_blueprint_id = ?").bind(bp!.id).all<{ id: number }>();
  // 5 duplicate modifier rows per slot for property_id=1
  for (const s of slots.results) {
    for (let i = 0; i < 5; i++) {
      await db.prepare(
        `INSERT INTO crafting_slot_modifiers (crafting_blueprint_slot_id, crafting_property_id, start_quality, end_quality, modifier_at_start, modifier_at_end)
         VALUES (?, 1, 0, 1000, 1.0, 1.5)`
      ).bind(s.id).run();
    }
  }
}

async function applyMigration() {
  const db = env.DB as D1Database;
  for (const s of MIGRATION_STATEMENTS) {
    await db.prepare(s).run();
  }
}

describe("migration 0216 — dedupe crafting tables", () => {
  beforeEach(async () => {
    // pool-workers v0.16 dropped per-test isolatedStorage — wipe any state
    // left by other suites so our minimal pre-0216 schema isn't contaminated
    // by the full baseline (which already has the UNIQUE index applied).
    await reset();
    await setupSchema();
    await seedDupes();
  });

  it("collapses duplicate slot rows to one per (blueprint_id, slot_index)", async () => {
    await applyMigration();
    const db = env.DB as D1Database;
    const bp = await db.prepare("SELECT id FROM crafting_blueprints WHERE uuid = 'mig-test-bp-uuid'").first<{ id: number }>();
    const slots = await db.prepare("SELECT * FROM crafting_blueprint_slots WHERE crafting_blueprint_id = ?").bind(bp!.id).all();
    expect(slots.results).toHaveLength(1);
  });

  it("collapses duplicate modifier rows to one per (slot_id, property_id)", async () => {
    await applyMigration();
    const db = env.DB as D1Database;
    const bp = await db.prepare("SELECT id FROM crafting_blueprints WHERE uuid = 'mig-test-bp-uuid'").first<{ id: number }>();
    const slot = await db.prepare("SELECT id FROM crafting_blueprint_slots WHERE crafting_blueprint_id = ?").bind(bp!.id).first<{ id: number }>();
    const mods = await db.prepare("SELECT * FROM crafting_slot_modifiers WHERE crafting_blueprint_slot_id = ?").bind(slot!.id).all();
    expect(mods.results).toHaveLength(1);
  });

  it("rejects subsequent duplicate slot inserts via UNIQUE index", async () => {
    await applyMigration();
    const db = env.DB as D1Database;
    const bp = await db.prepare("SELECT id FROM crafting_blueprints WHERE uuid = 'mig-test-bp-uuid'").first<{ id: number }>();
    await expect(
      db.prepare(
        `INSERT INTO crafting_blueprint_slots (crafting_blueprint_id, slot_index, name, resource_name, quantity, min_quality)
         VALUES (?, 0, 'Barrel', 'Steel', 1, 0)`
      ).bind(bp!.id).run()
    ).rejects.toThrow(/UNIQUE/i);
  });
});
