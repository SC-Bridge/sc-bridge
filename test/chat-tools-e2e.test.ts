import { describe, it, expect, beforeAll } from "vitest";
import { Hono } from "hono";
import { env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, seedVehicle } from "./helpers";
import { encrypt } from "../src/lib/crypto";
import { chatRoutes } from "../src/routes/chat";
import type { HonoEnv } from "../src/lib/types";

const ALL_TOOLS = [
  "get_ship_loadout",
  "search_ships",
  "get_ship_details",
  "search_components",
  "get_component_details",
  "get_my_items",
  "read_rsi_page",
];

describe("Fleet Chat — catalogue tools end to end", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  it("offers every tool, runs a search and labels it", async () => {
    const { userId } = await createTestUser(env.DB);
    const enc = await encrypt("sk-fake-test-key", env.ENCRYPTION_KEY);
    await env.DB
      .prepare("INSERT INTO user_llm_configs (user_id, provider, encrypted_api_key, model) VALUES (?, 'anthropic', ?, 'm')")
      .bind(userId, enc)
      .run();
    await seedVehicle(env.DB, { name: "E2E Hauler", focus: "Cargo", cargo: 120 });

    const requests: Array<{ tools?: Array<{ name: string }>; messages: unknown[] }> = [];
    const fakeFetch = (async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      requests.push(body);
      const content =
        requests.length === 1
          ? [{ type: "tool_use", id: "t1", name: "search_ships", input: { focus: "cargo" } }]
          : [{ type: "text", text: "The E2E Hauler carries 120 SCU." }];
      return new Response(JSON.stringify({ content }), { status: 200 });
    }) as typeof fetch;

    const app = new Hono<HonoEnv>();
    app.use("*", async (c, next) => {
      c.set("user", { id: userId, name: "t", email: "t@example.com" });
      await next();
    });
    app.route("/api", chatRoutes({ fetchFn: fakeFetch }));

    const res = await app.request(
      "/api/llm/chat",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "anthropic", message: "Which cargo ships are there?" }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const out = (await res.json()) as { reply?: string; tools_used: string[] };
    expect(requests[0].tools?.map((t) => t.name).sort()).toEqual([...ALL_TOOLS].sort());
    expect(out.tools_used).toEqual(["Searched ships"]);
    // The tool result handed back to the model contains the seeded ship.
    expect(JSON.stringify(requests[1].messages)).toContain("E2E Hauler");
  });
});
