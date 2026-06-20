import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase, TEST_GAME_VERSION_ID } from "./apply-migrations";
import { seedVehicle } from "./helpers";

// Reproduces the two loadout-page bugs from real prod data:
//  ② ship components render as "Loot Only" because the shop join read latest_*
//     (UEX) only — but UEX doesn't list ship components; their price lives in
//     base_buy_price. The picker must fall back to the base price.
//  ① dev/test artifacts named "<= PLACEHOLDER =>" (miscategorised as WeaponGun)
//     leak into the weapon picker and must be filtered out.

const SLUG = "shop-price-ship";
let weaponPortId: number;

async function seedLoadout(db: D1Database) {
  const vehicleId = await seedVehicle(db, { slug: SLUG, name: "Shop Price Ship" });

  // A weapon hardpoint (size 1-5, nothing equipped → resolves to a WeaponGun port).
  await db
    .prepare(
      `INSERT INTO vehicle_ports (uuid, vehicle_id, name, port_type, min_size, max_size, game_version_id)
       VALUES (?, ?, ?, 'weapon', 1, 5, ?)`,
    )
    .bind("spp-port", vehicleId, "hardpoint_weapon_1", TEST_GAME_VERSION_ID)
    .run();
  const port = await db.prepare("SELECT id FROM vehicle_ports WHERE uuid = 'spp-port'").first<{ id: number }>();
  weaponPortId = port!.id;

  // A real size-3 gun + a placeholder artifact, both type WeaponGun size 3.
  await db.batch([
    db
      .prepare(
        `INSERT INTO vehicle_components (uuid, name, slug, class_name, type, size, grade, game_version_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'WeaponGun', 3, 1, ?, datetime('now'), datetime('now'))`,
      )
      .bind("spp-gun-real", "Test Omnisky IX", "test-omnisky-ix", "test_omnisky_s3", TEST_GAME_VERSION_ID),
    db
      .prepare(
        `INSERT INTO vehicle_components (uuid, name, slug, class_name, type, size, grade, game_version_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'WeaponGun', 3, 1, ?, datetime('now'), datetime('now'))`,
      )
      .bind("spp-gun-ph", "<= PLACEHOLDER =>", "spp-gun-ph", "test_placeholder_s3", TEST_GAME_VERSION_ID),
  ]);

  // loot_map row for the real gun (class_name links the component; uuid links the terminal).
  await db
    .prepare(
      `INSERT INTO loot_map (uuid, name, class_name, type, category, game_version_id, updated_at)
       VALUES (?, ?, ?, 'WeaponGun', 'weapon', ?, datetime('now'))`,
    )
    .bind("lm-omnisky", "Test Omnisky IX", "test_omnisky_s3", TEST_GAME_VERSION_ID)
    .run();

  // Shop + terminal + an inventory row priced ONLY via base_buy_price — latest_*
  // and latest_source are NULL, exactly as on prod after a data extraction.
  await db
    .prepare(
      `INSERT INTO shops (uuid, name, slug, shop_type, is_event, location_label, game_version_id)
       VALUES (?, ?, ?, 'weapons', 0, 'Area18', ?)`,
    )
    .bind("spp-shop", "CenterMass_SPP", "centermass-spp", TEST_GAME_VERSION_ID)
    .run();
  const shop = await db.prepare("SELECT id FROM shops WHERE uuid = 'spp-shop'").first<{ id: number }>();
  await db
    .prepare(
      `INSERT INTO terminals (uuid, shop_id, shop_name_key, terminal_type, game_version_id)
       VALUES (?, ?, ?, 'item', ?)`,
    )
    .bind("spp-term", shop!.id, "SCShop_CenterMass_SPP", TEST_GAME_VERSION_ID)
    .run();
  const term = await db.prepare("SELECT id FROM terminals WHERE uuid = 'spp-term'").first<{ id: number }>();
  await db
    .prepare(
      `INSERT INTO terminal_inventory (terminal_id, item_uuid, item_name, base_buy_price, game_version_id)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(term!.id, "lm-omnisky", "Test Omnisky IX", 4200, TEST_GAME_VERSION_ID)
    .run();
}

describe("Loadout picker — base-price fallback + placeholder filter", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    await seedLoadout(env.DB);
  });

  it("surfaces the base price as a shop when no community (latest) price exists", async () => {
    const res = await SELF.fetch(`http://localhost/api/loadout/${SLUG}/compatible?port_id=${weaponPortId}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { components: Array<{ uuid: string; shops: Array<{ buy_price: number }> }> };
    const real = body.components.find((c) => c.uuid === "spp-gun-real");
    expect(real).toBeDefined();
    expect(real!.shops.length).toBeGreaterThan(0);
    expect(real!.shops[0].buy_price).toBe(4200);
  });

  it("excludes placeholder-named components from the picker", async () => {
    const res = await SELF.fetch(`http://localhost/api/loadout/${SLUG}/compatible?port_id=${weaponPortId}`);
    const body = (await res.json()) as { components: Array<{ uuid: string; name: string }> };
    expect(body.components.some((c) => c.name === "<= PLACEHOLDER =>")).toBe(false);
    expect(body.components.some((c) => c.uuid === "spp-gun-ph")).toBe(false);
    // sanity: the real gun is still present
    expect(body.components.some((c) => c.uuid === "spp-gun-real")).toBe(true);
  });
});
