import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { setupTestDatabase, TEST_GAME_VERSION_ID } from "./apply-migrations";
import { seedLootItem } from "./helpers";
import { getLootByUuid } from "../src/db/queries";

/**
 * Item Finder "Where to Buy" must match the EXACT item (its uuid), not every
 * variant sharing the display name (avoids attributing a sibling variant's shop
 * to an item, #94). The price shown is the community-reported price when present,
 * else the extracted in-game base price — UEX doesn't list most ship components,
 * so base is the only price they have. Consistent with the loadout planner.
 */
describe("getLootByUuid — Where to Buy: exact item + effective prices", () => {
  let soldUuid: string;
  let unsoldUuid: string;
  let baseOnlyUuid: string;

  beforeAll(async () => {
    await setupTestDatabase(env.DB);

    // Two variants sharing ONE display name "Twin Rack": one sold, one not.
    const sold = await seedLootItem(env.DB, { name: "Twin Rack", category: "ship_component" });
    soldUuid = sold.uuid;
    await env.DB.prepare("UPDATE loot_map SET class_name='twin_rack_sold' WHERE uuid=?").bind(soldUuid).run();
    const unsold = await seedLootItem(env.DB, { name: "Twin Rack", category: "ship_component" });
    unsoldUuid = unsold.uuid;
    await env.DB.prepare("UPDATE loot_map SET class_name='twin_rack_unsold' WHERE uuid=?").bind(unsoldUuid).run();
    // A third item that only has a game-file BASE price (no community report).
    const baseOnly = await seedLootItem(env.DB, { name: "Base Only Rack", category: "ship_component" });
    baseOnlyUuid = baseOnly.uuid;

    await env.DB.prepare(
      `INSERT INTO shops (uuid, name, display_name, slug, location_label, game_version_id, removed)
       VALUES ('s-twin', 'Shop_X', 'Twin Shop', 'twin-shop', 'Area18', ?, 0)`,
    ).bind(TEST_GAME_VERSION_ID).run();
    const s = await env.DB.prepare("SELECT id FROM shops WHERE uuid='s-twin'").first<{ id: number }>();
    await env.DB.prepare(
      `INSERT INTO terminals (uuid, shop_id, shop_name_key, terminal_type, game_version_id)
       VALUES ('t-twin', ?, 'SCShop_Twin', 'item', ?)`,
    ).bind(s!.id, TEST_GAME_VERSION_ID).run();
    const t = await env.DB.prepare("SELECT id FROM terminals WHERE uuid='t-twin'").first<{ id: number }>();
    // Sold variant: community-reported price.
    await env.DB.prepare(
      `INSERT INTO terminal_inventory (terminal_id, item_uuid, item_name, latest_buy_price, latest_source, latest_observed_at, game_version_id)
       VALUES (?, ?, 'Twin Rack', 12000, 'uex', datetime('now'), ?)`,
    ).bind(t!.id, soldUuid, TEST_GAME_VERSION_ID).run();
    // Base-only item: base price set, NO latest_source — surfaces via base fallback.
    await env.DB.prepare(
      `INSERT INTO terminal_inventory (terminal_id, item_uuid, item_name, base_buy_price, game_version_id)
       VALUES (?, ?, 'Base Only Rack', 9868, ?)`,
    ).bind(t!.id, baseOnlyUuid, TEST_GAME_VERSION_ID).run();
  });

  it("shows shops for the exact sold item", async () => {
    const row = await getLootByUuid(env.DB, soldUuid);
    const shops = (row!.locations as Record<string, Record<string, unknown>[]>).shops;
    expect(shops).toHaveLength(1);
    expect(shops[0].buy_price).toBe(12000);
  });

  it("does NOT borrow a same-named sibling's shops (exact uuid match)", async () => {
    const row = await getLootByUuid(env.DB, unsoldUuid);
    const shops = (row!.locations as Record<string, Record<string, unknown>[]>).shops;
    expect(shops).toEqual([]); // same name "Twin Rack" as the sold one, but its own uuid isn't sold
  });

  it("surfaces the game-file base price when no community report exists", async () => {
    const row = await getLootByUuid(env.DB, baseOnlyUuid);
    const shops = (row!.locations as Record<string, Record<string, unknown>[]>).shops;
    expect(shops).toHaveLength(1); // base price is the only price → still buyable
    expect(shops[0].buy_price).toBe(9868);
    expect(shops[0].price_source).toBe("base");
  });
});
