import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders } from "./helpers";

/**
 * Friendly product-name resolution for the blueprint list.
 *
 * crafting_blueprints.name is machine-derived from the class name for ~99% of
 * rows ("Hdtc Jacket 01 01 01"), so the list resolves a real name by joining
 * output_item to the item tables. Clothing and carryables were missing from
 * that join, so real 4.9 blueprints (Bellator Jacket, TH-01 Propulsor, ...)
 * fell back to the machine name.
 */
describe("GET /api/blueprints — item_name resolution", () => {
  let sessionToken: string;

  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    const user = await createTestUser(env.DB);
    sessionToken = user.sessionToken;

    let gv = await env.DB.prepare("SELECT id FROM game_versions LIMIT 1").first<{ id: number }>();
    if (!gv) {
      await env.DB.prepare(
        "INSERT INTO game_versions (uuid, code, channel, is_default) VALUES ('t-gv','test-live','LIVE',1)",
      ).run();
      gv = await env.DB.prepare("SELECT id FROM game_versions LIMIT 1").first<{ id: number }>();
    }
    const gvId = gv!.id;

    const seedBp = async (uuid: string, outputItem: string) => {
      await env.DB.prepare(
        `INSERT INTO crafting_blueprints (uuid, tag, name, type, sub_type, craft_time_seconds, output_item)
         VALUES (?, ?, ?, 'x', 'y', 60, ?)`,
      ).bind(uuid, `BP_${uuid}`, "Machine Derived Name", outputItem).run();
      await env.DB.prepare(
        `INSERT INTO user_blueprints (user_id, blueprint_uuid, crafting_blueprint_id, is_owned)
         SELECT ?, ?, id, 1 FROM crafting_blueprints WHERE uuid = ?`,
      ).bind(user.userId, uuid, uuid).run();
    };
    const seedItem = async (table: string, cls: string, name: string) => {
      await env.DB.prepare(
        `INSERT INTO ${table} (uuid, class_name, name, game_version_id) VALUES (?, ?, ?, ?)`,
      ).bind(`u-${cls}`, cls, name, gvId).run();
    };

    await seedBp("bp-clothing", "hdtc_jacket_01_01_01");
    await seedBp("bp-carryable", "carryable_2h_fl_missionitem_prototype_ship_component_2_a");
    await seedBp("bp-weapon", "behr_rifle_ballistic_03");

    await seedItem("fps_clothing", "hdtc_jacket_01_01_01", "Bellator Jacket");
    await seedItem("fps_carryables", "carryable_2h_fl_missionitem_prototype_ship_component_2_a", "TH-01 Propulsor");
    await seedItem("fps_weapons", "behr_rifle_ballistic_03", "CQ7 Rifle");
  });

  const names = async (): Promise<Record<string, string | null>> => {
    const res = await SELF.fetch("http://localhost/api/blueprints", {
      headers: await authHeaders(sessionToken),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<Record<string, unknown>> };
    return Object.fromEntries(
      body.items.map((i) => [i.blueprint_uuid as string, (i.item_name as string) ?? null]),
    );
  };

  it("resolves a clothing blueprint to its real item name", async () => {
    expect((await names())["bp-clothing"]).toBe("Bellator Jacket");
  });

  it("resolves a carryable blueprint to its real item name", async () => {
    expect((await names())["bp-carryable"]).toBe("TH-01 Propulsor");
  });

  it("still resolves weapons — existing join must not regress", async () => {
    expect((await names())["bp-weapon"]).toBe("CQ7 Rifle");
  });
});
