import { env, reset } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";

// Migration 0271 generalizes user_weapon_builds into user_item_builds and
// repoints user_fps_loadout_slots.weapon_build_id -> item_build_id.
//
// readFileSync does not work inside miniflare's worker runtime, so the
// migration's statements are inlined here. Must stay in sync with
// 0271_user_item_builds.sql.

// Pre-0271 baseline: user + user_fps_loadouts (prerequisites, minimal shape)
// plus the old-shape user_weapon_builds / user_fps_loadout_slots this
// migration touches.
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
  `CREATE TABLE user_weapon_builds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    weapon_uuid TEXT NOT NULL,
    name TEXT NOT NULL,
    config_json TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE user_fps_loadout_slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loadout_id INTEGER NOT NULL REFERENCES user_fps_loadouts(id) ON DELETE CASCADE,
    slot_key TEXT NOT NULL,
    item_uuid TEXT,
    item_name TEXT,
    weapon_build_id INTEGER REFERENCES user_weapon_builds(id) ON DELETE SET NULL,
    config_json TEXT,
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(loadout_id, slot_key)
  )`,
];

// Migration 0271 statements inlined — must match
// src/db/migrations/0271_user_item_builds.sql exactly.
const MIGRATION_STATEMENTS = [
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
  `CREATE INDEX idx_user_item_builds_user ON user_item_builds(user_id)`,
  `CREATE UNIQUE INDEX idx_user_item_builds_unique
   ON user_item_builds(user_id, kind, item_uuid, name)`,
  `INSERT INTO user_item_builds (id, user_id, kind, item_uuid, name, config_json, created_at, updated_at)
   SELECT id, user_id, 'weapon', weapon_uuid, name, config_json, created_at, updated_at
   FROM user_weapon_builds`,
  `CREATE TABLE user_fps_loadout_slots_new (
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
  `INSERT INTO user_fps_loadout_slots_new (id, loadout_id, slot_key, item_uuid, item_name, item_build_id, config_json, updated_at)
   SELECT id, loadout_id, slot_key, item_uuid, item_name, weapon_build_id, config_json, updated_at
   FROM user_fps_loadout_slots`,
  `DROP TABLE user_fps_loadout_slots`,
  `ALTER TABLE user_fps_loadout_slots_new RENAME TO user_fps_loadout_slots`,
  `CREATE INDEX idx_ufls_loadout ON user_fps_loadout_slots(loadout_id)`,
  `DROP TABLE user_weapon_builds`,
];

async function setupSchema() {
  const db = env.DB as D1Database;
  for (const s of SCHEMA_STATEMENTS) await db.prepare(s).run();
}

async function applyMigration() {
  const db = env.DB as D1Database;
  for (const s of MIGRATION_STATEMENTS) await db.prepare(s).run();
}

describe("migration 0271 — user_item_builds", () => {
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
    await db
      .prepare(
        `INSERT INTO user_weapon_builds (id, user_id, weapon_uuid, name, config_json) VALUES (41, 'mig-u1', 'gmni_pistol_ballistic_01', 'My Gemini', '{"qualities":{"0":720}}')`
      )
      .run();
    await db.prepare(`INSERT INTO user_fps_loadouts (user_id, name) VALUES ('mig-u1', 'Mig Kit')`).run();
    const lo = await db.prepare(`SELECT id FROM user_fps_loadouts WHERE user_id = 'mig-u1'`).first<{ id: number }>();
    await db
      .prepare(
        `INSERT INTO user_fps_loadout_slots (loadout_id, slot_key, item_uuid, item_name, weapon_build_id, config_json) VALUES (?, 'primary', 'gmni_pistol_ballistic_01', 'Gemini LH86', 41, '{}')`
      )
      .bind(lo!.id)
      .run();

    await applyMigration();
  });

  it("copies weapon builds with ids preserved and kind='weapon'", async () => {
    const row = await env.DB.prepare(`SELECT id, kind, item_uuid, name FROM user_item_builds WHERE id = 41`).first();
    expect(row).toMatchObject({ id: 41, kind: "weapon", item_uuid: "gmni_pistol_ballistic_01", name: "My Gemini" });
  });

  it("repoints the slot FK value unchanged", async () => {
    const slot = await env.DB.prepare(`SELECT item_build_id FROM user_fps_loadout_slots WHERE slot_key = 'primary'`).first();
    expect(slot).toMatchObject({ item_build_id: 41 });
  });

  it("dropped user_weapon_builds and passes foreign_key_check", async () => {
    const gone = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE name = 'user_weapon_builds'`).first();
    expect(gone).toBeNull();
    const fk = await env.DB.prepare(`PRAGMA foreign_key_check`).all();
    expect(fk.results).toEqual([]);
  });

  it("deleting the referenced build nulls the slot link", async () => {
    await env.DB.prepare(`DELETE FROM user_item_builds WHERE id = 41`).run();
    const slot = await env.DB.prepare(`SELECT item_build_id FROM user_fps_loadout_slots WHERE slot_key = 'primary'`).first();
    expect(slot).toMatchObject({ item_build_id: null });
  });
});
