/**
 * Regression test for the UEX terminal_inventory UPSERT bug.
 *
 * The bug: the ON CONFLICT SET clause omitted `game_version_id = excluded.game_version_id`,
 * so when a new game version became the default, existing terminal_inventory rows stayed
 * stranded at the old game_version_id. All 50,286 rows were stuck at 4.7.1-live for
 * 29 days after the 4.8.0-live cutover.
 *
 * This test proves:
 * 1. The LIVE syncCommodities function correctly advances game_version_id (and prices)
 *    when a row already exists. If game_version_id is removed from the SET clause in
 *    uex.ts, this test will fail — that's the point.
 * 2. A SQL-level proof that omitting game_version_id from the SET clause strands the
 *    version (documents the pre-fix behaviour).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { setupTestDatabase, TEST_GAME_VERSION_ID } from "./apply-migrations";
import { syncCommodities, syncItems } from "../src/lib/uex";

// Seed prerequisites:
//   - Both game_versions rows (V1 at is_default=0, V2 at is_default=1)
//   - A shop + terminal with a known uex_terminal_id
//   - A trade_commodities entry that matches the mocked UEX response
// Returns { termId, uexTerminalId, itemUuid } for use in the test.
async function seedTerminal(db: D1Database): Promise<{ termId: number; uexTerminalId: number; itemUuid: string }> {
  // V1 (id=1) is already seeded by setupTestDatabase with is_default=1.
  // V2 (id=2) represents the new patch default — INSERT OR IGNORE for safety.
  await db
    .prepare(
      `INSERT OR IGNORE INTO game_versions (id, uuid, code, channel, is_default, released_at)
       VALUES (2, 'gv-test-0000-0000-0000-000000000002', '4.8.0-test', 'LIVE', 1, '2026-05-01')`,
    )
    .run();

  await db
    .prepare(
      `INSERT OR IGNORE INTO shops (uuid, name, slug, shop_type, is_event, location_label, game_version_id)
       VALUES ('uex-test-shop', 'UEX Test Shop', 'uex-test-shop', 'commodity', 0, 'Lorville', ?)`,
    )
    .bind(TEST_GAME_VERSION_ID)
    .run();

  const shop = await db
    .prepare(`SELECT id FROM shops WHERE uuid = 'uex-test-shop'`)
    .first<{ id: number }>();

  const uexTerminalId = 42;
  await db
    .prepare(
      `INSERT OR IGNORE INTO terminals (uuid, shop_id, shop_name_key, terminal_type, game_version_id, uex_terminal_id)
       VALUES ('uex-test-term', ?, 'SCShop_UEXTest', 'commodity', ?, ?)`,
    )
    .bind(shop!.id, TEST_GAME_VERSION_ID, uexTerminalId)
    .run();

  const terminal = await db
    .prepare(`SELECT id FROM terminals WHERE uuid = 'uex-test-term'`)
    .first<{ id: number }>();

  // Seed a trade_commodity with a name that matches what the mock UEX response returns.
  const itemUuid = "uex-test-commodity-uuid-1234";
  await db
    .prepare(
      `INSERT OR IGNORE INTO trade_commodities (uuid, name, slug, class_name, game_version_id)
       VALUES (?, 'TestOre', 'test-ore', 'TestOre', ?)`,
    )
    .bind(itemUuid, TEST_GAME_VERSION_ID)
    .run();

  return { termId: terminal!.id, uexTerminalId, itemUuid };
}

describe("UEX UPSERT migrates game_version_id", () => {
  // Single cast — avoids repeating `env.DB as D1Database` on every use.
  const db = env.DB as D1Database;

  beforeEach(async () => {
    await setupTestDatabase(env.DB);
    // Clean test rows so each test starts fresh.
    await db
      .prepare(`DELETE FROM terminal_inventory WHERE item_uuid LIKE 'uex-test-%'`)
      .run();
  });

  it("syncCommodities advances game_version_id and prices on existing row", async () => {
    const V1 = 1; // 4.7.1-test — old default
    const V2 = 2; // 4.8.0-test — new default (is_default=1)

    const { termId, uexTerminalId, itemUuid } = await seedTerminal(db);

    // Seed existing row at V1 with old prices.
    await db
      .prepare(
        `INSERT INTO terminal_inventory
         (terminal_id, item_uuid, item_type, item_name, latest_buy_price, latest_sell_price,
          latest_source, latest_observed_at, game_version_id)
         VALUES (?, ?, 'commodity', 'TestOre', 10.0, 12.0, 'uex', datetime('now'), ?)`,
      )
      .bind(termId, itemUuid, V1)
      .run();

    // Mock the UEX API response. syncCommodities calls
    // fetchUex("commodities_prices_all") → GET https://uexcorp.space/api/2.0/commodities_prices_all
    // Response shape: { status: "ok", data: UexCommodityPrice[] }
    const mockResponse = {
      status: "ok",
      data: [
        {
          id_terminal: uexTerminalId,
          commodity_name: "TestOre",
          price_buy: 15.0,
          price_sell: 18.0,
        },
      ],
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    // Build the same terminal map that syncUexPrices would build, then call
    // syncCommodities directly — this exercises the production UPSERT code path.
    const uexToOurs = new Map<number, number>([[uexTerminalId, termId]]);
    const count = await syncCommodities(db, uexToOurs, V2);

    // Should have upserted exactly one row.
    expect(count).toBe(1);

    const row = await db
      .prepare(
        `SELECT latest_buy_price, latest_sell_price, game_version_id
         FROM terminal_inventory
         WHERE terminal_id = ? AND item_uuid = ?`,
      )
      .bind(termId, itemUuid)
      .first<{ latest_buy_price: number; latest_sell_price: number; game_version_id: number }>();

    expect(row).not.toBeNull();
    expect(row?.latest_buy_price).toBe(15);
    expect(row?.latest_sell_price).toBe(18);
    // Regression assertion: game_version_id MUST advance to V2.
    // If `game_version_id = excluded.game_version_id` is removed from the SET clause
    // in src/lib/uex.ts, this assertion will fail — that's intentional.
    expect(row?.game_version_id).toBe(V2);

    vi.restoreAllMocks();
  });

  it("SQL-level proof: omitting game_version_id from SET clause strands the version (pre-fix shape)", async () => {
    // NOTE: This is a SQL-level documentation test, NOT a function-level test.
    // It proves the invariant that a bare UPSERT without game_version_id in the SET
    // clause will strand the row at the old version — justifying why the production
    // code MUST include that column. The function-level regression is covered above.

    const V1 = TEST_GAME_VERSION_ID;
    const V2 = 2;

    const { termId } = await seedTerminal(db);

    // Seed existing row at V1.
    await db
      .prepare(
        `INSERT INTO terminal_inventory
         (terminal_id, item_uuid, item_type, item_name, latest_buy_price, latest_sell_price,
          latest_source, latest_observed_at, game_version_id)
         VALUES (?, 'uex-test-2', 'commodity', 'TestCommodity2', 10.0, 12.0, 'uex', datetime('now'), ?)`,
      )
      .bind(termId, V1)
      .run();

    // Simulate the PRE-FIX UPSERT — game_version_id intentionally ABSENT from SET clause.
    await db
      .prepare(
        `INSERT INTO terminal_inventory
         (terminal_id, item_uuid, item_type, item_name, latest_buy_price, latest_sell_price,
          latest_source, latest_observed_at, game_version_id)
         VALUES (?, 'uex-test-2', 'commodity', 'TestCommodity2', 15.0, 18.0, 'uex', datetime('now'), ?)
         ON CONFLICT(terminal_id, item_uuid) DO UPDATE SET
           latest_buy_price = excluded.latest_buy_price,
           latest_sell_price = excluded.latest_sell_price,
           latest_source = 'uex',
           latest_observed_at = datetime('now')`,
        // NOTE: game_version_id is NOT in the SET clause — this is the bug being documented.
      )
      .bind(termId, V2)
      .run();

    const row = await db
      .prepare(
        `SELECT latest_buy_price, latest_sell_price, game_version_id
         FROM terminal_inventory
         WHERE terminal_id = ? AND item_uuid = 'uex-test-2'`,
      )
      .bind(termId)
      .first<{ latest_buy_price: number; latest_sell_price: number; game_version_id: number }>();

    // Prices advance (the SET clause did update them)...
    expect(row?.latest_buy_price).toBe(15);
    expect(row?.latest_sell_price).toBe(18);
    // ...but game_version_id is STILL V1 — stranded at old version. This is the bug.
    expect(row?.game_version_id).toBe(V1);
  });
});

// 2026-06-01 — UEX's commodities_prices_all and items_prices_all both expose
// per-row `date_modified` (unix seconds) for when the community last updated
// the price report. The sync previously discarded this, so terminal_inventory
// only knew when WE last polled UEX (latest_observed_at), not when the
// community last actually reported the price. Without the report timestamp,
// the UI can't distinguish "fresh community data" from "UEX serving a 3-week-
// old report on a low-traffic terminal".
describe("UEX captures community report timestamp", () => {
  const db = env.DB as D1Database;

  beforeEach(async () => {
    await setupTestDatabase(env.DB);
    await db
      .prepare(`DELETE FROM terminal_inventory WHERE item_uuid LIKE 'uex-ts-%'`)
      .run();
  });

  it("syncCommodities captures date_modified and date_added from the UEX response", async () => {
    const { termId, uexTerminalId } = await seedTerminal(db);

    // Replace the seed commodity with one whose uuid matches our timestamp test prefix.
    await db
      .prepare(
        `INSERT OR IGNORE INTO trade_commodities (uuid, name, slug, category, game_version_id)
         VALUES ('uex-ts-cmdty', 'TimestampOre', 'timestampore', 'minerals', ?)`,
      )
      .bind(TEST_GAME_VERSION_ID)
      .run();

    const REPORT_MODIFIED = 1779565006; // 2026-05-23 06:36 UTC (9d before today)
    const REPORT_ADDED = 1703514825; // 2023-12-25 (long-lived row)
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "ok",
          data: [
            {
              id_terminal: uexTerminalId,
              commodity_name: "TimestampOre",
              price_buy: 100,
              price_sell: 120,
              date_modified: REPORT_MODIFIED,
              date_added: REPORT_ADDED,
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const uexToOurs = new Map<number, number>([[uexTerminalId, termId]]);
    const count = await syncCommodities(db, uexToOurs, TEST_GAME_VERSION_ID);
    expect(count).toBe(1);

    const row = await db
      .prepare(
        `SELECT uex_date_modified, uex_date_added, latest_buy_price, latest_sell_price
         FROM terminal_inventory
         WHERE terminal_id = ? AND item_uuid = 'uex-ts-cmdty'`,
      )
      .bind(termId)
      .first<{
        uex_date_modified: number;
        uex_date_added: number;
        latest_buy_price: number;
        latest_sell_price: number;
      }>();

    expect(row).not.toBeNull();
    expect(row?.uex_date_modified).toBe(REPORT_MODIFIED);
    expect(row?.uex_date_added).toBe(REPORT_ADDED);
    // Sanity: prices still bind correctly.
    expect(row?.latest_buy_price).toBe(100);
    expect(row?.latest_sell_price).toBe(120);

    vi.restoreAllMocks();
  });

  it("syncItems captures date_modified and date_added from the UEX response", async () => {
    const { termId, uexTerminalId } = await seedTerminal(db);

    const ITEM_UUID = "uex-ts-item-uuid";
    const REPORT_MODIFIED = 1778763945; // 2026-05-13
    const REPORT_ADDED = 1703516981;
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "ok",
          data: [
            {
              id_terminal: uexTerminalId,
              item_uuid: ITEM_UUID,
              item_name: "Omnisky III Cannon",
              price_buy: 15461,
              price_sell: 0,
              date_modified: REPORT_MODIFIED,
              date_added: REPORT_ADDED,
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const uexToOurs = new Map<number, number>([[uexTerminalId, termId]]);
    const count = await syncItems(db, uexToOurs, TEST_GAME_VERSION_ID);
    expect(count).toBe(1);

    const row = await db
      .prepare(
        `SELECT uex_date_modified, uex_date_added
         FROM terminal_inventory
         WHERE terminal_id = ? AND item_uuid = ?`,
      )
      .bind(termId, ITEM_UUID)
      .first<{ uex_date_modified: number; uex_date_added: number }>();

    expect(row).not.toBeNull();
    expect(row?.uex_date_modified).toBe(REPORT_MODIFIED);
    expect(row?.uex_date_added).toBe(REPORT_ADDED);

    vi.restoreAllMocks();
  });
});
