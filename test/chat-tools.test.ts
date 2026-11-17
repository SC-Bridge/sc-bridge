import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { setupTestDatabase, TEST_GAME_VERSION_ID } from "./apply-migrations";
import { createTestUser, seedVehicle, seedFleetEntry } from "./helpers";
import { createRsiAccount } from "../src/lib/rsi-accounts";
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

describe("chat tools — account-aware ship lookup", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  async function twoAccountsWithSameShip() {
    const { userId } = await createTestUser(env.DB);
    const a = await createRsiAccount(env.DB, userId, { handle: `tool-a-${userId}`, referralCode: null, placeholder: false });
    const b = await createRsiAccount(env.DB, userId, { handle: `tool-b-${userId}`, referralCode: null, placeholder: false });
    await env.DB.prepare("UPDATE user_rsi_accounts SET label = 'Main' WHERE id = ?").bind(a).run();
    await env.DB.prepare("UPDATE user_rsi_accounts SET label = 'Alt', is_primary = 0 WHERE id = ?").bind(b).run();
    const vehicleId = await seedVehicle(env.DB, { slug: `dup-cutlass-${userId}`, name: "Cutlass Black" });
    const insert = async (accountId: number) =>
      (
        await env.DB
          .prepare(
            `INSERT INTO user_fleet (user_id, vehicle_id, is_loaner, warbond, imported_at, rsi_account_id)
             VALUES (?, ?, 0, 0, datetime('now'), ?)`,
          )
          .bind(userId, vehicleId, accountId)
          .run()
      ).meta.last_row_id as number;
    return { userId, a, b, fleetA: await insert(a), fleetB: await insert(b) };
  }

  const call = (name: string, args: Record<string, unknown>) => ({
    id: "x",
    name: "get_ship_loadout",
    arguments: { ship_name: name, ...args },
  });

  it("declares an optional account parameter", () => {
    const props = (GET_SHIP_LOADOUT_TOOL.parameters as { properties: Record<string, unknown> }).properties;
    expect(props).toHaveProperty("account");
    expect(props).toHaveProperty("ship_fleet_id");
    expect(props).toHaveProperty("ship_name");
  });

  it("resolves a same-named ship by account label", async () => {
    const { userId, fleetA } = await twoAccountsWithSameShip();
    // Rename account A's row so returning it would show a different `ship`.
    await env.DB.prepare("UPDATE user_fleet SET custom_name = 'Main Hauler' WHERE id = ?").bind(fleetA).run();
    const out = JSON.parse(await executeChatTool(env.DB, userId, call("Cutlass Black", { account: "alt" })));
    expect(out.ship).toBe("Cutlass Black");
    expect(out.ship).not.toBe("Main Hauler");
    expect(out.error).toBeUndefined();
  });

  it("asks which account when a name is ambiguous", async () => {
    const { userId } = await twoAccountsWithSameShip();
    const out = JSON.parse(await executeChatTool(env.DB, userId, call("Cutlass Black", {})));
    expect(out.error).toBe('Several ships match "Cutlass Black": on Main, Alt. Ask which account.');
  });

  it("lists valid account names when the account matches none", async () => {
    const { userId } = await twoAccountsWithSameShip();
    const out = JSON.parse(await executeChatTool(env.DB, userId, call("Cutlass Black", { account: "Nope" })));
    expect(out.error).toContain("Main");
    expect(out.error).toContain("Alt");
  });

  it("only matches within the chat's scope", async () => {
    const { userId, a } = await twoAccountsWithSameShip();
    const inScope = JSON.parse(await executeChatTool(env.DB, userId, call("Cutlass Black", {}), [a]));
    expect(inScope.ship).toBe("Cutlass Black");
    const outOfScope = JSON.parse(await executeChatTool(env.DB, userId, call("Cutlass Black", { account: "Alt" }), [a]));
    expect(outOfScope.error).toContain("Main");
    expect(outOfScope.error).toContain("Valid accounts: Main.");
  });
});
