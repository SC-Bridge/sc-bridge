import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { setupTestDatabase, TEST_GAME_VERSION_ID } from "./apply-migrations";
import { ensureUexTerminals } from "../src/lib/uex";

// Mock the three UEX endpoints ensureUexTerminals fetches (terminals +
// items/commodities price feeds), dispatched by URL.
function mockUex(payloads: Record<string, unknown[]>) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url: RequestInfo | URL) => {
    const u = String(url);
    const key = Object.keys(payloads).find((k) => u.includes(k));
    return new Response(JSON.stringify({ status: "ok", data: key ? payloads[key] : [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
}

describe("ensureUexTerminals — self-heal terminals", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });
  afterEach(() => vi.restoreAllMocks());

  it("creates a shop+terminal (data_source='uex') for a UEX terminal we don't have", async () => {
    const db = env.DB;
    mockUex({
      terminals: [{ id: 9001, name: "Shop Terminal - Canard View", company_name: "Shop Terminal", type: "item", city_name: "Canard View", is_shop_vehicle: 1 }],
      items_prices_all: [{ id_terminal: 9001, item_uuid: "pyro-gun-uuid", item_name: "Pyro Gun", price_buy: 5000, price_sell: 0 }],
      commodities_prices_all: [],
    });

    const res = await ensureUexTerminals(db, TEST_GAME_VERSION_ID);
    expect(res.created).toBe(1);

    const t = await db.prepare("SELECT uex_terminal_id, shop_id FROM terminals WHERE uuid='uex-term-9001'").first<{ uex_terminal_id: number; shop_id: number }>();
    expect(t?.uex_terminal_id).toBe(9001);
    const s = await db.prepare("SELECT data_source, name, location_label FROM shops WHERE uuid='uex-shop-9001'").first<{ data_source: string; name: string; location_label: string }>();
    expect(s?.data_source).toBe("uex");
    expect(s?.location_label).toBe("Canard View");
  });

  it("maps an existing unmapped terminal instead of creating a duplicate", async () => {
    const db = env.DB;
    await db.prepare("INSERT INTO shops (uuid,name,slug,shop_type,location_label,game_version_id) VALUES ('ap-shop','Aparelli','aparelli-nb','clothing','New Babbage',?)").bind(TEST_GAME_VERSION_ID).run();
    const shop = await db.prepare("SELECT id FROM shops WHERE uuid='ap-shop'").first<{ id: number }>();
    await db.prepare("INSERT INTO terminals (uuid,shop_id,shop_name_key,terminal_type,game_version_id) VALUES ('ap-term',?,'Aparelli NewBabbage','item',?)").bind(shop!.id, TEST_GAME_VERSION_ID).run();

    mockUex({
      terminals: [{ id: 9002, name: "Aparelli - New Babbage", company_name: "Aparelli", type: "item", city_name: "New Babbage" }],
      items_prices_all: [{ id_terminal: 9002, item_uuid: "jacket-uuid", item_name: "Tempo Jacket", price_buy: 1200, price_sell: 0 }],
      commodities_prices_all: [],
    });

    const res = await ensureUexTerminals(db, TEST_GAME_VERSION_ID);
    expect(res.mapped).toBe(1);

    const t = await db.prepare("SELECT uex_terminal_id FROM terminals WHERE uuid='ap-term'").first<{ uex_terminal_id: number }>();
    expect(t?.uex_terminal_id).toBe(9002);
    const dup = await db.prepare("SELECT COUNT(*) n FROM shops WHERE uuid='uex-shop-9002'").first<{ n: number }>();
    expect(dup?.n).toBe(0);
  });

  it("skips UEX terminals with no priced items", async () => {
    const db = env.DB;
    mockUex({
      terminals: [{ id: 9003, name: "Empty Shop - Nowhere", company_name: "Empty Shop", type: "item", city_name: "Nowhere" }],
      items_prices_all: [{ id_terminal: 9003, item_uuid: "x", item_name: "X", price_buy: 0, price_sell: 0 }],
      commodities_prices_all: [],
    });
    const res = await ensureUexTerminals(db, TEST_GAME_VERSION_ID);
    expect(res.created).toBe(0);
    const t = await db.prepare("SELECT COUNT(*) n FROM terminals WHERE uuid='uex-term-9003'").first<{ n: number }>();
    expect(t?.n).toBe(0);
  });
});
