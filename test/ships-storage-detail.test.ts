import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";

/**
 * /api/ships/:slug storage fields.
 *
 * vehicles.cargo is the maintained cargo figure. The ship response also carries
 * four summary columns (external_cargo_scu, fuel_cargo_scu,
 * personal_grid_microscu, locker_count). The stale interior-cargo column and
 * the per-feature vehicle_storage detail table were retired by migration 0282:
 * the response has neither `internal_cargo_scu` nor a `storage` array.
 */
describe("GET /api/ships/:slug — storage summary", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    await env.DB.prepare(
      `INSERT OR IGNORE INTO manufacturers (uuid, name, slug, code, game_version_id)
       VALUES ('mfr-uuid-misc', 'Musashi Industrial', 'misc', 'MISC', 1)`,
    ).run();
    const mfr = await env.DB.prepare(
      `SELECT id FROM manufacturers WHERE uuid = 'mfr-uuid-misc'`,
    ).first<{ id: number }>();
    await env.DB.prepare(
      `INSERT OR REPLACE INTO vehicles
         (uuid, slug, name, class_name, manufacturer_id, game_version_id,
          is_pledgeable, is_npc_only, is_paint_variant, removed,
          cargo, external_cargo_scu, fuel_cargo_scu, personal_grid_microscu, locker_count)
       VALUES
         ('veh-test-hullb', 'misc-hull-b-test', 'MISC Hull B Test', 'misc_hull_b_test',
          ?, 1, 1, 0, 0, 0, 544, 512, 300.219, 200000, 2)`,
    ).bind(mfr!.id).run();
  });

  it("returns the cargo figure and the four kept summary columns", async () => {
    const res = await SELF.fetch("https://example.com/api/ships/misc-hull-b-test");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.slug).toBe("misc-hull-b-test");
    expect(body.cargo).toBe(544);
    expect(body.external_cargo_scu).toBe(512);
    expect(body.fuel_cargo_scu).toBe(300.219);
    expect(body.personal_grid_microscu).toBe(200000);
    expect(body.locker_count).toBe(2);
  });

  it("no longer returns the retired interior-cargo column or the storage detail array", async () => {
    const res = await SELF.fetch("https://example.com/api/ships/misc-hull-b-test");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty("internal_cargo_scu");
    expect(body).not.toHaveProperty("storage");
  });

  it("the retired schema objects are gone", async () => {
    const objects = await env.DB
      .prepare(
        `SELECT name FROM sqlite_master
          WHERE name IN ('vehicle_storage', 'ptu_vehicle_storage',
                         'idx_vehicle_storage_vehicle', 'idx_vehicle_storage_type',
                         'idx_ptu_vehicle_storage_vehicle', 'idx_ptu_vehicle_storage_type')`,
      )
      .all<{ name: string }>();
    expect(objects.results).toEqual([]);
    const cols = await env.DB
      .prepare(`SELECT name FROM pragma_table_info('vehicles')`)
      .all<{ name: string }>();
    const names = cols.results.map((c) => c.name);
    expect(names).not.toContain("internal_cargo_scu");
    expect(names).toEqual(
      expect.arrayContaining(["cargo", "external_cargo_scu", "fuel_cargo_scu", "personal_grid_microscu", "locker_count"]),
    );
  });
});
