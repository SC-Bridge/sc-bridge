import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { setupTestDatabase, TEST_GAME_VERSION_ID } from "./apply-migrations";
import { createTestUser, seedVehicle, seedFleetEntry } from "./helpers";
import { GET_SHIP_LOADOUT_TOOL, executeChatTool } from "../src/lib/chat-tools";

async function seedShipWithLoadout(userId: string, slug: string, name: string): Promise<number> {
  const vehicleId = await seedVehicle(env.DB, { slug, name });
  await env.DB.prepare(
    `INSERT INTO vehicle_components (uuid, name, slug, type, size, grade, manufacturer_id, game_version_id, created_at, updated_at)
     VALUES (?, ?, ?, 'Shield', 2, 1, NULL, ?, datetime('now'), datetime('now'))`,
  ).bind(`${slug}-comp`, `${name} Shield`, `${slug}-comp`, TEST_GAME_VERSION_ID).run();
  await env.DB.prepare(
    `INSERT INTO vehicle_ports (uuid, vehicle_id, name, port_type, equipped_item_uuid, game_version_id)
     VALUES (?, ?, 'shield_port', 'shield', ?, ?)`,
  ).bind(`${slug}-port`, vehicleId, `${slug}-comp`, TEST_GAME_VERSION_ID).run();
  return seedFleetEntry(env.DB, userId, vehicleId);
}

describe("chat tools — get_ship_loadout", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  it("exposes a get_ship_loadout tool spec", () => {
    expect(GET_SHIP_LOADOUT_TOOL.name).toBe("get_ship_loadout");
    expect(GET_SHIP_LOADOUT_TOOL.parameters).toHaveProperty("properties");
  });

  it("returns the loadout JSON for a ship resolved by fleet id", async () => {
    const { userId } = await createTestUser(env.DB);
    const fleetId = await seedShipWithLoadout(userId, "tool-ship", "Tool Ship");
    const out = await executeChatTool(env.DB, userId, {
      id: "c1",
      name: "get_ship_loadout",
      arguments: { ship_fleet_id: fleetId },
    });
    const parsed = JSON.parse(out);
    expect(parsed.ship).toBe("Tool Ship");
    expect(parsed.ports[0].component).toBe("Tool Ship Shield");
  });

  it("resolves a ship by name", async () => {
    const { userId } = await createTestUser(env.DB);
    await seedShipWithLoadout(userId, "tool-ship-2", "Named Tool Ship");
    const out = await executeChatTool(env.DB, userId, {
      id: "c2",
      name: "get_ship_loadout",
      arguments: { ship_name: "Named Tool" },
    });
    expect(JSON.parse(out).ship).toBe("Named Tool Ship");
  });

  it("returns an error string for an unknown tool", async () => {
    const { userId } = await createTestUser(env.DB);
    const out = await executeChatTool(env.DB, userId, { id: "c3", name: "do_something_else", arguments: {} });
    expect(JSON.parse(out).error).toBeTruthy();
  });

  it("returns an error string for a ship not in the user's fleet", async () => {
    const a = await createTestUser(env.DB);
    const b = await createTestUser(env.DB);
    const fleetId = await seedShipWithLoadout(a.userId, "tool-ship-3", "Private Ship");
    const out = await executeChatTool(env.DB, b.userId, {
      id: "c4",
      name: "get_ship_loadout",
      arguments: { ship_fleet_id: fleetId },
    });
    expect(JSON.parse(out).error).toBeTruthy();
  });
});
