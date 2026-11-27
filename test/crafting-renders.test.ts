import { describe, it, expect, beforeAll } from "vitest";
import { env, SELF } from "cloudflare:test";
import { setupTestDatabase, TEST_GAME_VERSION_ID } from "./apply-migrations";

// /api/gamedata/crafting and /api/gamedata/mission/:key attach the render of each
// blueprint's output item, keyed on the class name in its BP_CRAFT_ tag (plan S7,
// render-surfaces.md). A finish's render is found through its variant.
describe("crafting and mission reward blueprint renders", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    const db = env.DB;
    await db.batch([
      db.prepare(
        `INSERT INTO crafting_blueprints (uuid, tag, name, type, sub_type, craft_time_seconds)
         VALUES ('bpr-stock', 'BP_CRAFT_KSAR_Rifle_Render', 'Render Rifle', 'weapons', 'rifle', 60),
                ('bpr-finish', 'BP_CRAFT_ksar_rifle_render_tint01', 'Render Rifle Tint', 'weapons', 'rifle', 60),
                ('bpr-none', 'BP_CRAFT_no_render_thing', 'No Render Thing', 'armour', 'combat', 60)`,
      ),
      db.prepare(
        `INSERT INTO item_renders (kind, item_key, variant, view, hash, width, height, source_version)
         VALUES ('fps_weapon', 'ksar_rifle_render', '', 'iso', 'aaaa000011112222', 2048, 1400, '4.10.3-live'),
                ('fps_weapon', 'ksar_rifle_render', 'ksar_rifle_render_tint01', 'iso', 'bbbb000011112222', 2048, 1400, '4.10.3-live')`,
      ),
      db.prepare(
        `INSERT INTO crafting_blueprint_reward_pools (key, name) VALUES ('bpr_pool', 'BPR_POOL')`,
      ),
      db.prepare(
        `INSERT INTO contract_generators (generator_key, display_name, faction_name, guild, mission_type, game_version_id)
         VALUES ('render_recover', 'Render Faction', 'Render Faction', 'mercenary_guild', 'Recovery', ?)`,
      ).bind(TEST_GAME_VERSION_ID),
    ]);
    const id = async (sql: string) => (await db.prepare(sql).first<{ id: number }>())!.id;
    const pool = await id("SELECT id FROM crafting_blueprint_reward_pools WHERE key = 'bpr_pool'");
    const gen = await id("SELECT id FROM contract_generators WHERE generator_key = 'render_recover'");
    for (const uuid of ["bpr-stock", "bpr-none"]) {
      const bp = await id(`SELECT id FROM crafting_blueprints WHERE uuid = '${uuid}'`);
      await db.prepare(
        `INSERT INTO crafting_blueprint_reward_pool_items (crafting_blueprint_reward_pool_id, crafting_blueprint_id, weight)
         VALUES (?, ?, 1)`,
      ).bind(pool, bp).run();
    }
    await db.prepare(
      `INSERT INTO contract_generator_careers (contract_generator_id, debug_name, system, game_version_id)
       VALUES (?, 'Render_Career', 'Stanton', ?)`,
    ).bind(gen, TEST_GAME_VERSION_ID).run();
    const career = await id("SELECT id FROM contract_generator_careers WHERE debug_name = 'Render_Career'");
    await db.prepare(
      `INSERT INTO contract_generator_contracts (career_id, uuid, debug_name, difficulty, template, min_standing, max_standing, game_version_id)
       VALUES (?, 'render-contract', 'Render_Easy', 'Easy', 'courier_goto', 'rank1', 'rank3', ?)`,
    ).bind(career, TEST_GAME_VERSION_ID).run();
    const contract = await id("SELECT id FROM contract_generator_contracts WHERE uuid = 'render-contract'");
    await db.prepare(
      `INSERT INTO contract_generator_blueprint_pools (contract_generator_contract_id, crafting_blueprint_reward_pool_id, chance, game_version_id)
       VALUES (?, ?, 1.0, ?)`,
    ).bind(contract, pool, TEST_GAME_VERSION_ID).run();
  });

  it("returns each blueprint's output render, its finish's render, or null", async () => {
    const res = await SELF.fetch("http://localhost/api/gamedata/crafting");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { blueprints: Array<Record<string, unknown>> };
    const bp = (uuid: string) => body.blueprints.find((b) => b.uuid === uuid)!;

    expect(bp("bpr-stock").render).toEqual({ hash: "aaaa000011112222", width: 2048, height: 1400, view: "iso" });
    expect(bp("bpr-stock").render_variants_kind).toBe("fps_weapon");
    expect(bp("bpr-stock").render_item_key).toBe("ksar_rifle_render");
    expect(bp("bpr-stock").render_variant).toBe("");
    expect(bp("bpr-stock")).not.toHaveProperty("render_hash");

    expect(bp("bpr-finish").render).toEqual({ hash: "bbbb000011112222", width: 2048, height: 1400, view: "iso" });
    expect(bp("bpr-finish").render_item_key).toBe("ksar_rifle_render");
    expect(bp("bpr-finish").render_variant).toBe("ksar_rifle_render_tint01");

    expect(bp("bpr-none").render).toBeNull();
  });

  it("returns each mission reward blueprint's output render", async () => {
    const res = await SELF.fetch("http://localhost/api/gamedata/mission/render_recover");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { all_blueprints: Array<Record<string, unknown>> };
    const byName = (list: Array<Record<string, unknown>>, name: string) => list.find((b) => b.name === name)!;

    const stock = byName(body.all_blueprints, "Render Rifle");
    expect(stock.render).toEqual({ hash: "aaaa000011112222", width: 2048, height: 1400, view: "iso" });
    expect(stock.render_variants_kind).toBe("fps_weapon");
    expect(stock.render_item_key).toBe("ksar_rifle_render");
    expect(byName(body.all_blueprints, "No Render Thing").render).toBeNull();
  });
});
