import { env, reset } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";

const SCHEMA_STATEMENTS = [
  // Pre-0218 baseline (subset — only the columns this migration touches)
  `CREATE TABLE IF NOT EXISTS vehicles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    slug TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS ptu_vehicles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    slug TEXT
  )`,
];

const MIGRATION_STATEMENTS = [
  `ALTER TABLE vehicles ADD COLUMN g_force_resistance REAL`,
  `ALTER TABLE vehicles ADD COLUMN allow_room_connection INTEGER DEFAULT 0`,
  `ALTER TABLE ptu_vehicles ADD COLUMN g_force_resistance REAL`,
  `ALTER TABLE ptu_vehicles ADD COLUMN allow_room_connection INTEGER DEFAULT 0`,
];

async function setupSchema() {
  const db = env.DB as D1Database;
  for (const s of SCHEMA_STATEMENTS) await db.prepare(s).run();
}

async function applyMigration() {
  const db = env.DB as D1Database;
  for (const s of MIGRATION_STATEMENTS) await db.prepare(s).run();
}

async function getColumns(table: string) {
  const db = env.DB as D1Database;
  const r = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string; type: string; notnull: number; dflt_value: string | null }>();
  return r.results;
}

describe("migration 0218 — Vehicle Command Module fields", () => {
  beforeAll(async () => {
    // pool-workers v0.16 dropped per-test isolatedStorage — wipe baseline
    // state from prior suites before applyMigration() ALTERs vehicles.
    await reset();
    await setupSchema();
    await applyMigration();
  });

  it("adds g_force_resistance REAL to vehicles", async () => {
    const cols = await getColumns("vehicles");
    const c = cols.find(c => c.name === "g_force_resistance");
    expect(c).toBeDefined();
    expect(c!.type.toUpperCase()).toBe("REAL");
    expect(c!.notnull).toBe(0);
  });

  it("adds allow_room_connection INTEGER DEFAULT 0 to vehicles", async () => {
    const cols = await getColumns("vehicles");
    const c = cols.find(c => c.name === "allow_room_connection");
    expect(c).toBeDefined();
    expect(c!.type.toUpperCase()).toBe("INTEGER");
    expect(c!.dflt_value).toBe("0");
  });

  it("mirrors the same columns on ptu_vehicles", async () => {
    const cols = await getColumns("ptu_vehicles");
    expect(cols.find(c => c.name === "g_force_resistance")).toBeDefined();
    expect(cols.find(c => c.name === "allow_room_connection")).toBeDefined();
  });
});
