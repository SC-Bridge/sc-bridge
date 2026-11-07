import { env, reset } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";

// Migration 0276 corrects the manufacturer on five concept ships (uuid NULL —
// not in the game files, so extraction never fixes them) that were seeded
// with the wrong maker: Vulcan, Pioneer, Arrastra, Expanse, Legionnaire.
// It copies manufacturer_id from a game-file ship of the right maker, because
// manufacturer codes repeat across historical rows.
//
// readFileSync does not work inside miniflare's worker runtime, so the
// migration's statements are inlined here. Must stay in sync with
// 0276_fix_concept_ship_manufacturers.sql.

const SCHEMA_STATEMENTS = [
  `CREATE TABLE manufacturers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, code TEXT)`,
  `CREATE TABLE vehicles (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid            TEXT,
    slug            TEXT NOT NULL,
    name            TEXT NOT NULL,
    class_name      TEXT,
    manufacturer_id INTEGER REFERENCES manufacturers(id)
  )`,
];

// Migration 0276 statements inlined — must match
// src/db/migrations/0276_fix_concept_ship_manufacturers.sql exactly.
const MIGRATION_STATEMENTS = [
  `UPDATE vehicles
SET manufacturer_id = COALESCE((SELECT manufacturer_id FROM vehicles WHERE class_name = 'aegs_idris_p' LIMIT 1), manufacturer_id)
WHERE slug = 'vulcan' AND uuid IS NULL`,
  `UPDATE vehicles
SET manufacturer_id = COALESCE((SELECT manufacturer_id FROM vehicles WHERE class_name = 'cnou_nomad' LIMIT 1), manufacturer_id)
WHERE slug = 'pioneer' AND uuid IS NULL`,
  `UPDATE vehicles
SET manufacturer_id = COALESCE((SELECT manufacturer_id FROM vehicles WHERE class_name = 'rsi_polaris' LIMIT 1), manufacturer_id)
WHERE slug = 'arrastra' AND uuid IS NULL`,
  `UPDATE vehicles
SET manufacturer_id = COALESCE((SELECT manufacturer_id FROM vehicles WHERE class_name = 'misc_hull_c' LIMIT 1), manufacturer_id)
WHERE slug = 'expanse' AND uuid IS NULL`,
  `UPDATE vehicles
SET manufacturer_id = COALESCE((SELECT manufacturer_id FROM vehicles WHERE class_name = 'anvl_carrack' LIMIT 1), manufacturer_id)
WHERE slug = 'legionnaire' AND uuid IS NULL`,
];

const db = () => env.DB as D1Database;

async function setupSchema() {
  for (const s of SCHEMA_STATEMENTS) await db().prepare(s).run();
}
async function applyMigration() {
  for (const s of MIGRATION_STATEMENTS) await db().prepare(s).run();
}
async function makerOf(slug: string, uuidIsNull = true) {
  const row = await db()
    .prepare(
      `SELECT m.name FROM vehicles v JOIN manufacturers m ON m.id = v.manufacturer_id WHERE v.slug = ? AND v.uuid IS ${uuidIsNull ? "" : "NOT "}NULL`
    )
    .bind(slug)
    .first<{ name: string }>();
  return row?.name;
}

