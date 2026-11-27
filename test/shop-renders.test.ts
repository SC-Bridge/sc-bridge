import { describe, it, expect, beforeAll } from "vitest";
import { env, SELF } from "cloudflare:test";
import { setupTestDatabase, TEST_GAME_VERSION_ID } from "./apply-migrations";

// /api/gamedata/shops/:slug/inventory attaches each row's render (plan S4, render-surfaces.md):
// a loot item (stock or finish) through lootRenderJoin, a vehicle through renderJoin.
describe("GET /api/gamedata/shops/:slug/inventory renders", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    await env.DB.prepare(
      `INSERT INTO shops (uuid, name, slug, shop_type, is_event, location_label, game_version_id)
       VALUES ('rs-shop', 'Render_Shop', 'render-shop', 'weapons', 0, 'Area18', ?)`,
    ).bind(TEST_GAME_VERSION_ID).run();
    const shop = await env.DB.prepare("SELECT id FROM shops WHERE uuid = 'rs-shop'").first<{ id: number }>();
    await env.DB.prepare(
      `INSERT INTO terminals (uuid, shop_id, shop_name_key, terminal_type, game_version_id)
       VALUES ('rs-term', ?, 'SCShop_Render_Shop', 'item', ?)`,
    ).bind(shop!.id, TEST_GAME_VERSION_ID).run();
    const term = await env.DB.prepare("SELECT id FROM terminals WHERE uuid = 'rs-term'").first<{ id: number }>();

    const inv = (uuid: string, name: string) =>
      env.DB.prepare(
        `INSERT INTO terminal_inventory (terminal_id, item_uuid, item_name, latest_buy_price, latest_source, latest_observed_at, game_version_id)
         VALUES (?, ?, ?, 1000, 'uex', datetime('now'), ?)`,
      ).bind(term!.id, uuid, name, TEST_GAME_VERSION_ID);

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO loot_map (uuid, name, class_name, type, category, game_version_id)
         VALUES ('rs-rifle', 'Render Rifle', 'KSAR_Rifle_Test', 'WeaponPersonal', 'weapon', ?),
                ('rs-rifle-red', 'Render Rifle Red', 'KSAR_Rifle_Test_Red', 'WeaponPersonal', 'weapon', ?)`,
      ).bind(TEST_GAME_VERSION_ID, TEST_GAME_VERSION_ID),
      env.DB.prepare(
        `INSERT INTO vehicles (uuid, name, slug, class_name, game_version_id)
         VALUES ('rs-ship', 'Render Ship', 'render-ship', 'TEST_Render_Ship', ?)`,
      ).bind(TEST_GAME_VERSION_ID),
      env.DB.prepare(
        `INSERT INTO item_renders (kind, item_key, variant, view, hash, width, height, source_version)
         VALUES ('fps_weapon', 'ksar_rifle_test', '', 'iso', 'aaaa000011112222', 2048, 1400, '4.10.3-live'),
                ('fps_weapon', 'ksar_rifle_test', 'ksar_rifle_test_red', 'iso', 'bbbb000011112222', 2048, 1400, '4.10.3-live'),
                ('vehicle', 'test_render_ship', '', 'side', 'cccc000011112222', 2048, 800, '4.10.3-live')`,
      ),
      inv("rs-rifle", "Render Rifle"),
      inv("rs-rifle-red", "Render Rifle Red"),
      inv("rs-ship", "Render Ship"),
      inv("rs-unknown", "Mystery Crate"),
    ]);
  });

  it("returns render, kind, key and variant for loot items and vehicles, and null for an unknown uuid", async () => {
    const res = await SELF.fetch("http://localhost/api/gamedata/shops/render-shop/inventory");
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    const by = (uuid: string) => rows.find((r) => r.item_uuid === uuid)!;

    const rifle = by("rs-rifle");
    expect(rifle.render).toEqual({ hash: "aaaa000011112222", width: 2048, height: 1400, view: "iso" });
    expect(rifle.render_variants_kind).toBe("fps_weapon");
    expect(rifle.render_item_key).toBe("ksar_rifle_test");
    expect(rifle.render_variant).toBe("");
    expect(rifle).not.toHaveProperty("render_hash");

    // A finish opens its base weapon with the finish selected.
    const red = by("rs-rifle-red");
    expect(red.render).toEqual({ hash: "bbbb000011112222", width: 2048, height: 1400, view: "iso" });
    expect(red.render_item_key).toBe("ksar_rifle_test");
    expect(red.render_variant).toBe("ksar_rifle_test_red");

    const ship = by("rs-ship");
    expect(ship.render).toEqual({ hash: "cccc000011112222", width: 2048, height: 800, view: "side" });
    expect(ship.render_variants_kind).toBe("vehicle");
    expect(ship.render_item_key).toBe("test_render_ship");

    expect(by("rs-unknown").render).toBeNull();
  });
});
