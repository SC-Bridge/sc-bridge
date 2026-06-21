import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { setupTestDatabase, TEST_GAME_VERSION_ID } from "./apply-migrations";
import { seedVehicle, createTestUser, authHeaders } from "./helpers";

/**
 * Loaner loadout persistence (#0259). Loaners are derived rows with no
 * user_fleet entry, so their component overrides persist in user_loaner_loadout
 * keyed by (user_id, loaner_vehicle_id). The /api/loadout/loaner/:vehicleId
 * endpoints mirror the fleet ones — save, read back with stats, reset.
 */
describe("Loaner loadout — persist component overrides by vehicle", () => {
  let vid: number;
  let portId: number;
  let compId: number;
  let sessionToken: string;

  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    vid = await seedVehicle(env.DB, { slug: "loaner-arrow", name: "Loaner Arrow" });

    await env.DB.prepare(
      `INSERT INTO vehicle_components (uuid, name, slug, class_name, type, size, grade, game_version_id, created_at, updated_at)
       VALUES ('loaner-pp', 'Loaner Power Plant', 'loaner-pp', 'loaner_pp', 'PowerPlant', 2, 'A', ?, datetime('now'), datetime('now'))`,
    ).bind(TEST_GAME_VERSION_ID).run();
    compId = (await env.DB.prepare("SELECT id FROM vehicle_components WHERE uuid = 'loaner-pp'").first<{ id: number }>())!.id;

    await env.DB.prepare(
      `INSERT INTO vehicle_ports (uuid, vehicle_id, name, size_min, size_max, port_type, game_version_id)
       VALUES ('loaner-port', ?, 'hardpoint_power_1', 2, 2, 'power', ?)`,
    ).bind(vid, TEST_GAME_VERSION_ID).run();
    portId = (await env.DB.prepare("SELECT id FROM vehicle_ports WHERE uuid = 'loaner-port'").first<{ id: number }>())!.id;

    const user = await createTestUser(env.DB);
    sessionToken = user.sessionToken;
  });

  it("PUT then GET round-trips a saved loaner override", async () => {
    const put = await SELF.fetch(`http://localhost/api/loadout/loaner/${vid}`, {
      method: "PUT",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ overrides: [{ port_id: portId, component_id: compId }] }),
    });
    expect(put.status).toBe(200);

    const get = await SELF.fetch(`http://localhost/api/loadout/loaner/${vid}`, {
      headers: await authHeaders(sessionToken),
    });
    expect(get.status).toBe(200);
    const body = (await get.json()) as { overrides: Array<Record<string, unknown>> };
    expect(body.overrides).toHaveLength(1);
    expect(body.overrides[0].port_id).toBe(portId);
    expect(body.overrides[0].component_id).toBe(compId);
    expect(body.overrides[0].class_name).toBe("loaner_pp");
  });

  it("rejects a save against a non-existent vehicle", async () => {
    const res = await SELF.fetch(`http://localhost/api/loadout/loaner/99999999`, {
      method: "PUT",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ overrides: [{ port_id: portId, component_id: compId }] }),
    });
    expect(res.status).toBe(404);
  });

  it("requires auth", async () => {
    const res = await SELF.fetch(`http://localhost/api/loadout/loaner/${vid}`);
    expect(res.status).toBe(401);
  });

  it("DELETE resets the loaner to stock", async () => {
    await SELF.fetch(`http://localhost/api/loadout/loaner/${vid}`, {
      method: "PUT",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ overrides: [{ port_id: portId, component_id: compId }] }),
    });
    const del = await SELF.fetch(`http://localhost/api/loadout/loaner/${vid}`, {
      method: "DELETE",
      // /api/* requires Content-Length on mutations (browsers send 0 for bodyless DELETE).
      headers: { ...(await authHeaders(sessionToken)), "Content-Length": "0" },
    });
    expect(del.status).toBe(200);

    const get = await SELF.fetch(`http://localhost/api/loadout/loaner/${vid}`, {
      headers: await authHeaders(sessionToken),
    });
    const body = (await get.json()) as { overrides: unknown[] };
    expect(body.overrides).toHaveLength(0);
  });
});
