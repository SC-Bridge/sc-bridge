import { describe, it, expect, beforeAll } from "vitest";
import { Hono } from "hono";
import { env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, seedVehicle } from "./helpers";
import { createRsiAccount } from "../src/lib/rsi-accounts";
import { encrypt } from "../src/lib/crypto";
import { analysisRoutes } from "../src/routes/analysis";
import { DEFAULT_MODELS } from "../src/lib/llm";
import type { HonoEnv } from "../src/lib/types";

let seq = 0;

async function seedAccount(userId: string, primary: boolean): Promise<number> {
  seq++;
  const id = await createRsiAccount(env.DB, userId, { handle: `llm${seq}`, referralCode: null, placeholder: false });
  if (!primary) await env.DB.prepare("UPDATE user_rsi_accounts SET is_primary = 0 WHERE id = ?").bind(id).run();
  return id;
}

async function seedShip(userId: string, accountId: number, name: string): Promise<void> {
  seq++;
  const vehicleId = await seedVehicle(env.DB, { slug: `llm-${seq}`, name });
  await env.DB
    .prepare(
      `INSERT INTO user_fleet (user_id, vehicle_id, is_loaner, warbond, imported_at, rsi_account_id)
       VALUES (?, ?, 0, 0, datetime('now'), ?)`,
    )
    .bind(userId, vehicleId, accountId)
    .run();
}

async function seedKey(userId: string): Promise<void> {
  const enc = await encrypt("sk-fake-test-key", env.ENCRYPTION_KEY);
  await env.DB
    .prepare("INSERT INTO user_llm_configs (user_id, provider, encrypted_api_key, model) VALUES (?, 'anthropic', ?, 'm')")
    .bind(userId, enc)
    .run();
}

/** The route app with a fake provider fetch. Nothing here reaches a real model API. */
function appFor(userId: string, prompts: string[]) {
  const fakeFetch = (async (_url: unknown, init?: RequestInit) => {
    const sent = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
    prompts.push(sent.messages[0].content);
    return new Response(JSON.stringify({ content: [{ type: "text", text: "analysis text" }] }), { status: 200 });
  }) as typeof fetch;
  const app = new Hono<HonoEnv>();
  app.use("*", async (c, next) => {
    c.set("user", { id: userId, name: "t", email: "t@example.com" });
    await next();
  });
  app.route("/api", analysisRoutes({ fetchFn: fakeFetch }));
  return app;
}

const generate = (app: Hono<HonoEnv>, body: unknown) =>
  app.request(
    "/api/llm/generate-analysis",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    env,
  );

async function storedJson(userId: string): Promise<string | null> {
  const row = await env.DB
    .prepare("SELECT account_ids_json FROM ai_analyses WHERE user_id = ? ORDER BY id DESC LIMIT 1")
    .bind(userId)
    .first<{ account_ids_json: string | null }>();
  return row!.account_ids_json;
}

describe("generate-analysis account scoping", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  async function twoAccounts() {
    const { userId } = await createTestUser(env.DB);
    await seedKey(userId);
    const a = await seedAccount(userId, true);
    const b = await seedAccount(userId, false);
    await seedShip(userId, a, "Alpha Ship");
    await seedShip(userId, b, "Bravo Ship");
    return { userId, a, b };
  }

  it("only sends the chosen accounts' ships and stores their ids", async () => {
    const { userId, b } = await twoAccounts();
    const prompts: string[] = [];
    const res = await generate(appFor(userId, prompts), { accounts: [b] });
    expect(res.status).toBe(200);
    expect(prompts[0]).toContain("Bravo Ship");
    expect(prompts[0]).not.toContain("Alpha Ship");
    expect(prompts[0]).toContain('"account"');
    expect(await storedJson(userId)).toBe(JSON.stringify([b]));
  });

  it("absent accounts analyses everything and stores NULL", async () => {
    const { userId } = await twoAccounts();
    const prompts: string[] = [];
    const res = await generate(appFor(userId, prompts), {});
    expect(res.status).toBe(200);
    expect(prompts[0]).toContain("Alpha Ship");
    expect(prompts[0]).toContain("Bravo Ship");
    expect(await storedJson(userId)).toBeNull();
  });

  it("'all' analyses everything and stores NULL", async () => {
    const { userId } = await twoAccounts();
    const prompts: string[] = [];
    await generate(appFor(userId, prompts), { accounts: "all" });
    expect(prompts[0]).toContain("Alpha Ship");
    expect(prompts[0]).toContain("Bravo Ship");
    expect(await storedJson(userId)).toBeNull();
  });

  it("drops foreign ids and falls back to the primary account", async () => {
    const { userId, a } = await twoAccounts();
    const other = await createTestUser(env.DB);
    const foreign = await seedAccount(other.userId, true);
    const prompts: string[] = [];
    const res = await generate(appFor(userId, prompts), { accounts: [foreign] });
    expect(res.status).toBe(200);
    expect(prompts[0]).toContain("Alpha Ship");
    expect(prompts[0]).not.toContain("Bravo Ship");
    expect(await storedJson(userId)).toBe(JSON.stringify([a]));
  });

  it("rejects an empty accounts list", async () => {
    const { userId } = await twoAccounts();
    const res = await generate(appFor(userId, []), { accounts: [] });
    expect(res.status).toBe(400);
  });

  it("adds no account label with a single account", async () => {
    const { userId } = await createTestUser(env.DB);
    await seedKey(userId);
    const a = await seedAccount(userId, true);
    await seedShip(userId, a, "Solo Ship");
    const prompts: string[] = [];
    await generate(appFor(userId, prompts), {});
    expect(prompts[0]).toContain("Solo Ship");
    expect(prompts[0]).not.toContain('"account"');
  });

  it("history and latest rows carry account names, null for all", async () => {
    const { userId, b } = await twoAccounts();
    const app = appFor(userId, []);
    await generate(app, {});
    await generate(app, { accounts: [b] });
    const hist = (await (await app.request("/api/llm/analysis-history", {}, env)).json()) as {
      history: Array<{ accounts: string[] | null }>;
    };
    expect(hist.history[0].accounts).toHaveLength(1);
    expect(hist.history[1].accounts).toBeNull();
    const latest = (await (await app.request("/api/llm/latest-analysis", {}, env)).json()) as {
      accounts: string[] | null;
    };
    expect(latest.accounts).toEqual(hist.history[0].accounts);
  });
});

describe("generate-analysis with no saved model", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  it("accepts model: null (what the Analysis page sends) and falls back to the default model", async () => {
    const { userId } = await createTestUser(env.DB);
    // Settings saves a key without a model, leaving model = ''
    const enc = await encrypt("sk-fake-test-key", env.ENCRYPTION_KEY);
    await env.DB
      .prepare("INSERT INTO user_llm_configs (user_id, provider, encrypted_api_key, model) VALUES (?, 'anthropic', ?, '')")
      .bind(userId, enc)
      .run();
    const acct = await seedAccount(userId, true);
    await seedShip(userId, acct, "Null Model Ship");

    const res = await generate(appFor(userId, []), { provider: "anthropic", model: null, accounts: "all" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { model: string };
    expect(body.model).toBe(DEFAULT_MODELS.anthropic);
  });
});
