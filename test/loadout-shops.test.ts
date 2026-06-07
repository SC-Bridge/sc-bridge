import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { setupTestDatabase, TEST_GAME_VERSION_ID } from "./apply-migrations";
import { seedVehicle, seedLootItem, createTestUser, authHeaders, seedFleetEntry } from "./helpers";
import { getShipLoadout } from "../src/db/queries";

/**
 * Location Planner (#94) data path: getShipLoadout must expose each installed
 * component's class_name AND attach `shops` (loot_map → terminal_inventory →
 * terminals → shops). Previously the stock loadout carried neither, so the
 * planner showed everything as "loot only".
 */
describe("getShipLoadout — Location Planner shop attachment (#94)", () => {
  let vid: number;
  let fleetId: number;
  let buyCompId: number;
  let sessionToken: string;

  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    vid = await seedVehicle(env.DB, { slug: "shoptest-ship", name: "Shop Test Ship" });

    // Three power plants: sold directly, loot-only, and a ship-default variant
    // whose exact class_name isn't sold but a same-NAMED variant is.
    for (const [uuid, cls, name] of [
      ["comp-pp-buy", "shoptest_pp_buy", "Buyable Power Plant"],
      ["comp-pp-loot", "shoptest_pp_loot", "Loot Power Plant"],
      ["comp-pp-shared", "shoptest_pp_default", "Shared Power Plant"],
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
      env.DB.prepare(
        `INSERT INTO vehicle_ports (uuid, vehicle_id, name, category_label, size_min, size_max, port_type, equipped_item_uuid, editable, game_version_id)
         VALUES ('port-pp-shared', ?, 'hardpoint_power_3', 'Power', 2, 2, 'power', 'comp-pp-shared', 1, ?)`,
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

    // A SOLD variant that shares the display name "Shared Power Plant" but has a
    // different class_name than the installed comp-pp-shared (shoptest_pp_default).
    const lmShared = await seedLootItem(env.DB, { name: "Shared Power Plant", category: "ship_component" });
    await env.DB.prepare("UPDATE loot_map SET class_name = 'shoptest_pp_sold' WHERE uuid = ?").bind(lmShared.uuid).run();
    await env.DB.prepare(
      `INSERT INTO terminal_inventory (terminal_id, item_uuid, item_name, latest_buy_price, latest_source, latest_observed_at, game_version_id)
       VALUES (?, ?, 'Shared Power Plant', 4500, 'uex', datetime('now'), ?)`,
    ).bind(t!.id, lmShared.uuid, TEST_GAME_VERSION_ID).run();

    // A saved fleet-loadout override (the user swapped port-pp-loot to the
    // buyable plant) — exercises GET /fleet/:id carrying shops after save (#94).
    const user = await createTestUser(env.DB);
    sessionToken = user.sessionToken;
    fleetId = await seedFleetEntry(env.DB, user.userId, vid);
    buyCompId = (await env.DB.prepare("SELECT id FROM vehicle_components WHERE uuid = 'comp-pp-buy'").first<{ id: number }>())!.id;
    const portLoot = (await env.DB.prepare("SELECT id FROM vehicle_ports WHERE uuid = 'port-pp-loot'").first<{ id: number }>())!.id;
    await env.DB.prepare(
      `INSERT INTO user_fleet_loadout (user_id, user_fleet_id, port_id, component_id, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
    ).bind(user.userId, fleetId, portLoot, buyCompId).run();
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

  it("does NOT borrow a same-named variant's shops — ship-default SKU stays empty", async () => {
    // comp-pp-shared (shoptest_pp_default) shares the display name "Shared Power
    // Plant" with a SOLD variant (shoptest_pp_sold), but is a distinct component.
    // Borrowing the other variant's price would misrepresent it, so it must
    // surface as "Not Sold or Lootable" (no shops), not a fake price.
    const comps = await getShipLoadout(env.DB, "shoptest-ship");
    const shared = comps.find((c) => c.class_name === "shoptest_pp_default");
    expect(shared).toBeTruthy();
    expect(shared!.shops).toEqual([]);
  });

  it("GET /fleet/:id carries class_name + child_name + shops on saved overrides", async () => {
    const res = await SELF.fetch(`http://localhost/api/loadout/fleet/${fleetId}`, {
      headers: await authHeaders(sessionToken),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { overrides: Array<Record<string, unknown>> };
    const ov = body.overrides.find((o) => o.component_id === buyCompId);
    expect(ov).toBeTruthy();
    // Without these, the client merge falls back to the stock component's name
    // and shops (the save-reverts-to-default + wrong-shop bug).
    expect(ov!.class_name).toBe("shoptest_pp_buy");
    expect(ov!.child_name).toBe("Buyable Power Plant");
    const shops = ov!.shops as Array<Record<string, unknown>>;
    expect(shops).toHaveLength(1);
    expect(shops[0].buy_price).toBe(9240);
  });
});
