import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, seedVehicle, seedFleetEntry } from "./helpers";
import { runChatTurn } from "../src/lib/chat-agent";

/**
 * A fake Anthropic endpoint: answers `tool_use` for the first `toolTurns`
 * requests, then a text block. Records every request body it saw.
 */
function fakeAnthropic(toolTurns: number, fleetId: number) {
  const bodies: Array<Record<string, unknown>> = [];
  const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    bodies.push(body);
    const n = bodies.length;
    const content =
      n <= toolTurns
        ? [{ type: "tool_use", id: `call-${n}`, name: "get_ship_loadout", input: { ship_fleet_id: fleetId } }]
        : [{ type: "text", text: "done" }];
    return new Response(JSON.stringify({ content }), { status: 200 });
  }) as typeof fetch;
  return { fetchImpl, bodies };
}

describe("runChatTurn tool rounds", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  async function setup() {
    const { userId } = await createTestUser(env.DB);
    const vehicleId = await seedVehicle(env.DB, { name: "Rounds Ship" });
    const fleetId = await seedFleetEntry(env.DB, userId, vehicleId);
    return { userId, fleetId };
  }

  const turn = (userId: string, fetchImpl: typeof fetch) =>
    runChatTurn({
      provider: "anthropic",
      apiKey: "sk-fake",
      model: "m",
      system: "s",
      messages: [{ role: "user", content: "plan my fleet" }],
      db: env.DB,
      userId,
      fetchImpl,
    });

  it("allows five tool rounds and still offers tools on the sixth request", async () => {
    const { userId, fleetId } = await setup();
    const { fetchImpl, bodies } = fakeAnthropic(5, fleetId);
    const result = await turn(userId, fetchImpl);
    expect(result.ok).toBe(true);
    expect(result.text).toBe("done");
    expect(result.rounds).toBe(5);
    expect(bodies[5]).toHaveProperty("tools");
  });

  it("stops after eight rounds and sends the ninth request without tools", async () => {
    const { userId, fleetId } = await setup();
    const { fetchImpl, bodies } = fakeAnthropic(Number.POSITIVE_INFINITY, fleetId);
    const result = await turn(userId, fetchImpl);
    expect(result.rounds).toBe(8);
    expect(bodies).toHaveLength(9);
    expect(bodies[8]).not.toHaveProperty("tools");
  });
});
