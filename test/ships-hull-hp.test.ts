import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";

/**
 * /api/ships/:slug hull HP: the hull (body) part, the total over every
 * structural part, and the per-part breakdown (migration 0283).
 *
 * hull_hp keeps its meaning (the part whose destruction is the ship's).
 * hull_hp_total and hull_parts_json come from the same vehicle XML; the API
 * returns the parts parsed as `hull_parts`, never the raw JSON column.
 */
const CUTLASS_PARTS = [
  { name: "Body", hp: 6500, parent: null, vital: true },
  { name: "Wing_Left", hp: 1500, parent: "Body", vital: false },
  { name: "Tail", hp: 6500, parent: "Body", vital: false },
  { name: "Thruster_Main_Left", hp: 5000, parent: "Tail", vital: false },
];

describe("GET /api/ships/:slug — hull HP total and parts", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    await env.DB.prepare(
      `INSERT OR IGNORE INTO manufacturers (uuid, name, slug, code, game_version_id)
       VALUES ('mfr-uuid-drak', 'Drake Interplanetary', 'drak', 'DRAK', 1)`,
    ).run();
    const mfr = await env.DB.prepare(
      `SELECT id FROM manufacturers WHERE uuid = 'mfr-uuid-drak'`,
    ).first<{ id: number }>();
    const insert = `INSERT OR REPLACE INTO vehicles
         (uuid, slug, name, class_name, manufacturer_id, game_version_id,
          is_pledgeable, is_npc_only, is_paint_variant, removed,
          hull_hp, hull_hp_total, hull_parts_json)
       VALUES (?, ?, ?, ?, ?, 1, 1, 0, 0, 0, ?, ?, ?)`;
    await env.DB.prepare(insert)
      .bind("veh-test-cutlass", "drak-cutlass-hull-test", "Drake Cutlass Hull Test",
        "drak_cutlass_hull_test", mfr!.id, 6500, 19500, JSON.stringify(CUTLASS_PARTS))
      .run();
    await env.DB.prepare(insert)
      .bind("veh-test-atls", "argo-atls-hull-test", "ARGO ATLS Hull Test",
        "argo_atls_hull_test", mfr!.id, null, null, null)
      .run();
    await env.DB.prepare(insert)
      .bind("veh-test-broken", "drak-broken-hull-test", "Drake Broken Hull Test",
        "drak_broken_hull_test", mfr!.id, 100, 100, "[{not json")
      .run();
  });

  it("returns the body part, the total and the parsed parts", async () => {
    const res = await SELF.fetch("https://example.com/api/ships/drak-cutlass-hull-test");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.hull_hp).toBe(6500);
    expect(body.hull_hp_total).toBe(19500);
    expect(body.hull_parts).toEqual(CUTLASS_PARTS);
    expect(body).not.toHaveProperty("hull_parts_json");
  });

  it("a hull with no XML values gives nulls, not an empty list", async () => {
    const res = await SELF.fetch("https://example.com/api/ships/argo-atls-hull-test");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.hull_hp).toBeNull();
    expect(body.hull_hp_total).toBeNull();
    expect(body.hull_parts).toBeNull();
  });

  it("an unreadable parts value is dropped rather than failing the page", async () => {
    const res = await SELF.fetch("https://example.com/api/ships/drak-broken-hull-test");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.hull_hp_total).toBe(100);
    expect(body.hull_parts).toBeNull();
  });

  it("the base table and its PTU shadow both carry the new columns", async () => {
    for (const table of ["vehicles", "ptu_vehicles"]) {
      const cols = await env.DB
        .prepare(`SELECT name, type FROM pragma_table_info('${table}') WHERE name IN ('hull_hp_total', 'hull_parts_json') ORDER BY name`)
        .all<{ name: string; type: string }>();
      expect(cols.results).toEqual([
        { name: "hull_hp_total", type: "REAL" },
        { name: "hull_parts_json", type: "TEXT" },
      ]);
    }
  });
});
