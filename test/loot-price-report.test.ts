import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase, TEST_GAME_VERSION_ID } from "./apply-migrations";
import { createTestUser, authHeaders, seedLootItem } from "./helpers";

/**
 * POST /api/loot/:uuid/report-price — community price reporting (#139).
 * A logged-in user reports a price for an item at a shop; it's stored like
 * UEX/companion data (source='user' in the same tables) and then surfaces
 * through the standard shop-availability query with price_source='user'.
 */
describe("POST /api/loot/:uuid/report-price", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  async function seedShopWithTerminal(name: string): Promise<number> {
    const slug = `${name.toLowerCase().replace(/\s+/g, "-")}-${crypto.randomUUID().slice(0, 6)}`;
    await env.DB.prepare(
      `INSERT INTO shops (uuid, name, slug, location_label, game_version_id) VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(crypto.randomUUID(), name, slug, `${name} (Test Location)`, TEST_GAME_VERSION_ID)
      .run();
    const shop = await env.DB.prepare("SELECT id FROM shops WHERE slug = ?").bind(slug).first<{ id: number }>();
    await env.DB.prepare(
      `INSERT INTO terminals (uuid, shop_id, shop_name_key, terminal_type, game_version_id) VALUES (?, ?, ?, 'item', ?)`,
    )
      .bind(crypto.randomUUID(), shop!.id, slug, TEST_GAME_VERSION_ID)
      .run();
    return shop!.id;
  }

  it("rejects unauthenticated reports with 401", async () => {
    const { uuid } = await seedLootItem(env.DB, { name: "ReportAuthGun" });
    const res = await SELF.fetch(`http://localhost/api/loot/${uuid}/report-price`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopId: 1, buyPrice: 100 }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects a report with neither a buy nor sell price", async () => {
    const { uuid } = await seedLootItem(env.DB, { name: "ReportEmptyGun" });
    const shopId = await seedShopWithTerminal("Empty Bay");
    const { sessionToken } = await createTestUser(env.DB);
    const res = await SELF.fetch(`http://localhost/api/loot/${uuid}/report-price`, {
      method: "POST",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ shopId }),
    });
    expect(res.status).toBe(400);
  });

  it("saves a user price that then surfaces as a shop with price_source 'user'", async () => {
    const { uuid } = await seedLootItem(env.DB, { name: "ReportableGun" });
    const shopId = await seedShopWithTerminal("Platinum Bay");
    const { sessionToken } = await createTestUser(env.DB);

    const res = await SELF.fetch(`http://localhost/api/loot/${uuid}/report-price`, {
      method: "POST",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ shopId, buyPrice: 16740 }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const detail = (await (await SELF.fetch(`http://localhost/api/loot/${uuid}`)).json()) as {
      locations: { shops: Array<{ buy_price: number; price_source: string; shop_name: string }> };
    };
    const reported = detail.locations.shops.find((s) => s.buy_price === 16740);
    expect(reported).toBeDefined();
    expect(reported!.price_source).toBe("user");
    expect(reported!.shop_name).toBe("Platinum Bay");
  });

  it("returns 404 for an unknown item uuid", async () => {
    const shopId = await seedShopWithTerminal("Ghost Bay");
    const { sessionToken } = await createTestUser(env.DB);
    const res = await SELF.fetch(`http://localhost/api/loot/00000000-0000-0000-0000-000000000000/report-price`, {
      method: "POST",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ shopId, buyPrice: 100 }),
    });
    expect(res.status).toBe(404);
  });
});
