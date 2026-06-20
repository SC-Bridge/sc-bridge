import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { setupTestDatabase, TEST_GAME_VERSION_ID } from "./apply-migrations";
import { createTestUser, seedVehicle, seedFleetEntry } from "./helpers";
import { getEffectiveShipLoadout } from "../src/db/queries";

async function seedComponent(uuid: string, name: string, type: string, size: number): Promise<number> {
  await env.DB.prepare(
    `INSERT INTO vehicle_components (uuid, name, slug, type, sub_type, size, grade, class,
       manufacturer_id, thermal_output, power_draw, game_version_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, ?, 1, NULL, NULL, NULL, NULL, ?, datetime('now'), datetime('now'))`,
  )
    .bind(uuid, name, name.toLowerCase().replace(/\s+/g, "-"), type, size, TEST_GAME_VERSION_ID)
    .run();
  const row = await env.DB.prepare("SELECT id FROM vehicle_components WHERE uuid = ?").bind(uuid).first<{ id: number }>();
  return row!.id;
}

async function seedPort(vehicleId: number, name: string, portType: string, equippedUuid: string | null): Promise<number> {
  const uuid = `port-${name}-${vehicleId}`;
  await env.DB.prepare(
    `INSERT INTO vehicle_ports (uuid, vehicle_id, name, port_type, equipped_item_uuid, game_version_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(uuid, vehicleId, name, portType, equippedUuid, TEST_GAME_VERSION_ID)
    .run();
  const row = await env.DB.prepare("SELECT id FROM vehicle_ports WHERE uuid = ?").bind(uuid).first<{ id: number }>();
  return row!.id;
}

describe("getEffectiveShipLoadout", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  it("merges stock components with the user's custom overrides, tagging source", async () => {
    const { userId } = await createTestUser(env.DB);
    const vehicleId = await seedVehicle(env.DB, { slug: "eff-loadout-ship", name: "Test Loadout Ship" });

    const stockShield = await seedComponent("eff-stock-shield", "Stock Shield", "Shield", 2);
    const customShield = await seedComponent("eff-custom-shield", "Custom Shield", "Shield", 2);
    await seedComponent("eff-stock-pp", "Stock Power Plant", "PowerPlant", 2);

    const shieldPort = await seedPort(vehicleId, "shield_port", "shield", "eff-stock-shield");
    await seedPort(vehicleId, "pp_port", "powerplant", "eff-stock-pp");

    const fleetId = await seedFleetEntry(env.DB, userId, vehicleId);

    // User swaps the shield for the custom one.
    await env.DB.prepare(
      `INSERT INTO user_fleet_loadout (user_id, user_fleet_id, port_id, component_id) VALUES (?, ?, ?, ?)`,
    )
      .bind(userId, fleetId, shieldPort, customShield)
      .run();
    void stockShield;

    const result = await getEffectiveShipLoadout(env.DB, userId, fleetId);
    expect(result).not.toBeNull();
    expect(result!.ship).toBe("Test Loadout Ship");

    const byPort = Object.fromEntries(result!.ports.map((p) => [p.port, p]));
    expect(byPort["shield_port"].component).toBe("Custom Shield");
    expect(byPort["shield_port"].source).toBe("custom");
    expect(byPort["pp_port"].component).toBe("Stock Power Plant");
    expect(byPort["pp_port"].source).toBe("stock");
  });

  it("returns null for a fleet entry not owned by the user", async () => {
    const a = await createTestUser(env.DB);
    const b = await createTestUser(env.DB);
    const vehicleId = await seedVehicle(env.DB, { slug: "eff-loadout-ship-2", name: "Other Ship" });
    const fleetId = await seedFleetEntry(env.DB, a.userId, vehicleId);
    expect(await getEffectiveShipLoadout(env.DB, b.userId, fleetId)).toBeNull();
  });
});
