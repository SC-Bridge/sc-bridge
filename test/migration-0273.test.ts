import { env, reset } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";

// Migration 0273 removes weapon slings: sling_1/sling_2 were a modeling
// mistake (the game's wep_stocked ports ARE where primary/secondary live —
// separate sling slots double-counted long-gun capacity). Deletes any rows
// saved into a sling slot; every other slot is untouched.
//
// readFileSync does not work inside miniflare's worker runtime, so the
// migration's statement is inlined here. Must stay in sync with
// 0273_drop_sling_slots.sql.

// Pre-0273 baseline (post-0272 shape): user + user_fps_loadouts +
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

// Migration 0273 statement inlined — must match
// src/db/migrations/0273_drop_sling_slots.sql exactly.
const MIGRATION_STATEMENTS = [
  `DELETE FROM user_fps_loadout_slots WHERE slot_key IN ('sling_1', 'sling_2')`,
];

async function setupSchema() {
  const db = env.DB as D1Database;
  for (const s of SCHEMA_STATEMENTS) await db.prepare(s).run();
}

async function applyMigration() {
  const db = env.DB as D1Database;
  for (const s of MIGRATION_STATEMENTS) await db.prepare(s).run();
}

describe("migration 0273 — drop sling slots", () => {
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
        `INSERT INTO user_fps_loadout_slots (loadout_id, slot_key, item_uuid, config_json) VALUES (?, 'sling_1', 'w-primary', '{"a":1}')`
      )
      .bind(lo!.id)
      .run();
    await db
      .prepare(
        `INSERT INTO user_fps_loadout_slots (loadout_id, slot_key, item_uuid, config_json) VALUES (?, 'sling_2', 'w-secondary', '{"b":2}')`
      )
      .bind(lo!.id)
      .run();

    await applyMigration();
  });

  it("deletes rows saved into sling_1/sling_2", async () => {
    const db = env.DB as D1Database;
    const slings = await db
      .prepare(`SELECT COUNT(*) AS n FROM user_fps_loadout_slots WHERE slot_key IN ('sling_1', 'sling_2')`)
      .first<{ n: number }>();
    expect(slings!.n).toBe(0);
  });

  it("leaves an unrelated slot key (primary) untouched", async () => {
    const db = env.DB as D1Database;
    const primary = await db.prepare(`SELECT slot_key, item_uuid FROM user_fps_loadout_slots WHERE slot_key = 'primary'`).first();
    expect(primary).toMatchObject({ slot_key: "primary", item_uuid: "gmni_pistol_ballistic_01" });
  });

  it("is a no-op on a second replay", async () => {
    const db = env.DB as D1Database;
    await applyMigration();
    const slings = await db
      .prepare(`SELECT COUNT(*) AS n FROM user_fps_loadout_slots WHERE slot_key IN ('sling_1', 'sling_2')`)
      .first<{ n: number }>();
    expect(slings!.n).toBe(0);
    const remaining = await db.prepare(`SELECT COUNT(*) AS n FROM user_fps_loadout_slots`).first<{ n: number }>();
    expect(remaining!.n).toBe(1);
  });
});
