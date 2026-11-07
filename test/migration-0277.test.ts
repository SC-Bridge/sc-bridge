import { env, reset } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import { stripManufacturer } from "../src/lib/fleet-import";

// Migration 0277 renames the five concept ships fixed in 0276, whose stored
// display names still carried the wrong maker ("MISC Vulcan" → "Aegis Vulcan").
// Only exact old names are touched.
//
// readFileSync does not work inside miniflare's worker runtime, so the
// migration's statements are inlined here. Must stay in sync with
// 0277_fix_concept_ship_names.sql.

const SCHEMA_STATEMENTS = [
  `CREATE TABLE vehicles (id INTEGER PRIMARY KEY AUTOINCREMENT, uuid TEXT, slug TEXT NOT NULL, name TEXT NOT NULL)`,
];

// Migration 0277 statements inlined — must match
// src/db/migrations/0277_fix_concept_ship_names.sql exactly.
const MIGRATION_STATEMENTS = [
  `UPDATE vehicles SET name = 'Aegis Vulcan'      WHERE slug = 'vulcan'      AND uuid IS NULL AND name = 'MISC Vulcan'`,
  `UPDATE vehicles SET name = 'C.O. Pioneer'      WHERE slug = 'pioneer'     AND uuid IS NULL AND name = 'MISC Pioneer'`,
  `UPDATE vehicles SET name = 'RSI Arrastra'      WHERE slug = 'arrastra'    AND uuid IS NULL AND name = 'Argo Arrastra'`,
  `UPDATE vehicles SET name = 'MISC Expanse'      WHERE slug = 'expanse'     AND uuid IS NULL AND name = 'Drake Expanse'`,
  `UPDATE vehicles SET name = 'Anvil Legionnaire' WHERE slug = 'legionnaire' AND uuid IS NULL AND name = 'Drake Legionnaire'`,
];

const db = () => env.DB as D1Database;
const nameOf = async (slug: string, concept = true) =>
  (await db().prepare(`SELECT name FROM vehicles WHERE slug = ? AND uuid IS ${concept ? "" : "NOT "}NULL`).bind(slug).first<{ name: string }>())?.name;
async function apply() {
  for (const s of MIGRATION_STATEMENTS) await db().prepare(s).run();
}

const RENAMES: [string, string, string][] = [
  ["vulcan", "MISC Vulcan", "Aegis Vulcan"],
  ["pioneer", "MISC Pioneer", "C.O. Pioneer"],
  ["arrastra", "Argo Arrastra", "RSI Arrastra"],
  ["expanse", "Drake Expanse", "MISC Expanse"],
  ["legionnaire", "Drake Legionnaire", "Anvil Legionnaire"],
];

describe("migration 0277 — fix concept ship names", () => {
  beforeAll(async () => {
    await reset();
    for (const s of SCHEMA_STATEMENTS) await db().prepare(s).run();
    for (const [slug, oldName] of RENAMES) {
      await db().prepare(`INSERT INTO vehicles (uuid, slug, name) VALUES (NULL, ?, ?)`).bind(slug, oldName).run();
    }
    // A game-file ship sharing a slug, and a concept name already changed by hand.
    await db().prepare(`INSERT INTO vehicles (uuid, slug, name) VALUES ('uuid-x', 'vulcan', 'MISC Vulcan')`).run();
    await db().prepare(`UPDATE vehicles SET name = 'Hand Edited Expanse' WHERE slug = 'expanse' AND uuid IS NULL`).run();
    await apply();
  });

  it("renames the ships whose name is still the old one", async () => {
    expect(await nameOf("vulcan")).toBe("Aegis Vulcan");
    expect(await nameOf("pioneer")).toBe("C.O. Pioneer");
    expect(await nameOf("arrastra")).toBe("RSI Arrastra");
    expect(await nameOf("legionnaire")).toBe("Anvil Legionnaire");
  });

  it("leaves a name that was already changed alone", async () => {
    expect(await nameOf("expanse")).toBe("Hand Edited Expanse");
  });

  it("leaves a game-file ship with the same slug alone", async () => {
    expect(await nameOf("vulcan", false)).toBe("MISC Vulcan");
  });

  it("is a no-op on a second replay", async () => {
    await apply();
    expect(await nameOf("vulcan")).toBe("Aegis Vulcan");
  });

  it("keeps fleet-import matching: each new name strips back to the bare ship name", () => {
    for (const [, , newName] of RENAMES) {
      expect(stripManufacturer(newName)).toBe(newName.replace(/^(Aegis|C\.O\.|RSI|MISC|Anvil) /, ""));
    }
  });
});
