import { describe, it, expect, beforeAll } from "vitest";
import { Hono } from "hono";
import { env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, seedVehicle } from "./helpers";
import { createRsiAccount } from "../src/lib/rsi-accounts";
import { encrypt } from "../src/lib/crypto";
import { chatRoutes } from "../src/routes/chat";
import type { HonoEnv } from "../src/lib/types";

let seq = 0;

async function seedAccount(userId: string, primary: boolean, label: string): Promise<number> {
  seq++;
  const id = await createRsiAccount(env.DB, userId, { handle: `chat${seq}`, referralCode: null, placeholder: false });
  await env.DB.prepare("UPDATE user_rsi_accounts SET label = ? WHERE id = ?").bind(label, id).run();
  if (!primary) await env.DB.prepare("UPDATE user_rsi_accounts SET is_primary = 0 WHERE id = ?").bind(id).run();
  return id;
}

async function seedShip(userId: string, accountId: number, vehicleId: number): Promise<void> {
  await env.DB
    .prepare(
      `INSERT INTO user_fleet (user_id, vehicle_id, is_loaner, warbond, imported_at, rsi_account_id)
       VALUES (?, ?, 0, 0, datetime('now'), ?)`,
    )
    .bind(userId, vehicleId, accountId)
    .run();
}

async function seedNamedShip(userId: string, accountId: number, name: string): Promise<void> {
  seq++;
  await seedShip(userId, accountId, await seedVehicle(env.DB, { slug: `chat-scope-${seq}`, name }));
}

async function seedKey(userId: string): Promise<void> {
  const enc = await encrypt("sk-fake-test-key", env.ENCRYPTION_KEY);
  await env.DB
    .prepare("INSERT INTO user_llm_configs (user_id, provider, encrypted_api_key, model) VALUES (?, 'anthropic', ?, 'm')")
    .bind(userId, enc)
    .run();
}

/** The chat route app with a fake provider fetch. Nothing here reaches a real model API. */
function appFor(userId: string, systems: string[]) {
  const fakeFetch = (async (_url: unknown, init?: RequestInit) => {
    const sent = JSON.parse(String(init?.body)) as { system?: string };
    systems.push(sent.system ?? "");
    return new Response(JSON.stringify({ content: [{ type: "text", text: "chat reply" }] }), { status: 200 });
  }) as typeof fetch;
  const app = new Hono<HonoEnv>();
  app.use("*", async (c, next) => {
    c.set("user", { id: userId, name: "t", email: "t@example.com" });
    await next();
  });
  app.route("/api", chatRoutes({ fetchFn: fakeFetch }));
  return app;
}

const send = (app: Hono<HonoEnv>, body: Record<string, unknown>) =>
  app.request(
    "/api/llm/chat",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "anthropic", message: "hello", ...body }),
    },
    env,
  );

async function stored(chatId: number): Promise<string | null> {
  const row = await env.DB
    .prepare("SELECT account_ids_json FROM ai_chats WHERE id = ?")
    .bind(chatId)
    .first<{ account_ids_json: string | null }>();
  return row!.account_ids_json;
}

