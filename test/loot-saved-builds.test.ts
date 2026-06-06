import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders, seedLootItem } from "./helpers";

/**
 * GET /api/loot/saved-builds — surfaces the user's saved builds per loot uuid
 * (names + made count), INCLUDING made=0 (unlike /crafted which needs qty>0).
 * Powers the Item Finder "saved build" marker + search-by-build-name (#90).
 */
describe("Loot Saved Builds — GET /api/loot/saved-builds", () => {
  let sessionToken: string;
  let userId: string;
  let lootUuid: string;

  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    const user = await createTestUser(env.DB);
    sessionToken = user.sessionToken;
    userId = user.userId;

    const item = await seedLootItem(env.DB, { name: "SB Rifle" });
    lootUuid = item.uuid;
    await env.DB.prepare("UPDATE loot_map SET class_name = ? WHERE uuid = ?")
      .bind("sb_rifle_01", lootUuid).run();

    const bpUuid = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    await env.DB.prepare(
      `INSERT INTO crafting_blueprints (uuid, tag, name, type, sub_type, output_item)
       VALUES (?, 'BP_SB', 'SB Rifle BP', 'weapons', 'rifle', 'sb_rifle_01')`,
    ).bind(bpUuid).run();

    // Two builds: one made, one not (made=0 must still appear).
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO user_blueprint_builds (user_id, blueprint_uuid, name, quality_config_json, crafted_quantity)
         VALUES (?, ?, 'Glass Cannon', '{"0":1000}', 3)`,
      ).bind(userId, bpUuid),
      env.DB.prepare(
        `INSERT INTO user_blueprint_builds (user_id, blueprint_uuid, name, quality_config_json, crafted_quantity)
         VALUES (?, ?, 'Budget', '{"0":250}', 0)`,
      ).bind(userId, bpUuid),
    ]);
  });

  it("requires authentication", async () => {
    const res = await SELF.fetch("http://localhost/api/loot/saved-builds");
    expect(res.status).toBe(401);
  });

  it("returns saved builds (incl. made=0) keyed by loot uuid", async () => {
    const res = await SELF.fetch("http://localhost/api/loot/saved-builds", {
      headers: await authHeaders(sessionToken),
    });
    expect(res.status).toBe(200);
    const map = (await res.json()) as Record<string, { name: string; crafted: number }[]>;
    const builds = map[lootUuid];
    expect(builds).toBeTruthy();
    const byName = Object.fromEntries(builds.map((b) => [b.name, b.crafted]));
    expect(byName["Glass Cannon"]).toBe(3);
    expect(byName["Budget"]).toBe(0); // made=0 still surfaced
  });

  it("returns empty object when the user has no builds", async () => {
    const other = await createTestUser(env.DB);
    const res = await SELF.fetch("http://localhost/api/loot/saved-builds", {
      headers: await authHeaders(other.sessionToken),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });
});
