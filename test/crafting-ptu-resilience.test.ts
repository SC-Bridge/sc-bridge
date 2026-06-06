import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase, TEST_GAME_VERSION_ID } from "./apply-migrations";
import { createTestUser, authHeaders } from "./helpers";

/**
 * Regression: LIVE crafting/loot endpoints must survive a PTU purge.
 *
 * DELETE /api/admin/versions/ptu DROPs all ptu_* shadow tables when a PTU cycle
 * ends (by design). But LIVE crafting/loot queries UNION/JOIN those tables, so
 * after a sanctioned purge they 500'd with "no such table". This simulates the
 * purged state (drops the shadow tables) and asserts the endpoints still work.
 */
const PTU_TABLES = [
  "ptu_crafting_blueprints",
  "ptu_loot_map",
  "ptu_fps_weapons",
  "ptu_fps_armour",
  "ptu_fps_helmets",
  "ptu_fps_ammo_types",
  "ptu_vehicle_components",
];

describe("Crafting/loot resilient to purged PTU shadow tables", () => {
  let sessionToken: string;
  let userId: string;

  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    const u = await createTestUser(env.DB);
    sessionToken = u.sessionToken;
    userId = u.userId;

    // LIVE blueprint + matching loot item + a crafted ownership row.
    await env.DB.prepare(
      `INSERT INTO crafting_blueprints (uuid, tag, name, type, sub_type, output_item)
       VALUES ('res-bp', 'BP_RES', 'Res BP', 'weapons', 'rifle', 'ITEM_RES')`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO loot_map (uuid, name, type, sub_type, class_name, game_version_id, updated_at)
       VALUES ('res-loot', 'Res Item', 'Weapon', 'Rifle', 'ITEM_RES', ${TEST_GAME_VERSION_ID}, datetime('now'))`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO user_blueprints (user_id, blueprint_uuid, is_owned, crafted_quantity, source, updated_at)
       VALUES (?, 'res-bp', 1, 2, 'manual', datetime('now'))`,
    ).bind(userId).run();

    // Simulate the PTU purge.
    for (const t of PTU_TABLES) {
      await env.DB.prepare(`DROP TABLE IF EXISTS ${t}`).run();
    }
  });

  it("sanity: PTU shadow tables really are gone", async () => {
    const row = await env.DB
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ptu_crafting_blueprints'")
      .first();
    expect(row).toBeNull();
  });

  it("GET /api/loot/crafted works with PTU purged (#92 crafted-filter backend)", async () => {
    const res = await SELF.fetch("http://localhost/api/loot/crafted", {
      headers: await authHeaders(sessionToken),
    });
    expect(res.status).toBe(200);
    const map = (await res.json()) as Record<string, number>;
    expect(map["res-loot"]).toBe(2);
  });

  it("GET /api/blueprints list works with PTU purged", async () => {
    const res = await SELF.fetch("http://localhost/api/blueprints", {
      headers: await authHeaders(sessionToken),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ blueprint_uuid: string }> };
    expect(body.items.some((i) => i.blueprint_uuid === "res-bp")).toBe(true);
  });

  it("POST build-save works with PTU purged", async () => {
    const res = await SELF.fetch("http://localhost/api/blueprints/res-bp/builds", {
      method: "POST",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Resilient Build", qualityConfig: { "0": 1000 } }),
    });
    expect(res.status).toBe(200);
  });
});
