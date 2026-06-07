import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { setupTestDatabase, TEST_GAME_VERSION_ID } from "./apply-migrations";
import { seedVehicle, seedLootItem } from "./helpers";
import { getShipLoadout } from "../src/db/queries";

/**
 * Location Planner (#94) data path: getShipLoadout must expose each installed
 * component's class_name AND attach `shops` (loot_map → terminal_inventory →
 * terminals → shops). Previously the stock loadout carried neither, so the
 * planner showed everything as "loot only".
 */
describe("getShipLoadout — Location Planner shop attachment (#94)", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    const vid = await seedVehicle(env.DB, { slug: "shoptest-ship", name: "Shop Test Ship" });

    // Two power plants: one sold in a shop, one loot-only.
    for (const [uuid, cls, name] of [
      ["comp-pp-buy", "shoptest_pp_buy", "Buyable Power Plant"],
      ["comp-pp-loot", "shoptest_pp_loot", "Loot Power Plant"],
    ] as const) {
      await env.DB.prepare(
        `INSERT INTO vehicle_components (uuid, name, slug, class_name, type, size, grade, game_version_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'PowerPlant', 2, 'A', ?, datetime('now'), datetime('now'))`,
      ).bind(uuid, name, uuid, cls, TEST_GAME_VERSION_ID).run();
      const c = await env.DB.prepare("SELECT id FROM vehicle_components WHERE uuid = ?").bind(uuid).first<{ id: number }>();
      await env.DB.prepare(
        `INSERT INTO component_powerplants (component_id, game_version_id, power_output) VALUES (?, ?, 5000)`,
      ).bind(c!.id, TEST_GAME_VERSION_ID).run();
    }

    // Top-level power ports, one per component.
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO vehicle_ports (uuid, vehicle_id, name, category_label, size_min, size_max, port_type, equipped_item_uuid, editable, game_version_id)
         VALUES ('port-pp-buy', ?, 'hardpoint_power_1', 'Power', 2, 2, 'power', 'comp-pp-buy', 1, ?)`,
      ).bind(vid, TEST_GAME_VERSION_ID),
      env.DB.prepare(
        `INSERT INTO vehicle_ports (uuid, vehicle_id, name, category_label, size_min, size_max, port_type, equipped_item_uuid, editable, game_version_id)
         VALUES ('port-pp-loot', ?, 'hardpoint_power_2', 'Power', 2, 2, 'power', 'comp-pp-loot', 1, ?)`,
      ).bind(vid, TEST_GAME_VERSION_ID),
    ]);

    // Shop chain for the buyable plant only: loot_map → terminal_inventory → terminals → shops.
    const lm = await seedLootItem(env.DB, { name: "Buyable Power Plant", category: "ship_component" });
    await env.DB.prepare("UPDATE loot_map SET class_name = 'shoptest_pp_buy' WHERE uuid = ?").bind(lm.uuid).run();
    await env.DB.prepare(
      `INSERT INTO shops (uuid, name, display_name, slug, location_label, game_version_id, removed)
       VALUES ('shop-pp', 'Shop_Internal', 'Power Hub', 'power-hub', 'Area18', ?, 0)`,
    ).bind(TEST_GAME_VERSION_ID).run();
    const s = await env.DB.prepare("SELECT id FROM shops WHERE uuid = 'shop-pp'").first<{ id: number }>();
    await env.DB.prepare(
      `INSERT INTO terminals (uuid, shop_id, shop_name_key, terminal_type, game_version_id)
       VALUES ('term-pp', ?, 'SCShop_PowerHub', 'item', ?)`,
    ).bind(s!.id, TEST_GAME_VERSION_ID).run();
    const t = await env.DB.prepare("SELECT id FROM terminals WHERE uuid = 'term-pp'").first<{ id: number }>();
    await env.DB.prepare(
      `INSERT INTO terminal_inventory (terminal_id, item_uuid, item_name, latest_buy_price, latest_source, latest_observed_at, game_version_id)
       VALUES (?, ?, 'Buyable Power Plant', 9240, 'uex', datetime('now'), ?)`,
    ).bind(t!.id, lm.uuid, TEST_GAME_VERSION_ID).run();
  });

  it("exposes class_name + attaches shops to buyable stock components", async () => {
    const comps = await getShipLoadout(env.DB, "shoptest-ship");
    const buyable = comps.find((c) => c.class_name === "shoptest_pp_buy");
    expect(buyable).toBeTruthy();
    const shops = buyable!.shops as Array<Record<string, unknown>>;
    expect(shops).toHaveLength(1);
    expect(shops[0].buy_price).toBe(9240);
    expect(shops[0].shop_name).toBe("Power Hub");
    expect(shops[0].location_label).toBe("Area18");
  });

  it("leaves shops empty for components not sold anywhere", async () => {
    const comps = await getShipLoadout(env.DB, "shoptest-ship");
    const loot = comps.find((c) => c.class_name === "shoptest_pp_loot");
    expect(loot).toBeTruthy();
    expect(loot!.shops).toEqual([]);
  });
});
