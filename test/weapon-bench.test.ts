// test/weapon-bench.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";

describe("GET /api/gamedata/weapon-bench", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    await env.DB.prepare(
      `INSERT INTO fps_attachments (uuid, name, class_name, sub_type, size, fire_rate_multiplier, damage_multiplier, game_version_id)
       VALUES ('att-stark', 'Stark Compensator 1', 'arma_barrel_comp_s1', 'barrel', 1, 0.8, NULL, 1)`
    ).run();
  });

  it("returns attachments with their stat-multiplier columns (public)", async () => {
    const res = await SELF.fetch("http://localhost/api/gamedata/weapon-bench");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { attachments: Array<Record<string, unknown>> };
    const stark = body.attachments.find((a) => a.uuid === "att-stark");
    expect(stark).toBeTruthy();
    expect(stark!.fire_rate_multiplier).toBe(0.8);
    expect(stark!.sub_type).toBe("barrel");
    // multiplier columns are present (key exists even when null)
    expect("damage_multiplier" in stark!).toBe(true);
    expect("projectile_speed_multiplier" in stark!).toBe(true);
  });

  it("crafting base_stats include loadout_icon for a weapon", async () => {
    // Seed a craftable weapon row + blueprint with a loadout_icon
    await env.DB.prepare(
      `INSERT INTO fps_weapons (uuid, class_name, name, game_version_id, loadout_icon)
       VALUES ('w-icontest', 'gmni_pistol_ballistic_01', 'LH86 Pistol', 1, 'https://imagedelivery.net/_nHFky6xiv-JbnhLN5CCrQ/gemini_lh86_pistol/public')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO crafting_blueprints (uuid, tag, name, type, sub_type, product_entity_class)
       VALUES ('bp-icontest', 'BP_CRAFT_gmni_pistol_ballistic_01', 'Gmni Pistol Ballistic 01', 'weapons', 'pistol', 'gmni_pistol_ballistic_01')`
    ).run();
    const res = await SELF.fetch("http://localhost/api/gamedata/crafting");
    const body = (await res.json()) as { blueprints: Array<{ name: string; base_stats?: { loadout_icon?: string } }> };
    const bp = body.blueprints.find((b) => b.name === "Gmni Pistol Ballistic 01");
    expect(bp?.base_stats?.loadout_icon).toContain("gemini_lh86_pistol");
  });

  it("exposes weapon attachment_ports + attachment port fields (compat data)", async () => {
    await env.DB.prepare(
      `INSERT INTO fps_weapons (uuid, class_name, name, game_version_id)
       VALUES ('w-compat', 'gmni_pistol_compat_01', 'Compat Pistol', 1)`
    ).run();
    const wid = (await env.DB.prepare(
      "SELECT id FROM fps_weapons WHERE class_name='gmni_pistol_compat_01'"
    ).first<{ id: number }>())!.id;
    await env.DB.prepare(
      `INSERT INTO crafting_blueprints (uuid, tag, name, type, sub_type, product_entity_class)
       VALUES ('bp-compat', 'BP_CRAFT_gmni_pistol_compat_01', 'Compat Pistol BP', 'weapons', 'pistol', 'gmni_pistol_compat_01')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO fps_weapon_attachment_ports (weapon_id, port_name, port_type, size_min, size_max, required_port_tags, game_version_id)
       VALUES (?, 'barrel_attach', 'Barrel', 1, 2, 'ballistic_attach', 1)`
    ).bind(wid).run();
    await env.DB.prepare(
      `INSERT INTO fps_attachments (uuid, name, class_name, sub_type, size, attach_tags, game_version_id)
       VALUES ('att-compat', 'Compat Barrel', 'arma_barrel_compat', 'Barrel', 1, 'FPS_Barrel ballistic_attach', 1)`
    ).run();

    const craft = await SELF.fetch("http://localhost/api/gamedata/crafting");
    const cbody = (await craft.json()) as { blueprints: Array<{ name: string; base_stats?: { attachment_ports?: Array<Record<string, unknown>> } }> };
    const bp = cbody.blueprints.find((b) => b.name === "Compat Pistol BP");
    expect(bp?.base_stats?.attachment_ports).toEqual([
      { port_type: "Barrel", size_min: 1, size_max: 2, required_port_tags: "ballistic_attach" },
    ]);

    const bench = await SELF.fetch("http://localhost/api/gamedata/weapon-bench");
    const bbody = (await bench.json()) as { attachments: Array<Record<string, unknown>> };
    const att = bbody.attachments.find((a) => a.uuid === "att-compat");
    expect(att?.attach_port_type).toBe("Barrel");
    expect(att?.attach_size).toBe(1);
    expect(att?.attach_tags).toContain("ballistic_attach");
  });

  it("exposes recoil, sound-radius, and zoom columns (attachment stat effects)", async () => {
    await env.DB.prepare(
      `INSERT INTO fps_attachments (uuid, name, class_name, sub_type, size, game_version_id,
                                    recoil_strength, recoil_decay, recoil_randomness,
                                    sound_radius_multiplier, zoom_scale, second_zoom_scale)
       VALUES ('att-sion', 'Sion Compensator 1', 'arma_comp_sion', 'Barrel', 1, 1, 0.7, 0.7, 0.7, 1.2, NULL, NULL),
              ('att-farsight', 'FarSight (8x Telescopic)', 'optics_farsight', 'IronSight', 3, 1, NULL, NULL, NULL, NULL, 4, 8)`
    ).run();
    const res = await SELF.fetch("http://localhost/api/gamedata/weapon-bench");
    const body = (await res.json()) as { attachments: Array<Record<string, unknown>> };
    const sion = body.attachments.find((a) => a.uuid === "att-sion");
    expect(sion?.recoil_strength).toBe(0.7);
    expect(sion?.recoil_decay).toBe(0.7);
    expect(sion?.recoil_randomness).toBe(0.7);
    expect(sion?.sound_radius_multiplier).toBe(1.2);
    const farsight = body.attachments.find((a) => a.uuid === "att-farsight");
    expect(farsight?.zoom_scale).toBe(4);
    expect(farsight?.second_zoom_scale).toBe(8);
  });

  it("excludes fake-optic props (binoculars extracted as size-1 16x scopes)", async () => {
    await env.DB.prepare(
      `INSERT INTO fps_attachments (uuid, name, class_name, sub_type, size, game_version_id)
       VALUES ('att-fake', 'EE16 (16x Telescopic)', 'behr_binoculars_01_fakeoptic', 'IronSight', 1, 1)`
    ).run();
    const res = await SELF.fetch("http://localhost/api/gamedata/weapon-bench");
    const body = (await res.json()) as { attachments: Array<Record<string, unknown>> };
    expect(body.attachments.find((a) => a.uuid === "att-fake")).toBeUndefined();
  });
});

