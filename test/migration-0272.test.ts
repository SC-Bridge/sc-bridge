import { env, reset } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";

// Migration 0272 rewrites the three legacy single-tile utility slot keys
// (medical, gadget, throwable) to their new ordinal homes (pen_1,
// util_gadget, grenade_1) ahead of the FpsSlotKey enum swap.
//
// readFileSync does not work inside miniflare's worker runtime, so the
// migration's statements are inlined here. Must stay in sync with
// 0272_utility_slot_keys.sql.

// Pre-0272 baseline (post-0271 shape): user + user_fps_loadouts +
// user_item_builds + user_fps_loadout_slots this migration touches.
const SCHEMA_STATEMENTS = [
  `CREATE TABLE "user" (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, emailVerified INTEGER NOT NULL DEFAULT 0, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL)`,
  `CREATE TABLE user_fps_loadouts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    name       TEXT    NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, name)
  )`,
  `CREATE TABLE user_item_builds (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    kind        TEXT    NOT NULL CHECK (kind IN ('weapon','armour')),
    item_uuid   TEXT    NOT NULL,
    name        TEXT    NOT NULL,
    config_json TEXT    NOT NULL,
    created_at  TEXT    DEFAULT (datetime('now')),
    updated_at  TEXT    DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE user_fps_loadout_slots (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    loadout_id    INTEGER NOT NULL REFERENCES user_fps_loadouts(id) ON DELETE CASCADE,
    slot_key      TEXT    NOT NULL,
    item_uuid     TEXT,
    item_name     TEXT,
    item_build_id INTEGER REFERENCES user_item_builds(id) ON DELETE SET NULL,
    config_json   TEXT,
    updated_at    TEXT DEFAULT (datetime('now')),
    UNIQUE(loadout_id, slot_key)
  )`,
];

// Migration 0272 statements inlined — must match
// src/db/migrations/0272_utility_slot_keys.sql exactly.
const MIGRATION_STATEMENTS = [
  `UPDATE user_fps_loadout_slots SET slot_key = 'pen_1'       WHERE slot_key = 'medical'`,
  `UPDATE user_fps_loadout_slots SET slot_key = 'util_gadget' WHERE slot_key = 'gadget'`,
  `UPDATE user_fps_loadout_slots SET slot_key = 'grenade_1'   WHERE slot_key = 'throwable'`,
];

async function setupSchema() {
  const db = env.DB as D1Database;
  for (const s of SCHEMA_STATEMENTS) await db.prepare(s).run();
}

async function applyMigration() {
  const db = env.DB as D1Database;
  for (const s of MIGRATION_STATEMENTS) await db.prepare(s).run();
}

describe("migration 0272 — utility slot keys", () => {
  beforeAll(async () => {
    // pool-workers v0.16 dropped per-test isolatedStorage — wipe any baseline
    // state left by other suites before rebuilding the pre-migration shape.
    await reset();
    await setupSchema();

    const db = env.DB as D1Database;
    await db
      .prepare(
        `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES ('mig-u1', 'Mig', 'mig@test.local', 1, datetime('now'), datetime('now'))`
      )
      .run();
    await db.prepare(`INSERT INTO user_fps_loadouts (user_id, name) VALUES ('mig-u1', 'Mig Kit')`).run();
    const lo = await db.prepare(`SELECT id FROM user_fps_loadouts WHERE user_id = 'mig-u1'`).first<{ id: number }>();
    await db
      .prepare(
        `INSERT INTO user_fps_loadout_slots (loadout_id, slot_key, item_uuid, config_json) VALUES (?, 'primary', 'gmni_pistol_ballistic_01', '{"foo":1}')`
      )
      .bind(lo!.id)
      .run();
    await db
      .prepare(
        `INSERT INTO user_fps_loadout_slots (loadout_id, slot_key, item_uuid, config_json) VALUES (?, 'medical', 'medpen-uuid', '{"a":1}')`
      )
      .bind(lo!.id)
      .run();
    await db
      .prepare(
        `INSERT INTO user_fps_loadout_slots (loadout_id, slot_key, item_uuid, config_json) VALUES (?, 'gadget', 'multitool-uuid', '{"b":2}')`
      )
      .bind(lo!.id)
      .run();
    await db
      .prepare(
        `INSERT INTO user_fps_loadout_slots (loadout_id, slot_key, item_uuid, config_json) VALUES (?, 'throwable', 'frag-uuid', '{"c":3}')`
      )
      .bind(lo!.id)
      .run();

    await applyMigration();
  });

  it("rewrites the three legacy keys to their new ordinal homes", async () => {
    const db = env.DB as D1Database;
    const medical = await db.prepare(`SELECT slot_key FROM user_fps_loadout_slots WHERE item_uuid = 'medpen-uuid'`).first();
    expect(medical).toMatchObject({ slot_key: "pen_1" });
    const gadget = await db.prepare(`SELECT slot_key FROM user_fps_loadout_slots WHERE item_uuid = 'multitool-uuid'`).first();
    expect(gadget).toMatchObject({ slot_key: "util_gadget" });
    const throwable = await db.prepare(`SELECT slot_key FROM user_fps_loadout_slots WHERE item_uuid = 'frag-uuid'`).first();
    expect(throwable).toMatchObject({ slot_key: "grenade_1" });
  });

  it("leaves an unrelated slot key (primary) untouched", async () => {
    const db = env.DB as D1Database;
    const primary = await db.prepare(`SELECT slot_key, item_uuid FROM user_fps_loadout_slots WHERE slot_key = 'primary'`).first();
    expect(primary).toMatchObject({ slot_key: "primary", item_uuid: "gmni_pistol_ballistic_01" });
  });

  it("carries item_uuid/config_json values unchanged through the rewrite", async () => {
    const db = env.DB as D1Database;
    const row = await db.prepare(`SELECT item_uuid, config_json FROM user_fps_loadout_slots WHERE slot_key = 'pen_1'`).first();
    expect(row).toMatchObject({ item_uuid: "medpen-uuid", config_json: '{"a":1}' });
  });

  it("is a no-op on a second replay", async () => {
    const db = env.DB as D1Database;
    await applyMigration();
    const legacy = await db
      .prepare(`SELECT COUNT(*) AS n FROM user_fps_loadout_slots WHERE slot_key IN ('medical','gadget','throwable')`)
      .first<{ n: number }>();
    expect(legacy!.n).toBe(0);
    const rewritten = await db
      .prepare(`SELECT COUNT(*) AS n FROM user_fps_loadout_slots WHERE slot_key IN ('pen_1','util_gadget','grenade_1')`)
      .first<{ n: number }>();
    expect(rewritten!.n).toBe(3);
  });
});