describe("AI chat account scoping", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  async function twoAccounts() {
    const { userId } = await createTestUser(env.DB);
    await seedKey(userId);
    const a = await seedAccount(userId, true, "Main");
    const b = await seedAccount(userId, false, "Alt");
    await seedNamedShip(userId, a, "Alpha Ship");
    await seedNamedShip(userId, b, "Bravo Ship");
    return { userId, a, b };
  }

  it("new chat stores the page's account scope", async () => {
    const { userId, a } = await twoAccounts();
    const systems: string[] = [];
    const res = await send(appFor(userId, systems), { accounts: [a] });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { chat_id: number; accounts: string[] | null };
    expect(await stored(body.chat_id)).toBe(JSON.stringify([a]));
    expect(body.accounts).toEqual(["Main"]);
    expect(systems[0]).toContain("Alpha Ship");
    expect(systems[0]).not.toContain("Bravo Ship");
    expect(systems[0]).toContain('"account"');
  });

  it("absent accounts on a new chat means all, stored NULL", async () => {
    const { userId } = await twoAccounts();
    const systems: string[] = [];
    const res = await send(appFor(userId, systems), {});
    const body = (await res.json()) as { chat_id: number; accounts: string[] | null };
    expect(await stored(body.chat_id)).toBeNull();
    expect(body.accounts).toBeNull();
    expect(systems[0]).toContain("Alpha Ship");
    expect(systems[0]).toContain("Bravo Ship");
  });

  it("changing scope applies from the next message", async () => {
    const { userId, a, b } = await twoAccounts();
    const systems: string[] = [];
    const app = appFor(userId, systems);
    const first = (await (await send(app, { accounts: [a] })).json()) as { chat_id: number };
    const res = await send(app, { chat_id: first.chat_id, accounts: [b] });
    expect(res.status).toBe(200);
    expect(systems[1]).toContain("Bravo Ship");
    expect(systems[1]).not.toContain("Alpha Ship");
    expect(await stored(first.chat_id)).toBe(JSON.stringify([b]));
    expect(((await res.json()) as { accounts: string[] }).accounts).toEqual(["Alt"]);
  });

  it("absent accounts keeps the stored scope", async () => {
    const { userId, b } = await twoAccounts();
    const systems: string[] = [];
    const app = appFor(userId, systems);
    const first = (await (await send(app, { accounts: [b] })).json()) as { chat_id: number };
    await send(app, { chat_id: first.chat_id });
    expect(systems[1]).toContain("Bravo Ship");
    expect(systems[1]).not.toContain("Alpha Ship");
    expect(await stored(first.chat_id)).toBe(JSON.stringify([b]));
  });

  it("'all' on an existing chat widens it back to everything", async () => {
    const { userId, a } = await twoAccounts();
    const systems: string[] = [];
    const app = appFor(userId, systems);
    const first = (await (await send(app, { accounts: [a] })).json()) as { chat_id: number };
    await send(app, { chat_id: first.chat_id, accounts: "all" });
    expect(systems[1]).toContain("Alpha Ship");
    expect(systems[1]).toContain("Bravo Ship");
    expect(await stored(first.chat_id)).toBeNull();
  });

  it("drops foreign ids and falls back to the primary account", async () => {
    const { userId, a } = await twoAccounts();
    const other = await createTestUser(env.DB);
    const foreign = await seedAccount(other.userId, true, "Theirs");
    const systems: string[] = [];
    const res = await send(appFor(userId, systems), { accounts: [foreign] });
    const body = (await res.json()) as { chat_id: number };
    expect(await stored(body.chat_id)).toBe(JSON.stringify([a]));
    expect(systems[0]).toContain("Alpha Ship");
    expect(systems[0]).not.toContain("Bravo Ship");
  });

  it("rejects an empty accounts list", async () => {
    const { userId } = await twoAccounts();
    const res = await send(appFor(userId, []), { accounts: [] });
    expect(res.status).toBe(400);
  });

  it("entitled loaners are scoped too", async () => {
    const { userId, a, b } = await twoAccounts();
    const concept = await env.DB
      .prepare("SELECT id FROM production_statuses WHERE key != 'flight_ready' LIMIT 1")
      .first<{ id: number }>();
    seq++;
    const conceptVehicle = await seedVehicle(env.DB, { slug: `chat-concept-${seq}`, name: "Concept Hull", production_status_id: concept!.id });
    const loanerVehicle = await seedVehicle(env.DB, { slug: `chat-loaner-${seq}`, name: "Granted Loaner" });
    await env.DB.prepare("INSERT INTO vehicle_loaners (vehicle_id, loaner_id) VALUES (?, ?)").bind(conceptVehicle, loanerVehicle).run();
    await seedShip(userId, b, conceptVehicle);

    const systems: string[] = [];
    const app = appFor(userId, systems);
    await send(app, { accounts: [a] });
    expect(systems[0]).not.toContain("Granted Loaner");
    await send(app, { accounts: [b] });
    expect(systems[1]).toContain("Granted Loaner");
  });

  it("adds no account label with a single account", async () => {
    const { userId } = await createTestUser(env.DB);
    await seedKey(userId);
    const a = await seedAccount(userId, true, "Only");
    await seedNamedShip(userId, a, "Solo Ship");
    const systems: string[] = [];
    await send(appFor(userId, systems), {});
    expect(systems[0]).toContain("Solo Ship");
    expect(systems[0]).not.toContain('"account"');
  });

  it("GET /llm/chats/:id returns the scope as account names", async () => {
    const { userId, b } = await twoAccounts();
    const app = appFor(userId, []);
    const first = (await (await send(app, { accounts: [b] })).json()) as { chat_id: number };
    const detail = (await (await app.request(`/api/llm/chats/${first.chat_id}`, {}, env)).json()) as {
      chat: { accounts: string[] | null; account_ids_json?: string };
    };
    expect(detail.chat.accounts).toEqual(["Alt"]);
    expect(detail.chat).not.toHaveProperty("account_ids_json");
    const all = (await (await send(app, {})).json()) as { chat_id: number };
    const detailAll = (await (await app.request(`/api/llm/chats/${all.chat_id}`, {}, env)).json()) as {
      chat: { accounts: string[] | null };
    };
    expect(detailAll.chat.accounts).toBeNull();
  });
});
