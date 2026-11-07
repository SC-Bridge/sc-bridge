import { env, reset } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";

// Migration 0278 sets Drake as the maker on the old Ironclad / Ironclad Assault
// concept rows (uuid NULL), which were seeded as Crusader Industries.
//
// readFileSync does not work inside miniflare's worker runtime, so the
// migration's statement is inlined here. Must stay in sync with
// 0278_fix_ironclad_concept_maker.sql.

const SCHEMA_STATEMENTS = [
  `CREATE TABLE manufacturers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, code TEXT)`,
  `CREATE TABLE vehicles (id INTEGER PRIMARY KEY AUTOINCREMENT, uuid TEXT, slug TEXT NOT NULL, name TEXT NOT NULL, class_name TEXT, removed INTEGER DEFAULT 0, manufacturer_id INTEGER REFERENCES manufacturers(id))`,
];

// Migration 0278 statement inlined — must match
// src/db/migrations/0278_fix_ironclad_concept_maker.sql exactly.
const MIGRATION_STATEMENTS = [
  `UPDATE vehicles
SET manufacturer_id = COALESCE((SELECT manufacturer_id FROM vehicles WHERE class_name = 'drak_ironclad' LIMIT 1), manufacturer_id)
WHERE slug IN ('ironclad', 'ironclad-assault') AND uuid IS NULL`,
];

const db = () => env.DB as D1Database;
const makerOf = async (slug: string) =>
  (await db().prepare(`SELECT m.name FROM vehicles v JOIN manufacturers m ON m.id = v.manufacturer_id WHERE v.slug = ?`).bind(slug).first<{ name: string }>())?.name;
async function apply() {
  for (const s of MIGRATION_STATEMENTS) await db().prepare(s).run();
}

async function seed(withReference: boolean) {
  // An older Drake row with the same code goes first, so a lookup by code would pick it.
  for (const [name, code] of [["Old Drake row", "DRAK"], ["Drake Interplanetary", "DRAK"], ["Crusader Industries", "CRUS"]]) {
    await db().prepare(`INSERT INTO manufacturers (name, code) VALUES (?, ?)`).bind(name, code).run();
  }
  const id = async (n: string) => (await db().prepare(`SELECT id FROM manufacturers WHERE name = ?`).bind(n).first<{ id: number }>())!.id;
  if (withReference) {
    await db().prepare(`INSERT INTO vehicles (uuid, slug, name, class_name, manufacturer_id) VALUES ('u-1', 'drak-ironclad', 'Drake Ironclad', 'drak_ironclad', ?)`).bind(await id("Drake Interplanetary")).run();
  }
  for (const [slug, name] of [["ironclad", "Ironclad"], ["ironclad-assault", "Ironclad Assault"]]) {
    await db().prepare(`INSERT INTO vehicles (uuid, slug, name, class_name, removed, manufacturer_id) VALUES (NULL, ?, ?, NULL, 1, ?)`).bind(slug, name, await id("Crusader Industries")).run();
  }
  // An unrelated Crusader concept ship must keep its maker.
  await db().prepare(`INSERT INTO vehicles (uuid, slug, name, manufacturer_id) VALUES (NULL, 'mercury', 'Mercury', ?)`).bind(await id("Crusader Industries")).run();
}

describe("migration 0278 — Ironclad concept rows to Drake", () => {
  beforeAll(async () => {
    await reset();
    for (const s of SCHEMA_STATEMENTS) await db().prepare(s).run();
    await seed(true);
    await apply();
  });

  it("sets Drake on both Ironclad concept rows", async () => {
    expect(await makerOf("ironclad")).toBe("Drake Interplanetary");
    expect(await makerOf("ironclad-assault")).toBe("Drake Interplanetary");
  });

  it("uses the game-file Ironclad's maker row, not an older row with the same code", async () => {
    const n = await db().prepare(`SELECT COUNT(*) AS n FROM vehicles v JOIN manufacturers m ON m.id = v.manufacturer_id WHERE m.name = 'Old Drake row'`).first<{ n: number }>();
    expect(n!.n).toBe(0);
  });

  it("leaves other concept ships alone", async () => {
    expect(await makerOf("mercury")).toBe("Crusader Industries");
  });

  it("is a no-op on a second replay", async () => {
    await apply();
    expect(await makerOf("ironclad-assault")).toBe("Drake Interplanetary");
  });
});

describe("migration 0278 — game-file Ironclad missing", () => {
  beforeAll(async () => {
    await reset();
    for (const s of SCHEMA_STATEMENTS) await db().prepare(s).run();
    await seed(false);
    await apply();
  });

  it("keeps the current maker instead of clearing it", async () => {
    expect(await makerOf("ironclad")).toBe("Crusader Industries");
  });
});
