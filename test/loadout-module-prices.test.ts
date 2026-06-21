import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase, TEST_GAME_VERSION_ID } from "./apply-migrations";
import { seedVehicle } from "./helpers";

// Plan 1+2: the module read API must surface each bay module's effective UEX buy
// price (COALESCE latest→base), linked loot_map.name = vehicle_modules.display_name.
// Base modules with no UEX item must return price: null (UI shows "—"), not 0.

const SLUG = "module-price-ship";

async function seedModules(db: D1Database) {
  const vehicleId = await seedVehicle(db, { slug: SLUG, name: "Module Price Ship" });

  // Two modules on one port: a priced "cargo" variant + an unpriced "base" default.
  await db.batch([
    db
      .prepare(
        `INSERT INTO vehicle_modules (uuid, vehicle_id, port_name, class_name, display_name, size, tags, is_default, has_loadout, game_version_id, data_source)
         VALUES (?, ?, 'hardpoint_front_module', ?, ?, 3, 'TestTag', 1, 0, ?, 'p4k')`,
      )
      .bind("mp-base", vehicleId, "test_module_front_base", "Test Base Module - Front", TEST_GAME_VERSION_ID),
    db
      .prepare(
        `INSERT INTO vehicle_modules (uuid, vehicle_id, port_name, class_name, display_name, size, tags, is_default, has_loadout, game_version_id, data_source)
         VALUES (?, ?, 'hardpoint_front_module', ?, ?, 3, 'TestTag', 0, 0, ?, 'p4k')`,
      )
      .bind("mp-cargo", vehicleId, "test_module_front_cargo", "Test Cargo Module - Front", TEST_GAME_VERSION_ID),
  ]);

  // loot_map row for the cargo module — UEX-style: NULL class_name, name links it.
  await db
    .prepare(
      `INSERT INTO loot_map (uuid, name, class_name, type, category, game_version_id, updated_at)
       VALUES (?, ?, NULL, 'Module', 'component', ?, datetime('now'))`,
    )
    .bind("lm-cargo-mod", "Test Cargo Module - Front", TEST_GAME_VERSION_ID)
    .run();

  // Shop → terminal → inventory priced via base_buy_price only (latest_* NULL).
  await db
    .prepare(
      `INSERT INTO shops (uuid, name, slug, shop_type, is_event, location_label, game_version_id)
       VALUES (?, 'TestShop_MP', 'testshop-mp', 'misc', 0, 'Area18', ?)`,
    )
    .bind("mp-shop", TEST_GAME_VERSION_ID)
    .run();
  const shop = await db.prepare("SELECT id FROM shops WHERE uuid = 'mp-shop'").first<{ id: number }>();
  await db
    .prepare(
      `INSERT INTO terminals (uuid, shop_id, shop_name_key, terminal_type, game_version_id)
       VALUES (?, ?, 'SCShop_TestShop_MP', 'item', ?)`,
    )
    .bind("mp-term", shop!.id, TEST_GAME_VERSION_ID)
    .run();
  const term = await db.prepare("SELECT id FROM terminals WHERE uuid = 'mp-term'").first<{ id: number }>();
  await db
    .prepare(
      `INSERT INTO terminal_inventory (terminal_id, item_uuid, item_name, base_buy_price, game_version_id)
       VALUES (?, 'lm-cargo-mod', 'Test Cargo Module - Front', 18500, ?)`,
    )
    .bind(term!.id, TEST_GAME_VERSION_ID)
    .run();
}

describe("Module read API — UEX price per module", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    await seedModules(env.DB);
  });

  it("returns the effective buy price for a UEX-linked module", async () => {
    const res = await SELF.fetch(`http://localhost/api/loadout/${SLUG}/modules`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ display_name: string; price: number | null; is_default: number }>;
    const cargo = body.find((m) => m.display_name === "Test Cargo Module - Front");
    expect(cargo).toBeDefined();
    expect(cargo!.price).toBe(18500);
  });

  it("returns null price for a base module with no UEX item (not 0)", async () => {
    const res = await SELF.fetch(`http://localhost/api/loadout/${SLUG}/modules`);
    const body = (await res.json()) as Array<{ display_name: string; price: number | null }>;
    const base = body.find((m) => m.display_name === "Test Base Module - Front");
    expect(base).toBeDefined();
    expect(base!.price).toBeNull();
  });
});
