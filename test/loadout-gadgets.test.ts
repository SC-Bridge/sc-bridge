import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { setupTestDatabase, TEST_GAME_VERSION_ID } from "./apply-migrations";
import { seedVehicle, createTestUser, authHeaders, seedFleetEntry } from "./helpers";

/**
 * Gadget consumable slots inside tool heads (migrations 0262/0263).
 * - GET /api/loadout/head/:uuid/gadgets returns each head's gadget slots + the
 *   gadgets compatible with each (mining → mining_modules; salvage →
 *   SalvageModifier). Specialty ATLS/ROC slots are filtered to their module.
 * - Persistence reuses user_module_selection with module_kind to keep gadget
 *   choices separate from bay modules.
 * Pricing is proven by the live staging query (FLTR-XL ₳57k, …), not re-seeded
 * here (would require terminals + shops); these tests cover structure + filter.
 */
describe("Loadout gadgets — head slots, compatibility, persistence", () => {
  let vid: number;
  let fleetId: number;
  let headId: number;
  let sessionToken: string;

  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    vid = await seedVehicle(env.DB, { slug: "gadget-prospector", name: "Gadget Prospector" });

    // Heads: a mining laser + a salvage head.
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO vehicle_components (uuid, name, type, size, game_version_id)
                      VALUES ('head-helix', 'Test Helix Mining Laser', 'WeaponMining', 1, ?)`).bind(TEST_GAME_VERSION_ID),
      env.DB.prepare(`INSERT INTO vehicle_components (uuid, name, type, size, game_version_id)
                      VALUES ('head-baler', 'Test Baler Salvage Head', 'SalvageHead', 1, ?)`).bind(TEST_GAME_VERSION_ID),
      // Salvage modifiers: a scraper (compatible) + a tractor (must be excluded).
      env.DB.prepare(`INSERT INTO vehicle_components (uuid, name, type, sub_type, size, game_version_id)
                      VALUES ('salv-trawler', 'Trawler Scraper Module', 'SalvageModifier', 'UNDEFINED', 1, ?)`).bind(TEST_GAME_VERSION_ID),
      env.DB.prepare(`INSERT INTO vehicle_components (uuid, name, type, sub_type, size, game_version_id)
                      VALUES ('salv-readygrip', 'ReadyGrip Tractor Module', 'SalvageModifier', 'SalvageModifier_TractorBeam', 1, ?)`).bind(TEST_GAME_VERSION_ID),
      // Mining modules: a generic consumable + the ATLS specialty module.
      env.DB.prepare(`INSERT INTO mining_modules (name, type, size, game_version_id, data_source)
                      VALUES ('Brandt Module', 'active', 1, ?, 'p4k')`).bind(TEST_GAME_VERSION_ID),
      env.DB.prepare(`INSERT INTO mining_modules (name, type, size, game_version_id, data_source)
                      VALUES ('ATLS GEO Module', 'active', 1, ?, 'p4k')`).bind(TEST_GAME_VERSION_ID),
      // loot_map rows give the mining gadgets a purchasable uuid (linked by name).
      env.DB.prepare(`INSERT INTO loot_map (uuid, name, type, category, game_version_id)
                      VALUES ('lm-brandt', 'Brandt Module', 'ship_component', 'ship_component', ?)`).bind(TEST_GAME_VERSION_ID),
      env.DB.prepare(`INSERT INTO loot_map (uuid, name, type, category, game_version_id)
                      VALUES ('lm-atls', 'ATLS GEO Module', 'ship_component', 'ship_component', ?)`).bind(TEST_GAME_VERSION_ID),
    ]);

    headId = (await env.DB.prepare("SELECT id FROM vehicle_components WHERE uuid = 'head-helix'").first<{ id: number }>())!.id;
    const balerId = (await env.DB.prepare("SELECT id FROM vehicle_components WHERE uuid = 'head-baler'").first<{ id: number }>())!.id;

    await env.DB.batch([
      // Helix: slot 0 = generic consumable, slot 1 = ATLS specialty.
      env.DB.prepare(`INSERT INTO component_module_slots (component_id, slot_index, slot_name, min_size, max_size, accepts_tag, port_tags, game_version_id, data_source)
                      VALUES (?, 0, 'BONE_ItemPort_Consumable_1', 1, 1, 'miningConsumable', 'miningConsumable Consumable1', ?, 'p4k:head_slots')`).bind(headId, TEST_GAME_VERSION_ID),
      env.DB.prepare(`INSERT INTO component_module_slots (component_id, slot_index, slot_name, min_size, max_size, accepts_tag, port_tags, game_version_id, data_source)
                      VALUES (?, 1, 'Mining_Modifier_ATLS', 1, 1, 'miningConsumable', 'miningConsumable ATLSModifier', ?, 'p4k:head_slots')`).bind(headId, TEST_GAME_VERSION_ID),
      // Baler: 1 salvage mount slot.
      env.DB.prepare(`INSERT INTO component_module_slots (component_id, slot_index, slot_name, min_size, max_size, accepts_tag, port_tags, game_version_id, data_source)
                      VALUES (?, 0, 'hardpoint_salvage_subItem01', 1, 1, 'salvageMount', 'salvageMount', ?, 'p4k:head_slots')`).bind(balerId, TEST_GAME_VERSION_ID),
    ]);

    const user = await createTestUser(env.DB);
    sessionToken = user.sessionToken;
    fleetId = await seedFleetEntry(env.DB, user.userId, vid);
  });

  const auth = async () => ({ ...(await authHeaders(sessionToken)), "Content-Type": "application/json" });

  it("returns mining head slots with the generic gadget on the consumable slot only", async () => {
    const res = await SELF.fetch("http://localhost/api/loadout/head/head-helix/gadgets");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      kind: string; slots: Array<{ slot_index: number; accepts_tag: string; compatible: Array<{ name: string; uuid: string }> }>;
    };
    expect(body.kind).toBe("mining");
    expect(body.slots).toHaveLength(2);

    const generic = body.slots.find((s) => s.slot_index === 0)!;
    const names = generic.compatible.map((g) => g.name);
    expect(names).toContain("Brandt Module");
    expect(names).not.toContain("ATLS GEO Module"); // specialty excluded from generic slot
    // Mining gadget uuid resolves to the loot_map uuid (purchasable).
    expect(generic.compatible.find((g) => g.name === "Brandt Module")!.uuid).toBe("lm-brandt");
  });

  it("filters the ATLS specialty slot to the ATLS module only", async () => {
    const res = await SELF.fetch("http://localhost/api/loadout/head/head-helix/gadgets");
    const body = (await res.json()) as { slots: Array<{ slot_index: number; compatible: Array<{ name: string }> }> };
    const atls = body.slots.find((s) => s.slot_index === 1)!;
    expect(atls.compatible.map((g) => g.name)).toEqual(["ATLS GEO Module"]);
  });

  it("returns salvage head slot with scraper modules, excluding tractor modules", async () => {
    const res = await SELF.fetch("http://localhost/api/loadout/head/head-baler/gadgets");
    const body = (await res.json()) as { kind: string; slots: Array<{ compatible: Array<{ name: string; uuid: string }> }> };
    expect(body.kind).toBe("salvage");
    const names = body.slots[0].compatible.map((g) => g.name);
    expect(names).toContain("Trawler Scraper Module");
    expect(names).not.toContain("ReadyGrip Tractor Module");
  });

  it("returns empty slots for a head with no gadget slots", async () => {
    const res = await SELF.fetch("http://localhost/api/loadout/head/salv-trawler/gadgets");
    const body = (await res.json()) as { slots: unknown[]; kind: string | null };
    expect(body.slots).toHaveLength(0);
    expect(body.kind).toBeNull();
  });

  it("PUT then GET round-trips a gadget selection (separate from bay modules)", async () => {
    const slotKey = "weapon_port_1#0";
    const put = await SELF.fetch(`http://localhost/api/loadout/fleet/${fleetId}/gadgets`, {
      method: "PUT", headers: await auth(),
      body: JSON.stringify({ selections: [{ port_name: slotKey, module_uuid: "lm-brandt", module_kind: "mining_gadget" }] }),
    });
    expect(put.status).toBe(200);

    const get = await SELF.fetch(`http://localhost/api/loadout/fleet/${fleetId}/gadgets`, { headers: await authHeaders(sessionToken) });
    const body = (await get.json()) as { selections: Array<{ port_name: string; module_uuid: string; module_kind: string }> };
    expect(body.selections).toEqual([{ port_name: slotKey, module_uuid: "lm-brandt", module_kind: "mining_gadget" }]);

    // Bay-module endpoint must not see the gadget row.
    const bay = await SELF.fetch(`http://localhost/api/loadout/fleet/${fleetId}/modules`, { headers: await authHeaders(sessionToken) });
    expect(((await bay.json()) as { selections: unknown[] }).selections).toHaveLength(0);
  });

  it("rejects an invalid gadget uuid", async () => {
    const res = await SELF.fetch(`http://localhost/api/loadout/fleet/${fleetId}/gadgets`, {
      method: "PUT", headers: await auth(),
      body: JSON.stringify({ selections: [{ port_name: "x#0", module_uuid: "not-a-gadget", module_kind: "mining_gadget" }] }),
    });
    expect(res.status).toBe(400);
  });

  it("DELETE one gadget slot resets it", async () => {
    const slotKey = "weapon_port_1#0";
    const del = await SELF.fetch(`http://localhost/api/loadout/fleet/${fleetId}/gadgets/${encodeURIComponent(slotKey)}`, {
      method: "DELETE", headers: { ...(await authHeaders(sessionToken)), "Content-Length": "0" },
    });
    expect(del.status).toBe(200);
    const get = await SELF.fetch(`http://localhost/api/loadout/fleet/${fleetId}/gadgets`, { headers: await authHeaders(sessionToken) });
    expect(((await get.json()) as { selections: unknown[] }).selections).toHaveLength(0);
  });

  it("works for a loaner owner and requires auth", async () => {
    const put = await SELF.fetch(`http://localhost/api/loadout/loaner/${vid}/gadgets`, {
      method: "PUT", headers: await auth(),
      body: JSON.stringify({ selections: [{ port_name: "salv#0", module_uuid: "salv-trawler", module_kind: "salvage_gadget" }] }),
    });
    expect(put.status).toBe(200);
    const unauth = await SELF.fetch(`http://localhost/api/loadout/fleet/${fleetId}/gadgets`);
    expect(unauth.status).toBe(401);
  });
});
