import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";

// A backpack's carrying capacity (fps_armour.storage_capacity, µSCU) is not its
// own size (inventory_volume): the loadout page showed the Pembroke as
// "0K µSCU carry" when it used inventory_volume.
describe("/api/gamedata/crafting backpack storage_capacity", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    const db = env.DB;
    const gv = await db.prepare(`SELECT id FROM game_versions WHERE is_default = 1`).first<{ id: number }>();
    await db.prepare(
      `INSERT INTO fps_armour (uuid, class_name, name, sub_type, inventory_volume, storage_capacity, game_version_id, removed)
       VALUES ('bp-arm-uuid-1', 'tst_utility_heavy_backpack_01', 'Test Pack', 'Heavy', 0.062, 180000, ?, 0)`
    ).bind(gv!.id).run();
    await db.prepare(
      `INSERT INTO crafting_blueprints (uuid, tag, name, type, sub_type, output_item, game_version_id, removed)
       VALUES ('bp-tst-pack', 'BP_CRAFT_tst_utility_heavy_backpack_01', 'Test Pack', 'armour', 'combat', 'tst_utility_heavy_backpack_01', ?, 0)`
    ).bind(gv!.id).run();
  });

  it("serves the backpack's carrying capacity alongside its own size", async () => {
    const res = await SELF.fetch("http://localhost/api/gamedata/crafting");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { blueprints: Array<{ tag?: string; base_stats?: Record<string, unknown> }> };
    const pack = body.blueprints.find((b) => b.tag === "BP_CRAFT_tst_utility_heavy_backpack_01");
    expect(pack?.base_stats).toMatchObject({
      item_name: "Test Pack", armour_slot: "backpack",
      inventory_volume: 0.062, storage_capacity: 180000,
    });
  });
});
