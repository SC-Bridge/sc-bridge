import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { setupTestDatabase, TEST_GAME_VERSION_ID } from "./apply-migrations";
import { seedVehicle, createTestUser, authHeaders, seedFleetEntry } from "./helpers";

/**
 * Module selection persistence (Plan 5, migration 0260). A user's chosen bay/room
 * module per slot is stored in user_module_selection — polymorphic owner so the
 * same endpoints serve owned fleet ships (?id = user_fleet.id) and loaners
 * (?id = vehicle id). PUT validates the module fits the vehicle's named port.
 */
describe("Module selection — persist chosen module per slot", () => {
  let vid: number;
  let fleetId: number;
  let cargoUuid: string;
  let sessionToken: string;
  const PORT = "hardpoint_front_module";

  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    vid = await seedVehicle(env.DB, { slug: "modsel-retal", name: "ModSel Retaliator" });

    // Two compatible modules on the front slot: a default + a cargo variant.
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO vehicle_modules (uuid, vehicle_id, port_name, class_name, display_name, size, is_default, has_loadout, game_version_id, data_source)
         VALUES ('modsel-base', ?, ?, 'modsel_base', 'Base Module - Front', 3, 1, 0, ?, 'p4k')`,
      ).bind(vid, PORT, TEST_GAME_VERSION_ID),
      env.DB.prepare(
        `INSERT INTO vehicle_modules (uuid, vehicle_id, port_name, class_name, display_name, size, is_default, has_loadout, game_version_id, data_source)
         VALUES ('modsel-cargo', ?, ?, 'modsel_cargo', 'Cargo Module - Front', 3, 0, 0, ?, 'p4k')`,
      ).bind(vid, PORT, TEST_GAME_VERSION_ID),
    ]);

    const user = await createTestUser(env.DB);
    sessionToken = user.sessionToken;
    fleetId = await seedFleetEntry(env.DB, user.userId, vid);
    cargoUuid = "modsel-cargo";
  });

  const auth = async () => ({ ...(await authHeaders(sessionToken)), "Content-Type": "application/json" });

  it("PUT then GET round-trips a fleet-ship module choice", async () => {
    const put = await SELF.fetch(`http://localhost/api/loadout/fleet/${fleetId}/modules`, {
      method: "PUT", headers: await auth(),
      body: JSON.stringify({ selections: [{ port_name: PORT, module_uuid: cargoUuid }] }),
    });
    expect(put.status).toBe(200);

    const get = await SELF.fetch(`http://localhost/api/loadout/fleet/${fleetId}/modules`, {
      headers: await authHeaders(sessionToken),
    });
    const body = (await get.json()) as { selections: Array<{ port_name: string; module_uuid: string; module_kind: string }> };
    expect(body.selections).toEqual([{ port_name: PORT, module_uuid: cargoUuid, module_kind: "bay" }]);
  });

  it("rejects a module that doesn't fit the vehicle's port", async () => {
    const res = await SELF.fetch(`http://localhost/api/loadout/fleet/${fleetId}/modules`, {
      method: "PUT", headers: await auth(),
      body: JSON.stringify({ selections: [{ port_name: PORT, module_uuid: "not-a-real-module" }] }),
    });
    expect(res.status).toBe(400);
  });

  it("works for a loaner owner (keyed by vehicle id)", async () => {
    const put = await SELF.fetch(`http://localhost/api/loadout/loaner/${vid}/modules`, {
      method: "PUT", headers: await auth(),
      body: JSON.stringify({ selections: [{ port_name: PORT, module_uuid: cargoUuid }] }),
    });
    expect(put.status).toBe(200);
    const get = await SELF.fetch(`http://localhost/api/loadout/loaner/${vid}/modules`, {
      headers: await authHeaders(sessionToken),
    });
    const body = (await get.json()) as { selections: unknown[] };
    expect(body.selections).toHaveLength(1);
  });

  it("DELETE one slot resets it to stock", async () => {
    const del = await SELF.fetch(`http://localhost/api/loadout/fleet/${fleetId}/modules/${PORT}`, {
      method: "DELETE", headers: { ...(await authHeaders(sessionToken)), "Content-Length": "0" },
    });
    expect(del.status).toBe(200);
    const get = await SELF.fetch(`http://localhost/api/loadout/fleet/${fleetId}/modules`, {
      headers: await authHeaders(sessionToken),
    });
    const body = (await get.json()) as { selections: unknown[] };
    expect(body.selections).toHaveLength(0);
  });

  it("requires auth", async () => {
    const res = await SELF.fetch(`http://localhost/api/loadout/fleet/${fleetId}/modules`);
    expect(res.status).toBe(401);
  });

  it("stores a fleet selection on the ship's account, and a second PUT updates that row", async () => {
    const user = await createTestUser(env.DB);
    const primary = await env.DB
      .prepare("INSERT INTO user_rsi_accounts (user_id, rsi_handle, is_primary, is_placeholder) VALUES (?, 'ModP', 1, 0) RETURNING id")
      .bind(user.userId).first<{ id: number }>();
    const other = await env.DB
      .prepare("INSERT INTO user_rsi_accounts (user_id, rsi_handle, is_primary, is_placeholder) VALUES (?, 'ModB', 0, 0) RETURNING id")
      .bind(user.userId).first<{ id: number }>();
    const ship = await env.DB
      .prepare("INSERT INTO user_fleet (user_id, vehicle_id, is_loaner, rsi_account_id, imported_at) VALUES (?, ?, 0, ?, datetime('now')) RETURNING id")
      .bind(user.userId, vid, other!.id).first<{ id: number }>();
    const headers = { ...(await authHeaders(user.sessionToken)), "Content-Type": "application/json" };

    for (const uuid of ["modsel-cargo", "modsel-base"]) {
      const put = await SELF.fetch(`http://localhost/api/loadout/fleet/${ship!.id}/modules`, {
        method: "PUT", headers,
        body: JSON.stringify({ selections: [{ port_name: PORT, module_uuid: uuid }] }),
      });
      expect(put.status).toBe(200);
    }

    const rows = await env.DB
      .prepare("SELECT rsi_account_id, module_uuid FROM user_module_selection WHERE user_id = ? AND owner_kind = 'fleet' AND owner_id = ? AND port_name = ?")
      .bind(user.userId, ship!.id, PORT).all<{ rsi_account_id: number; module_uuid: string }>();
    expect(rows.results).toEqual([{ rsi_account_id: other!.id, module_uuid: "modsel-base" }]);
    expect(other!.id).not.toBe(primary!.id);
  });
});
