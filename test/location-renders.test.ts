import { describe, it, expect, beforeAll } from "vitest";
import { env, SELF } from "cloudflare:test";
import { setupTestDatabase, TEST_GAME_VERSION_ID } from "./apply-migrations";

// Location and POI item lists attach each item's render (plan S6, render-surfaces.md).
const RIFLE = { hash: "1111aaaa2222bbbb", width: 2048, height: 1400, view: "iso" };

describe("location and POI item renders", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO star_map_locations (uuid, name, slug, location_type, parent_uuid, game_version_id)
         VALUES ('sml-rcrash', 'Render Crash', 'rendercrash-parent', 'unknown', NULL, ?)`,
      ).bind(TEST_GAME_VERSION_ID),
      env.DB.prepare(
        `INSERT INTO loot_map (uuid, name, class_name, type, category, game_version_id)
         VALUES ('loc-rifle', 'Render Rifle', 'KSAR_Rifle_Loc', 'WeaponPersonal', 'weapon', ?),
                ('loc-plain', 'Plain Pen', 'medpen_loc', 'Consumable', 'consumable', ?)`,
      ).bind(TEST_GAME_VERSION_ID, TEST_GAME_VERSION_ID),
      env.DB.prepare(
        `INSERT INTO item_renders (kind, item_key, variant, view, hash, width, height, source_version)
         VALUES ('fps_weapon', 'ksar_rifle_loc', '', 'iso', '1111aaaa2222bbbb', 2048, 1400, '4.10.3-live')`,
      ),
      env.DB.prepare(
        `INSERT INTO shops (uuid, name, slug, shop_type, is_event, location_label, game_version_id)
         VALUES ('loc-shop', 'Render Guns', 'render-guns', 'weapons', 0, 'Area18', ?)`,
      ).bind(TEST_GAME_VERSION_ID),
    ]);

    const rifle = await env.DB.prepare("SELECT id FROM loot_map WHERE uuid = 'loc-rifle'").first<{ id: number }>();
    const pen = await env.DB.prepare("SELECT id FROM loot_map WHERE uuid = 'loc-plain'").first<{ id: number }>();
    const shop = await env.DB.prepare("SELECT id FROM shops WHERE uuid = 'loc-shop'").first<{ id: number }>();
    const lil = (id: number) =>
      env.DB.prepare(
        `INSERT INTO loot_item_locations (loot_map_id, game_version_id, source_type, location_key, container_type, per_roll, rolls, loot_table, location_label, data_source)
         VALUES (?, ?, 'container', 'RenderCrash', 'Crate_Small', 0.05, 3, 'LootTable.Render', 'Zone A', 'p4k')`,
      ).bind(id, TEST_GAME_VERSION_ID);
    await env.DB.batch([
      lil(rifle!.id),
      lil(pen!.id),
      env.DB.prepare(
        `INSERT INTO terminals (uuid, shop_id, shop_name_key, terminal_type, game_version_id)
         VALUES ('loc-term', ?, 'SCShop_Render_Guns', 'item', ?)`,
      ).bind(shop!.id, TEST_GAME_VERSION_ID),
    ]);
    const term = await env.DB.prepare("SELECT id FROM terminals WHERE uuid = 'loc-term'").first<{ id: number }>();
    await env.DB.prepare(
      `INSERT INTO terminal_inventory (terminal_id, item_uuid, item_name, latest_buy_price, latest_source, latest_observed_at, game_version_id)
       VALUES (?, 'loc-rifle', 'Render Rifle', 5000, 'uex', datetime('now'), ?)`,
    ).bind(term!.id, TEST_GAME_VERSION_ID).run();
  });

  it("returns render, kind and key for each item in a container location's detail", async () => {
    const res = await SELF.fetch("http://localhost/api/loot/locations/container/RenderCrash");
    expect(res.status).toBe(200);
    const { items } = (await res.json()) as { items: Array<Record<string, unknown>> };
    const rifle = items.find((i) => i.uuid === "loc-rifle")!;
    expect(rifle.render).toEqual(RIFLE);
    expect(rifle.render_variants_kind).toBe("fps_weapon");
    expect(rifle.render_item_key).toBe("ksar_rifle_loc");
    expect(rifle.render_variant).toBe("");
    expect(rifle).not.toHaveProperty("render_hash");
    expect(items.find((i) => i.uuid === "loc-plain")!.render).toBeNull();
  });

  it("returns render for each item in a shop location's detail", async () => {
    const res = await SELF.fetch("http://localhost/api/loot/locations/shop/render-guns");
    expect(res.status).toBe(200);
    const { items } = (await res.json()) as { items: Array<Record<string, unknown>> };
    const rifle = items.find((i) => i.uuid === "loc-rifle")!;
    expect(rifle.render).toEqual(RIFLE);
    expect(rifle.render_item_key).toBe("ksar_rifle_loc");
  });

  it("returns render for each item in a POI loot pool", async () => {
    const res = await SELF.fetch("http://localhost/api/gamedata/poi/RenderCrash");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { loot_pools: { data: Array<{ items: Array<Record<string, unknown>> }> } };
    const items = body.loot_pools.data[0].items;
    const rifle = items.find((i) => i.uuid === "loc-rifle")!;
    expect(rifle.render).toEqual(RIFLE);
    expect(rifle.render_variants_kind).toBe("fps_weapon");
    expect(rifle.render_item_key).toBe("ksar_rifle_loc");
    expect(items.find((i) => i.uuid === "loc-plain")!.render).toBeNull();
  });
});
