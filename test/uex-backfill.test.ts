import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { setupTestDatabase, TEST_GAME_VERSION_ID } from "./apply-migrations";
import { backfillBuyOnlyLootMap } from "../src/lib/uex";

/**
 * backfillBuyOnlyLootMap (#135 durable fix) — once UEX prices an item that the
 * p4k extractor missed (buy-only, never in a loot table), ensure it gets a
 * loot_map row so it's searchable + price-linked. Runs on every UEX item sync;
 * idempotent; self-heals across full DB reloads.
 */
describe("backfillBuyOnlyLootMap", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  async function seedUexItem(uuid: string, name: string): Promise<void> {
    // shop + terminal (terminal_inventory.terminal_id is a NOT NULL FK)
    const slug = `s-${uuid.slice(0, 6)}`;
    await env.DB.prepare(
      `INSERT INTO shops (uuid, name, slug, game_version_id) VALUES (?, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), `Shop ${slug}`, slug, TEST_GAME_VERSION_ID).run();
    const shop = await env.DB.prepare("SELECT id FROM shops WHERE slug=?").bind(slug).first<{ id: number }>();
    await env.DB.prepare(
      `INSERT INTO terminals (uuid, shop_id, shop_name_key, terminal_type, game_version_id) VALUES (?, ?, ?, 'item', ?)`,
    ).bind(crypto.randomUUID(), shop!.id, slug, TEST_GAME_VERSION_ID).run();
    const term = await env.DB.prepare("SELECT id FROM terminals WHERE shop_name_key=?").bind(slug).first<{ id: number }>();
    await env.DB.prepare(
      `INSERT INTO terminal_inventory (terminal_id, item_uuid, item_type, item_name, latest_buy_price, latest_source, latest_observed_at, game_version_id)
       VALUES (?, ?, 'item', ?, 5000, 'uex', datetime('now'), ?)`,
    ).bind(term!.id, uuid, name, TEST_GAME_VERSION_ID).run();
  }

  it("creates a searchable loot_map row for a UEX-only item, categorized by name", async () => {
    const bombUuid = crypto.randomUUID();
    await seedUexItem(bombUuid, "Colossus Bomb");
    const made = await backfillBuyOnlyLootMap(env.DB, TEST_GAME_VERSION_ID);
    expect(made).toBeGreaterThanOrEqual(1);
    const row = await env.DB.prepare("SELECT name, category, data_source FROM loot_map WHERE uuid=?").bind(bombUuid).first();
    expect(row).toMatchObject({ name: "Colossus Bomb", category: "ship_weapon", data_source: "terminal_inventory_backfill" });
  });

  it("assigns categories by name group", async () => {
    const casing = crypto.randomUUID();
    const nozzle = crypto.randomUUID();
    const fab = crypto.randomUUID();
    await seedUexItem(casing, "mobiGlas Amber Casing");
    await seedUexItem(nozzle, "Harkin");
    await seedUexItem(fab, "RediMake Item Fabricator");
    await backfillBuyOnlyLootMap(env.DB, TEST_GAME_VERSION_ID);
    const cat = async (u: string) => (await env.DB.prepare("SELECT category FROM loot_map WHERE uuid=?").bind(u).first<{ category: string }>())?.category;
    expect(await cat(casing)).toBe("clothing");
    expect(await cat(nozzle)).toBe("ship_component");
    expect(await cat(fab)).toBe("misc");
  });

  it("is idempotent and skips placeholder / lowercase-junk items", async () => {
    await seedUexItem(crypto.randomUUID(), "<= PLACEHOLDER =>");
    await seedUexItem(crypto.randomUUID(), "aluminum");
    const before = await env.DB.prepare("SELECT COUNT(*) n FROM loot_map WHERE data_source='terminal_inventory_backfill'").first<{ n: number }>();
    const made = await backfillBuyOnlyLootMap(env.DB, TEST_GAME_VERSION_ID);
    const after = await env.DB.prepare("SELECT COUNT(*) n FROM loot_map WHERE data_source='terminal_inventory_backfill'").first<{ n: number }>();
    expect(made).toBe(0); // nothing new — placeholders/junk excluded, prior rows already exist
    expect(after!.n).toBe(before!.n);
  });
});
