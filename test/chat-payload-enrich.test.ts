import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, seedVehicle, seedFleetEntry } from "./helpers";
import { getEntitledLoaners, getCustomLoadoutFleetIds } from "../src/db/queries";
import { buildChatFleetPayload } from "../src/lib/fleet-payload";
import type { UserFleetEntry } from "../src/lib/types";

describe("buildChatFleetPayload (pure)", () => {
  it("adds id + has_custom_loadout per ship and a loaners list", () => {
    const entries = [
      { id: 11, vehicle_name: "Carrack", cargo: 456 },
      { id: 22, vehicle_name: "Gladius", cargo: 0 },
    ] as unknown as UserFleetEntry[];
    const customIds = new Set<number>([11]);
    const loaners = [{ loaner: "Cutlass Black", granted_by: "Polaris" }];

    const payload = buildChatFleetPayload(entries, customIds, loaners);
    expect(payload.loaners).toEqual(loaners);
    const carrack = payload.ships.find((s) => s.id === 11)!;
    const gladius = payload.ships.find((s) => s.id === 22)!;
    expect(carrack.has_custom_loadout).toBe(true);
    expect(gladius.has_custom_loadout).toBe(false);
    expect(carrack.vehicle_name).toBe("Carrack");
  });
});

describe("loaner + custom-loadout queries", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  it("getEntitledLoaners derives loaners from owned concept ships", async () => {
    const { userId } = await createTestUser(env.DB);
    const concept = await env.DB
      .prepare("SELECT id FROM production_statuses WHERE key != 'flight_ready' LIMIT 1")
      .first<{ id: number }>();

    const ownedConcept = await seedVehicle(env.DB, { slug: "loaner-owned", name: "Owned Concept", production_status_id: concept!.id });
    const loanerShip = await seedVehicle(env.DB, { slug: "loaner-grant", name: "Granted Loaner" });
    await env.DB.prepare("INSERT INTO vehicle_loaners (vehicle_id, loaner_id) VALUES (?, ?)").bind(ownedConcept, loanerShip).run();
    await seedFleetEntry(env.DB, userId, ownedConcept);

    const loaners = await getEntitledLoaners(env.DB, userId);
    expect(loaners.some((l) => l.loaner === "Granted Loaner")).toBe(true);
  });

  it("getCustomLoadoutFleetIds returns fleet ids with overrides", async () => {
    const { userId } = await createTestUser(env.DB);
    const v = await seedVehicle(env.DB, { slug: "cl-ship", name: "CL Ship" });
    const fleetId = await seedFleetEntry(env.DB, userId, v);
    // seed a port + component + override
    await env.DB.prepare(
      `INSERT INTO vehicle_components (uuid, name, slug, type, size, grade, manufacturer_id, game_version_id, created_at, updated_at)
       VALUES ('cl-comp','CL Comp','cl-comp','Shield',1,1,NULL,1,datetime('now'),datetime('now'))`,
    ).run();
    const comp = await env.DB.prepare("SELECT id FROM vehicle_components WHERE uuid='cl-comp'").first<{ id: number }>();
    await env.DB.prepare(
      `INSERT INTO vehicle_ports (uuid, vehicle_id, name, port_type, game_version_id) VALUES ('cl-port', ?, 'p', 'shield', 1)`,
    ).bind(v).run();
    const port = await env.DB.prepare("SELECT id FROM vehicle_ports WHERE uuid='cl-port'").first<{ id: number }>();
    await env.DB.prepare(
      `INSERT INTO user_fleet_loadout (user_id, user_fleet_id, port_id, component_id) VALUES (?, ?, ?, ?)`,
    ).bind(userId, fleetId, port!.id, comp!.id).run();

    const ids = await getCustomLoadoutFleetIds(env.DB, userId);
    expect(ids.has(fleetId)).toBe(true);
  });
});