// A decoy older row is inserted FIRST for each code, so a lookup by code alone
// would pick the wrong id; the live (displayed) rows come after.
async function seed(withLegionnaireReference = true) {
  const makers: [string, string][] = [
    ["Old Aegis row", "AEG"], ["Old C.O. row", "CNOU"], ["Old RSI row", "RSI"], ["Old MISC row", "MIS"], ["Old Anvil row", "ANVL"],
    ["Aegis Dynamics", "AEG"], ["Consolidated Outland", "CNOU"], ["Roberts Space Industries", "RSI"],
    ["Musashi Industrial & Starflight Concern", "MIS"], ["Anvil Aerospace", "ANVL"], ["Argo Astronautics", "ARGO"], ["Drake Interplanetary", "DRAK"],
  ];
  for (const [name, code] of makers) await db().prepare(`INSERT INTO manufacturers (name, code) VALUES (?, ?)`).bind(name, code).run();
  const id = async (name: string) => (await db().prepare(`SELECT id FROM manufacturers WHERE name = ?`).bind(name).first<{ id: number }>())!.id;

  // Game-file reference ships, already showing the right maker.
  const refs: [string, string, string][] = [
    ["aegs_idris_p", "idris-p", "Aegis Dynamics"],
    ["cnou_nomad", "nomad", "Consolidated Outland"],
    ["rsi_polaris", "polaris", "Roberts Space Industries"],
    ["misc_hull_c", "hull-c", "Musashi Industrial & Starflight Concern"],
  ];
  if (withLegionnaireReference) refs.push(["anvl_carrack", "carrack", "Anvil Aerospace"]);
  for (const [cls, slug, maker] of refs) {
    await db().prepare(`INSERT INTO vehicles (uuid, slug, name, class_name, manufacturer_id) VALUES (?, ?, ?, ?, ?)`)
      .bind(`uuid-${cls}`, slug, slug, cls, await id(maker)).run();
  }

  // Concept ships with the wrong maker, as seeded by 0010 / 01_concept_ships.sql.
  const concept: [string, string][] = [
    ["vulcan", "Musashi Industrial & Starflight Concern"],
    ["pioneer", "Musashi Industrial & Starflight Concern"],
    ["arrastra", "Argo Astronautics"],
    ["expanse", "Drake Interplanetary"],
    ["legionnaire", "Drake Interplanetary"],
  ];
  for (const [slug, maker] of concept) {
    await db().prepare(`INSERT INTO vehicles (uuid, slug, name, class_name, manufacturer_id) VALUES (NULL, ?, ?, NULL, ?)`)
      .bind(slug, slug, await id(maker)).run();
  }
  // A game-file ship sharing a target slug must not be touched.
  await db().prepare(`INSERT INTO vehicles (uuid, slug, name, class_name, manufacturer_id) VALUES ('uuid-game-vulcan', 'vulcan', 'vulcan', 'test_vulcan', ?)`)
    .bind(await id("Drake Interplanetary")).run();
}

describe("migration 0276 — fix concept ship manufacturers", () => {
  beforeAll(async () => {
    await reset();
    await setupSchema();
    await seed();
    await applyMigration();
  });

  it("sets the correct maker on all five concept ships", async () => {
    expect(await makerOf("vulcan")).toBe("Aegis Dynamics");
    expect(await makerOf("pioneer")).toBe("Consolidated Outland");
    expect(await makerOf("arrastra")).toBe("Roberts Space Industries");
    expect(await makerOf("expanse")).toBe("Musashi Industrial & Starflight Concern");
    expect(await makerOf("legionnaire")).toBe("Anvil Aerospace");
  });

  it("uses the reference ship's maker row, not an older row with the same code", async () => {
    const n = await db()
      .prepare(`SELECT COUNT(*) AS n FROM vehicles v JOIN manufacturers m ON m.id = v.manufacturer_id WHERE v.uuid IS NULL AND m.name LIKE 'Old %'`)
      .first<{ n: number }>();
    expect(n!.n).toBe(0);
  });

  it("leaves a game-file ship with the same slug untouched", async () => {
    expect(await makerOf("vulcan", false)).toBe("Drake Interplanetary");
  });

  it("is a no-op on a second replay", async () => {
    await applyMigration();
    expect(await makerOf("vulcan")).toBe("Aegis Dynamics");
    expect(await makerOf("legionnaire")).toBe("Anvil Aerospace");
  });
});

describe("migration 0276 — missing reference ship", () => {
  beforeAll(async () => {
    await reset();
    await setupSchema();
    await seed(false);
    await applyMigration();
  });

  it("keeps the current maker instead of clearing it", async () => {
    expect(await makerOf("legionnaire")).toBe("Drake Interplanetary");
  });

  it("still fixes the ships whose reference exists", async () => {
    expect(await makerOf("vulcan")).toBe("Aegis Dynamics");
  });
});
