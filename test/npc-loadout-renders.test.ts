import { describe, it, expect, beforeAll } from "vitest";
import { env, SELF } from "cloudflare:test";
import { setupTestDatabase, TEST_GAME_VERSION_ID } from "./apply-migrations";

// /api/gamedata/npc-loadouts/:faction attaches each item's render through its
// loot_map row (plan S5, render-surfaces.md). Hidden items stay hidden.
describe("GET /api/gamedata/npc-loadouts/:faction renders", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    await env.DB.prepare("INSERT INTO npc_factions (code, name) VALUES ('rendertest', 'Render Test')").run();
    const faction = await env.DB.prepare("SELECT id FROM npc_factions WHERE code = 'rendertest'").first<{ id: number }>();
    await env.DB.prepare(
      `INSERT INTO npc_loadouts (file_path, loadout_name, faction_id, category, visible_item_count, game_version_id)
       VALUES ('npc/render.xml', 'Render Grunt', ?, 'combat', 2, ?)`,
    ).bind(faction!.id, TEST_GAME_VERSION_ID).run();
    const loadout = await env.DB.prepare("SELECT id FROM npc_loadouts WHERE file_path = 'npc/render.xml'").first<{ id: number }>();

    const item = (port: string, name: string, uuid: string | null, hidden: number) =>
      env.DB.prepare(
        `INSERT INTO npc_loadout_items (loadout_id, port_name, item_name, loot_map_uuid, is_hidden, game_version_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(loadout!.id, port, name, uuid, hidden, TEST_GAME_VERSION_ID);

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO loot_map (uuid, name, class_name, type, category, game_version_id)
         VALUES ('npc-helm', 'Render Helmet', 'CDS_Helmet_Render', 'Armor', 'helmet', ?),
                ('npc-hidden', 'Hidden Thing', 'Hidden_Render', 'Armor', 'armour', ?)`,
      ).bind(TEST_GAME_VERSION_ID, TEST_GAME_VERSION_ID),
      env.DB.prepare(
        `INSERT INTO item_renders (kind, item_key, variant, view, hash, width, height, source_version)
         VALUES ('fps_armour', 'cds_helmet_render', '', 'iso', 'dddd000011112222', 1024, 1024, '4.10.3-live'),
                ('fps_armour', 'hidden_render', '', 'iso', 'eeee000011112222', 1024, 1024, '4.10.3-live')`,
      ),
      item("helmet", "cds_helmet_render", "npc-helm", 0),
      item("backpack", "unlinked_backpack", null, 0),
      item("body", "hidden_render", "npc-hidden", 1),
    ]);
  });

  it("returns render, kind and key for a linked item, null for an unlinked one, and keeps hidden items out", async () => {
    const res = await SELF.fetch("http://localhost/api/gamedata/npc-loadouts/rendertest");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { loadouts: Array<{ items: Array<Record<string, unknown>> }> };
    const items = body.loadouts[0].items;
    expect(items).toHaveLength(2);

    const helmet = items.find((i) => i.port_name === "helmet")!;
    expect(helmet.render).toEqual({ hash: "dddd000011112222", width: 1024, height: 1024, view: "iso" });
    expect(helmet.render_variants_kind).toBe("fps_armour");
    expect(helmet.render_item_key).toBe("cds_helmet_render");
    expect(helmet.render_variant).toBe("");
    expect(helmet).not.toHaveProperty("render_hash");

    expect(items.find((i) => i.port_name === "backpack")!.render).toBeNull();
  });
});
