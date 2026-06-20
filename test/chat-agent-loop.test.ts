import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { setupTestDatabase, TEST_GAME_VERSION_ID } from "./apply-migrations";
import { createTestUser, seedVehicle, seedFleetEntry } from "./helpers";
import { runChatTurn } from "../src/lib/chat-agent";
import type { FetchFn } from "../src/lib/llm";

function res(body: unknown): Response {
  return { status: 200, ok: true, async text() { return JSON.stringify(body); } } as unknown as Response;
}
function openaiToolCall(fleetId: number): unknown {
  return {
    choices: [
      { message: { tool_calls: [{ id: "c1", type: "function", function: { name: "get_ship_loadout", arguments: JSON.stringify({ ship_fleet_id: fleetId }) } }] } },
    ],
  };
}
function openaiText(t: string): unknown {
  return { choices: [{ message: { content: t } }] };
}
function scripted(responses: unknown[]): { fetch: FetchFn; bodies: string[] } {
  const bodies: string[] = [];
  let i = 0;
  const fetch = (async (_url: string, init: RequestInit) => {
    bodies.push(init.body as string);
    return res(responses[Math.min(i++, responses.length - 1)]);
  }) as unknown as FetchFn;
  return { fetch, bodies };
}

async function seedShip(userId: string, slug: string): Promise<number> {
  const v = await seedVehicle(env.DB, { slug, name: "Agent Ship" });
  await env.DB.prepare(
    `INSERT INTO vehicle_components (uuid, name, slug, type, size, grade, manufacturer_id, game_version_id, created_at, updated_at)
     VALUES (?, 'Agent Shield', ?, 'Shield', 2, 1, NULL, ?, datetime('now'), datetime('now'))`,
  ).bind(`${slug}-comp`, `${slug}-comp`, TEST_GAME_VERSION_ID).run();
  await env.DB.prepare(
    `INSERT INTO vehicle_ports (uuid, vehicle_id, name, port_type, equipped_item_uuid, game_version_id)
     VALUES (?, ?, 'shield_port', 'shield', ?, ?)`,
  ).bind(`${slug}-port`, v, `${slug}-comp`, TEST_GAME_VERSION_ID).run();
  return seedFleetEntry(env.DB, userId, v);
}

describe("runChatTurn — agent loop", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  it("executes a tool call then returns the model's final text", async () => {
    const { userId } = await createTestUser(env.DB);
    const fleetId = await seedShip(userId, "agent-ship-a");
    const { fetch, bodies } = scripted([openaiToolCall(fleetId), openaiText("Your shield is the Agent Shield.")]);

    const turn = await runChatTurn({
      provider: "openai",
      apiKey: "k",
      model: "gpt-4o",
      system: "sys",
      messages: [{ role: "user", content: "what's on my Agent Ship?" }],
      db: env.DB,
      userId,
      fetchImpl: fetch,
    });

    expect(turn.ok).toBe(true);
    expect(turn.text).toBe("Your shield is the Agent Shield.");
    expect(turn.rounds).toBe(1);
    expect(turn.toolsUsed).toContain("Agent Ship");
    // second request fed the tool result back
    expect(bodies[1]).toContain("Agent Shield");
  });

  it("stops at the 4-round cap when the model keeps requesting tools", async () => {
    const { userId } = await createTestUser(env.DB);
    const fleetId = await seedShip(userId, "agent-ship-b");
    const { fetch } = scripted([openaiToolCall(fleetId)]); // always a tool call

    const turn = await runChatTurn({
      provider: "openai",
      apiKey: "k",
      model: "gpt-4o",
      system: "sys",
      messages: [{ role: "user", content: "loop" }],
      db: env.DB,
      userId,
      fetchImpl: fetch,
    });

    expect(turn.ok).toBe(true);
    expect(turn.rounds).toBe(4);
  });
});
