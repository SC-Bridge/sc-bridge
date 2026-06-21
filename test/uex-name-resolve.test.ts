import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { setupTestDatabase, TEST_GAME_VERSION_ID } from "./apply-migrations";
import { syncItems } from "../src/lib/uex";

// UEX prices many components (radars/scanners) by NAME with an empty item_uuid.
// syncItems must resolve those against loot_map by name so the price isn't dropped.
describe("syncItems — resolve UEX prices with no item_uuid by name", () => {
  let termId: number;

  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    const db = env.DB;
    // A radar in loot_map (unique name) — UEX will price it by name with no uuid.
    await db.prepare(
      "INSERT INTO loot_map (uuid, name, class_name, game_version_id, updated_at) VALUES ('radar-hunter-uuid','Hunter','test_radar_hunter',?,datetime('now'))",
    ).bind(TEST_GAME_VERSION_ID).run();
    // An AMBIGUOUS name (two loot_map rows) must NOT resolve.
    await db.prepare("INSERT INTO loot_map (uuid,name,game_version_id,updated_at) VALUES ('dup-a','Twin Item',?,datetime('now'))").bind(TEST_GAME_VERSION_ID).run();
    await db.prepare("INSERT INTO loot_map (uuid,name,game_version_id,updated_at) VALUES ('dup-b','Twin Item',?,datetime('now'))").bind(TEST_GAME_VERSION_ID).run();

    await db.prepare(
      "INSERT INTO shops (uuid,name,slug,shop_type,location_label,game_version_id) VALUES ('nr-shop','Ship Parts','nr-shop','ship_components','Area18',?)",
    ).bind(TEST_GAME_VERSION_ID).run();
    const shop = await db.prepare("SELECT id FROM shops WHERE uuid='nr-shop'").first<{ id: number }>();
    await db.prepare(
      "INSERT INTO terminals (uuid,shop_id,shop_name_key,terminal_type,uex_terminal_id,game_version_id) VALUES ('nr-term',?,'NR Terminal','item',77,?)",
    ).bind(shop!.id, TEST_GAME_VERSION_ID).run();
    termId = (await db.prepare("SELECT id FROM terminals WHERE uuid='nr-term'").first<{ id: number }>())!.id;
  });

  it("resolves a uuid-less price by name and stores it under the loot_map uuid", async () => {
    const uexToOurs = new Map<number, number>([[77, termId]]);
    const prices = [
      { id_terminal: 77, item_uuid: "", item_name: "Hunter", price_buy: 56000, price_sell: 0 },
      { id_terminal: 77, item_uuid: "", item_name: "Twin Item", price_buy: 999, price_sell: 0 }, // ambiguous → skipped
      { id_terminal: 77, item_uuid: "", item_name: "Nonexistent Thing", price_buy: 1, price_sell: 0 }, // no match → skipped
    ];
    const n = await syncItems(env.DB, uexToOurs, TEST_GAME_VERSION_ID, prices);
    expect(n).toBe(1); // only Hunter resolved

    const row = await env.DB.prepare(
      "SELECT latest_buy_price, latest_source FROM terminal_inventory WHERE terminal_id=? AND item_uuid='radar-hunter-uuid'",
    ).bind(termId).first<{ latest_buy_price: number; latest_source: string }>();
    expect(row?.latest_buy_price).toBe(56000);
    expect(row?.latest_source).toBe("uex");

    // ambiguous name must NOT have been written
    const dup = await env.DB.prepare("SELECT COUNT(*) n FROM terminal_inventory WHERE item_uuid IN ('dup-a','dup-b')").first<{ n: number }>();
    expect(dup?.n).toBe(0);
  });
});
