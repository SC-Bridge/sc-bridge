// test/weapon-bench.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";

describe("GET /api/gamedata/weapon-bench", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    await env.DB.prepare(
      `INSERT INTO fps_attachments (uuid, name, class_name, sub_type, size, fire_rate_multiplier, damage_multiplier, game_version_id)
       VALUES ('att-stark', 'Stark Compensator 1', 'arma_barrel_comp_s1', 'barrel', 1, 0.8, NULL, 1)`
    ).run();
  });

  it("returns attachments with their stat-multiplier columns (public)", async () => {
    const res = await SELF.fetch("http://localhost/api/gamedata/weapon-bench");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { attachments: Array<Record<string, unknown>> };
    const stark = body.attachments.find((a) => a.uuid === "att-stark");
    expect(stark).toBeTruthy();
    expect(stark!.fire_rate_multiplier).toBe(0.8);
    expect(stark!.sub_type).toBe("barrel");
    // multiplier columns are present (key exists even when null)
    expect("damage_multiplier" in stark!).toBe(true);
    expect("projectile_speed_multiplier" in stark!).toBe(true);
  });

  it("crafting base_stats include loadout_icon for a weapon", async () => {
    // Seed a craftable weapon row + blueprint with a loadout_icon
    await env.DB.prepare(
      `INSERT INTO fps_weapons (uuid, class_name, name, game_version_id, loadout_icon)
       VALUES ('w-icontest', 'gmni_pistol_ballistic_01', 'LH86 Pistol', 1, 'https://imagedelivery.net/_nHFky6xiv-JbnhLN5CCrQ/gemini_lh86_pistol/public')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO crafting_blueprints (uuid, tag, name, type, sub_type, product_entity_class)
       VALUES ('bp-icontest', 'BP_CRAFT_gmni_pistol_ballistic_01', 'Gmni Pistol Ballistic 01', 'weapons', 'pistol', 'gmni_pistol_ballistic_01')`
    ).run();
    const res = await SELF.fetch("http://localhost/api/gamedata/crafting");
    const body = (await res.json()) as { blueprints: Array<{ name: string; base_stats?: { loadout_icon?: string } }> };
    const bp = body.blueprints.find((b) => b.name === "Gmni Pistol Ballistic 01");
    expect(bp?.base_stats?.loadout_icon).toContain("gemini_lh86_pistol");
  });
});