describe("GET /api/gamedata/utility-items", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    const rows = [
      ["u-medgun", "ParaMed Medical Device", "weapon", "Small"],
      ["u-pistol", "LH86 Pistol", "weapon", "Small"], // Small but NOT a medical device → excluded
      ["u-pen", "MedPen (Hemozal)", "consumable", "MedPack"],
      ["u-multitool", "Pyro RYT Multi-Tool", "weapon", "Gadget"],
      ["u-frag", "MK-4 Frag Grenade", "weapon", "Grenade"],
      ["u-cutter", "OxyTorch Cutter Attachment", "attachment", "Utility"],
      ["u-armour", "Some Armour", "armour", "Light"], // unrelated type → excluded
    ];
    for (const [uuid, name, type, subType] of rows) {
      await env.DB.prepare(
        `INSERT INTO loot_map (uuid, name, type, sub_type, game_version_id) VALUES (?, ?, ?, ?, 1)`
      ).bind(uuid, name, type, subType).run();
    }
  });

  it("returns utility-slot items tagged with the paperdoll slot they equip into", async () => {
    const res = await SELF.fetch("http://localhost/api/gamedata/utility-items");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ uuid: string; util_slot: string | null }> };
    const byUuid = Object.fromEntries(body.items.map((i) => [i.uuid, i.util_slot]));
    expect(byUuid["u-medgun"]).toBe("medical");
    expect(byUuid["u-pen"]).toBe("medical");
    expect(byUuid["u-multitool"]).toBe("gadget");
    expect(byUuid["u-frag"]).toBe("throwable");
    expect(byUuid["u-cutter"]).toBeNull(); // tool attachment: listed, not slot-equippable
    expect("u-pistol" in byUuid).toBe(false);
    expect("u-armour" in byUuid).toBe(false);
  });
});
