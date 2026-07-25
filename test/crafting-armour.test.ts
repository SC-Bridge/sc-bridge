import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";

describe("/api/gamedata/crafting armour base_stats", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    const db = env.DB;
    const gv = await db.prepare(`SELECT id FROM game_versions WHERE is_default = 1`).first<{ id: number }>();
    await db.prepare(
      `INSERT INTO fps_armour (uuid, class_name, name, sub_type, resist_physical, resist_energy, resist_distortion, resist_thermal, resist_biochemical, resist_stun, temperature_min, temperature_max, armor_weight, ir_emission, em_emission, inventory_volume, protected_body_parts, game_version_id, removed)
       VALUES ('arm-uuid-1', 'tst_core_medium_01', 'Test Core', 'Medium', 0.2, 0.15, 0.1, 0.05, 0, 0, -80, 120, 12.5, 1.1, 1.0, 40000, 'Torso', ?, 0)`
    ).bind(gv!.id).run();
    await db.prepare(
      `INSERT INTO fps_helmets (uuid, class_name, name, sub_type, resist_physical, resist_energy, resist_distortion, resist_thermal, resist_biochemical, resist_stun, temperature_min, temperature_max, armor_weight, ir_emission, em_emission, inventory_volume, game_version_id, removed)
       VALUES ('helm-uuid-1', 'tst_helmet_medium_01', 'Test Helmet', 'Medium', 0.1, 0.1, 0.1, 0, 0, 0, -60, 100, 3.5, 1.0, 1.0, 8000, ?, 0)`
    ).bind(gv!.id).run();
    for (const cls of ["tst_core_medium_01", "tst_helmet_medium_01"]) {
      await db.prepare(
        `INSERT INTO crafting_blueprints (uuid, tag, name, type, sub_type, output_item, game_version_id, removed)
         VALUES (?, ?, ?, 'armour', 'combat', ?, ?, 0)`
      ).bind(`bp-${cls}`, `BP_CRAFT_${cls}`, cls, cls, gv!.id).run();
    }
  });

  it("serves resistances, temps, weight, emissions, volume and armour_slot", async () => {
    const res = await SELF.fetch("http://localhost/api/gamedata/crafting");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { blueprints: Array<{ output_item?: string; tag?: string; base_stats?: Record<string, unknown> }> };
    const core = body.blueprints.find((b) => b.tag === "BP_CRAFT_tst_core_medium_01");
    expect(core?.base_stats).toMatchObject({
      item_name: "Test Core", armour_slot: "core",
      resist_physical: 0.2, temperature_min: -80, temperature_max: 120,
      weight: 12.5, ir_emission: 1.1, em_emission: 1, inventory_volume: 40000,
    });
    const helm = body.blueprints.find((b) => b.tag === "BP_CRAFT_tst_helmet_medium_01");
    expect(helm?.base_stats).toMatchObject({ item_name: "Test Helmet", armour_slot: "helmet", resist_physical: 0.1, weight: 3.5 });
  });
});
