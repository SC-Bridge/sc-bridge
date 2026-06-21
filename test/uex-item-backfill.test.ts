import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { setupTestDatabase, TEST_GAME_VERSION_ID } from "./apply-migrations";
import { backfillUexItems } from "../src/lib/uex";

// UEX prices some items (Retaliator/Apollo bay modules, Flight Blades) by name
// with no item_uuid AND they aren't in loot_map — so they're invisible in the
// Item DB. backfillUexItems mints a synthetic loot_map row so they're searchable
// and priceable.
describe("backfillUexItems — make uuid-less UEX items visible in the Item DB", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    await env.DB.prepare(
      "INSERT INTO loot_map (uuid,name,game_version_id,updated_at) VALUES ('existing-u','Existing Item',?,datetime('now'))",
    ).bind(TEST_GAME_VERSION_ID).run();
  });

  it("creates rows only for uuid-less, non-junk, not-already-present items", async () => {
    const prices = [
      { id_terminal: 1, id_item: 9001, item_uuid: "", item_name: "Retaliator Cargo Module - Front", price_buy: 475000, price_sell: 0 },
      { id_terminal: 1, id_item: 9002, item_uuid: "", item_name: "Existing Item", price_buy: 1, price_sell: 0 }, // already in loot_map
      { id_terminal: 1, id_item: 9003, item_uuid: "", item_name: "@Item_NameJunk", price_buy: 1, price_sell: 0 }, // unlocalized junk
      { id_terminal: 1, id_item: 9004, item_uuid: "", item_name: "<= PLACEHOLDER =>", price_buy: 1, price_sell: 0 }, // placeholder
      { id_terminal: 1, id_item: 9005, item_uuid: "real-uuid", item_name: "Has Uuid", price_buy: 1, price_sell: 0 }, // has a real uuid
      { id_terminal: 1, id_item: 9006, item_uuid: "", item_name: "Zero Price", price_buy: 0, price_sell: 0 }, // unpriced
    ];

    const n = await backfillUexItems(env.DB, prices, TEST_GAME_VERSION_ID);
    expect(n).toBe(1);

    const row = await env.DB.prepare(
      "SELECT name, category, data_source FROM loot_map WHERE uuid='uex-item-9001'",
    ).first<{ name: string; category: string; data_source: string }>();
    expect(row?.name).toBe("Retaliator Cargo Module - Front");
    expect(row?.category).toBe("ship_component");
    expect(row?.data_source).toBe("uex");

    // junk / existing / uuid'd / unpriced created nothing
    const junk = await env.DB.prepare(
      "SELECT COUNT(*) c FROM loot_map WHERE uuid IN ('uex-item-9002','uex-item-9003','uex-item-9004','uex-item-9006')",
    ).first<{ c: number }>();
    expect(junk?.c).toBe(0);
  });

  it("is idempotent (re-run creates nothing new)", async () => {
    const prices = [
      { id_terminal: 1, id_item: 9001, item_uuid: "", item_name: "Retaliator Cargo Module - Front", price_buy: 475000, price_sell: 0 },
    ];
    const n = await backfillUexItems(env.DB, prices, TEST_GAME_VERSION_ID);
    expect(n).toBe(0);
  });
});
