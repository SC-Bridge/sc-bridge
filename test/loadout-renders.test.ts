import { describe, it, expect, beforeAll } from "vitest";
import { env, SELF } from "cloudflare:test";
import { setupTestDatabase, TEST_GAME_VERSION_ID } from "./apply-migrations";
import { seedVehicle, createTestUser, authHeaders, seedFleetEntry } from "./helpers";

// The ship loadout and the compatible-components picker attach each component's
// render (plan S3, render-surfaces.md).
describe("ship loadout renders", () => {
  let renderedPortId: number;
  let fleetId: number;
  let sessionToken: string;

  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    const vid = await seedVehicle(env.DB, { slug: "rendertest-ship", name: "Render Test Ship" });

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO vehicle_components (uuid, name, slug, class_name, type, size, grade, game_version_id)
         VALUES ('ldr-pp-r', 'Rendered Plant', 'ldr-pp-r', 'POWR_TEST_S2_Rendered', 'PowerPlant', 2, 'A', ?),
                ('ldr-pp-n', 'Plain Plant', 'ldr-pp-n', 'powr_test_s2_plain', 'PowerPlant', 2, 'B', ?)`,
      ).bind(TEST_GAME_VERSION_ID, TEST_GAME_VERSION_ID),
      env.DB.prepare(
        `INSERT INTO vehicle_ports (uuid, vehicle_id, name, category_label, size_min, size_max, min_size, max_size, port_type, equipped_item_uuid, editable, game_version_id)
         VALUES ('ldr-port-r', ?, 'hardpoint_power_1', 'Power', 2, 2, 2, 2, 'power', 'ldr-pp-r', 1, ?),
                ('ldr-port-n', ?, 'hardpoint_power_2', 'Power', 2, 2, 2, 2, 'power', 'ldr-pp-n', 1, ?)`,
      ).bind(vid, TEST_GAME_VERSION_ID, vid, TEST_GAME_VERSION_ID),
      env.DB.prepare(
        `INSERT INTO item_renders (kind, item_key, variant, view, hash, width, height, source_version)
         VALUES ('vehicle_component', 'powr_test_s2_rendered', '', 'iso', 'eeeeffff00001111', 2048, 1400, '4.10.3-live')`,
      ),
    ]);
    const port = await env.DB.prepare("SELECT id FROM vehicle_ports WHERE uuid = 'ldr-port-r'").first<{ id: number }>();
    renderedPortId = port!.id;

    // A saved swap: the plain plant's port now holds the rendered plant.
    const user = await createTestUser(env.DB);
    sessionToken = user.sessionToken;
    fleetId = await seedFleetEntry(env.DB, user.userId, vid);
    const plainPort = await env.DB.prepare("SELECT id FROM vehicle_ports WHERE uuid = 'ldr-port-n'").first<{ id: number }>();
    const renderedComp = await env.DB.prepare("SELECT id FROM vehicle_components WHERE uuid = 'ldr-pp-r'").first<{ id: number }>();
    await env.DB.prepare(
      `INSERT INTO user_fleet_loadout (user_id, user_fleet_id, port_id, component_id, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
    ).bind(user.userId, fleetId, plainPort!.id, renderedComp!.id).run();

    // Gadgets: a mining head whose module links to a loot item, and a salvage head.
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO vehicle_components (uuid, name, type, size, game_version_id)
                      VALUES ('ldr-head-mine', 'Render Mining Laser', 'WeaponMining', 1, ?),
                             ('ldr-head-salv', 'Render Salvage Head', 'SalvageHead', 1, ?)`).bind(TEST_GAME_VERSION_ID, TEST_GAME_VERSION_ID),
      env.DB.prepare(`INSERT INTO vehicle_components (uuid, name, class_name, type, sub_type, size, game_version_id)
                      VALUES ('ldr-salv', 'Render Scraper Module', 'SALV_Test_Render', 'SalvageModifier', 'UNDEFINED', 1, ?)`).bind(TEST_GAME_VERSION_ID),
      env.DB.prepare(`INSERT INTO mining_modules (name, type, size, game_version_id, data_source)
                      VALUES ('Render Module', 'active', 1, ?, 'p4k')`).bind(TEST_GAME_VERSION_ID),
      env.DB.prepare(`INSERT INTO loot_map (uuid, name, class_name, type, category, game_version_id)
                      VALUES ('lm-ldr-mod', 'Render Module', 'MMOD_Test_Render', 'ship_component', 'ship_component', ?)`).bind(TEST_GAME_VERSION_ID),
      env.DB.prepare(`INSERT INTO item_renders (kind, item_key, variant, view, hash, width, height, source_version)
                      VALUES ('vehicle_component', 'mmod_test_render', '', 'iso', '2222333344445555', 1024, 1024, '4.10.3-live'),
                             ('vehicle_component', 'salv_test_render', '', 'iso', '6666777788889999', 1024, 1024, '4.10.3-live')`),
    ]);
    const mineHead = await env.DB.prepare("SELECT id FROM vehicle_components WHERE uuid = 'ldr-head-mine'").first<{ id: number }>();
    const salvHead = await env.DB.prepare("SELECT id FROM vehicle_components WHERE uuid = 'ldr-head-salv'").first<{ id: number }>();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO component_module_slots (component_id, slot_index, slot_name, min_size, max_size, accepts_tag, port_tags, game_version_id, data_source)
                      VALUES (?, 0, 'BONE_ItemPort_Consumable_1', 1, 1, 'miningConsumable', 'miningConsumable Consumable1', ?, 'p4k:head_slots')`).bind(mineHead!.id, TEST_GAME_VERSION_ID),
      env.DB.prepare(`INSERT INTO component_module_slots (component_id, slot_index, slot_name, min_size, max_size, accepts_tag, port_tags, game_version_id, data_source)
                      VALUES (?, 0, 'hardpoint_salvage_subItem01', 1, 1, 'salvageMount', 'salvageMount', ?, 'p4k:head_slots')`).bind(salvHead!.id, TEST_GAME_VERSION_ID),
    ]);
  });

  it("returns a mining gadget's render through its loot item", async () => {
    const res = await SELF.fetch("http://localhost/api/loadout/head/ldr-head-mine/gadgets");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { slots: Array<{ compatible: Array<Record<string, unknown>> }> };
    const gadget = body.slots[0].compatible.find((g) => g.name === "Render Module")!;
    expect(gadget.uuid).toBe("lm-ldr-mod");
    expect(gadget.render).toEqual({ hash: "2222333344445555", width: 1024, height: 1024, view: "iso" });
    expect(gadget.render_variants_kind).toBe("vehicle_component");
    expect(gadget.render_item_key).toBe("mmod_test_render");
    expect(gadget).not.toHaveProperty("render_hash");
  });

  it("returns a salvage gadget's render", async () => {
    const res = await SELF.fetch("http://localhost/api/loadout/head/ldr-head-salv/gadgets");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { slots: Array<{ compatible: Array<Record<string, unknown>> }> };
    const gadget = body.slots[0].compatible.find((g) => g.uuid === "ldr-salv")!;
    expect(gadget.render).toEqual({ hash: "6666777788889999", width: 1024, height: 1024, view: "iso" });
    expect(gadget.render_item_key).toBe("salv_test_render");
  });

  it("returns the swapped-in component's render on a saved override", async () => {
    const res = await SELF.fetch(`http://localhost/api/loadout/fleet/${fleetId}`, {
      headers: await authHeaders(sessionToken),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { overrides: Array<Record<string, unknown>> };
    const ov = body.overrides.find((o) => o.component_uuid === "ldr-pp-r")!;

    expect(ov.render).toEqual({ hash: "eeeeffff00001111", width: 2048, height: 1400, view: "iso" });
    expect(ov.render_variants_kind).toBe("vehicle_component");
    expect(ov.render_item_key).toBe("powr_test_s2_rendered");
    expect(ov).not.toHaveProperty("render_hash");
  });

  it("returns render, kind and key for each installed component", async () => {
    const res = await SELF.fetch("http://localhost/api/loadout/rendertest-ship/components");
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    const rendered = rows.find((r) => r.component_uuid === "ldr-pp-r")!;
    const plain = rows.find((r) => r.component_uuid === "ldr-pp-n")!;

    expect(rendered.render).toEqual({ hash: "eeeeffff00001111", width: 2048, height: 1400, view: "iso" });
    expect(rendered.render_variants_kind).toBe("vehicle_component");
    expect(rendered.render_item_key).toBe("powr_test_s2_rendered");
    expect(rendered).not.toHaveProperty("render_hash");
    expect(plain.render).toBeNull();
  });

  it("returns render, kind and key for each compatible component", async () => {
    const res = await SELF.fetch(`http://localhost/api/loadout/rendertest-ship/compatible?port_id=${renderedPortId}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { components: Array<Record<string, unknown>> };
    const rendered = body.components.find((c) => c.uuid === "ldr-pp-r")!;
    const plain = body.components.find((c) => c.uuid === "ldr-pp-n")!;

    expect(rendered.render).toEqual({ hash: "eeeeffff00001111", width: 2048, height: 1400, view: "iso" });
    expect(rendered.render_variants_kind).toBe("vehicle_component");
    expect(rendered.render_item_key).toBe("powr_test_s2_rendered");
    expect(rendered).not.toHaveProperty("render_hash");
    expect(plain.render).toBeNull();
  });
});
