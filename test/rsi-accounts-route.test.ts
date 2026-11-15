import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders, seedVehicle } from "./helpers";
import { createRsiAccount } from "../src/lib/rsi-accounts";

interface AccountJson {
  id: number;
  label: string | null;
  rsi_handle: string | null;
  is_primary: boolean;
  verified: boolean;
  ship_count: number;
  pledge_count: number;
}

async function api(token: string, path: string, init: RequestInit = {}) {
  return SELF.fetch(`http://localhost${path}`, {
    ...init,
    headers: { ...(await authHeaders(token)), "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

async function seedShip(userId: string, accountId: number, vehicleId: number, pledgeId: number, cents: number) {
  const sync = await env.DB
    .prepare("INSERT INTO user_hangar_syncs (user_id, source, rsi_account_id) VALUES (?, 'extension', ?) RETURNING id")
    .bind(userId, accountId)
    .first<{ id: number }>();
  await env.DB
    .prepare(
      `INSERT INTO user_pledges (user_id, sync_id, rsi_pledge_id, name, value, value_cents, currency, rsi_account_id)
       VALUES (?, ?, ?, 'Pledge', '$0 USD', ?, 'New Money', ?)`,
    )
    .bind(userId, sync!.id, pledgeId, cents, accountId)
    .run();
  await env.DB
    .prepare(
      `INSERT INTO user_fleet (user_id, vehicle_id, is_loaner, pledge_id, imported_at, rsi_account_id)
       VALUES (?, ?, 0, ?, datetime('now'), ?)`,
    )
    .bind(userId, vehicleId, String(pledgeId), accountId)
    .run();
}

const real = { referralCode: null, placeholder: false };

describe("RSI accounts API", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  it("requires authentication", async () => {
    const res = await SELF.fetch("http://localhost/api/rsi-accounts");
    expect(res.status).toBe(401);
  });

  it("lists accounts with per-account counts and can_add", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const a = await createRsiAccount(env.DB, userId, { handle: "Alpha", ...real });
    const b = await createRsiAccount(env.DB, userId, { handle: "Beta", ...real });
    const v1 = await seedVehicle(env.DB, { name: "Aurora A" });
    const v2 = await seedVehicle(env.DB, { name: "Aurora B" });
    await seedShip(userId, a, v1, 7001, 1000);
    await seedShip(userId, a, v2, 7002, 2000);
    await seedShip(userId, b, v1, 7003, 3000);

    const res = await api(sessionToken, "/api/rsi-accounts");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { accounts: AccountJson[]; max: number; can_add: boolean };
    expect(body.max).toBe(10);
    expect(body.can_add).toBe(true);
    expect(body.accounts).toHaveLength(2);
    const [first, second] = body.accounts;
    expect(first).toMatchObject({ id: a, rsi_handle: "Alpha", is_primary: true, verified: false, ship_count: 2, pledge_count: 2 });
    expect(second).toMatchObject({ id: b, rsi_handle: "Beta", is_primary: false, ship_count: 1, pledge_count: 1 });
  });

  it("PATCH sets primary and moves the flag", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const a = await createRsiAccount(env.DB, userId, { handle: "One", ...real });
    const b = await createRsiAccount(env.DB, userId, { handle: "Two", ...real });

    const res = await api(sessionToken, `/api/rsi-accounts/${b}`, {
      method: "PATCH",
      body: JSON.stringify({ is_primary: true }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const { results } = await env.DB
      .prepare("SELECT id, is_primary FROM user_rsi_accounts WHERE user_id = ? ORDER BY id")
      .bind(userId)
      .all<{ id: number; is_primary: number }>();
    expect(results).toEqual([
      { id: a, is_primary: 0 },
      { id: b, is_primary: 1 },
    ]);
  });

  it("PATCH trims the label and nulls an empty one", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const a = await createRsiAccount(env.DB, userId, { handle: "Lab", ...real });
    await api(sessionToken, `/api/rsi-accounts/${a}`, { method: "PATCH", body: JSON.stringify({ label: "  Main  " }) });
    const row1 = await env.DB.prepare("SELECT label FROM user_rsi_accounts WHERE id = ?").bind(a).first<{ label: string | null }>();
    expect(row1!.label).toBe("Main");
    await api(sessionToken, `/api/rsi-accounts/${a}`, { method: "PATCH", body: JSON.stringify({ label: "   " }) });
    const row2 = await env.DB.prepare("SELECT label FROM user_rsi_accounts WHERE id = ?").bind(a).first<{ label: string | null }>();
    expect(row2!.label).toBeNull();
  });

  it("PATCH rejects bad bodies and accounts owned by someone else", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const other = await createTestUser(env.DB);
    const a = await createRsiAccount(env.DB, userId, { handle: "Mine", ...real });
    const theirs = await createRsiAccount(env.DB, other.userId, { handle: "Theirs", ...real });

    const patch = (id: number, body: unknown) =>
      api(sessionToken, `/api/rsi-accounts/${id}`, { method: "PATCH", body: JSON.stringify(body) });

    expect((await patch(a, { label: "x".repeat(41) })).status).toBe(400);
    expect((await patch(a, { is_primary: false })).status).toBe(400);
    expect((await patch(a, {})).status).toBe(400);
    expect((await patch(theirs, { label: "hijack" })).status).toBe(404);
  });

  it("DELETE removes only that account's rows and 404s on another user's id", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const other = await createTestUser(env.DB);
    const a = await createRsiAccount(env.DB, userId, { handle: "Keep", ...real });
    const b = await createRsiAccount(env.DB, userId, { handle: "Drop", ...real });
    const theirs = await createRsiAccount(env.DB, other.userId, { handle: "NotYours", ...real });
    const v = await seedVehicle(env.DB, { name: "Cutlass" });
    await seedShip(userId, a, v, 8001, 100);
    await seedShip(userId, b, v, 8002, 200);

    const del = (id: number) => api(sessionToken, `/api/rsi-accounts/${id}`, { method: "DELETE", body: "{}" });

    expect((await del(theirs)).status).toBe(404);

    const res = await del(b);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const accounts = await env.DB.prepare("SELECT id FROM user_rsi_accounts WHERE user_id = ?").bind(userId).all<{ id: number }>();
    expect(accounts.results.map((r) => r.id)).toEqual([a]);
    const fleet = await env.DB
      .prepare("SELECT rsi_account_id FROM user_fleet WHERE user_id = ?")
      .bind(userId)
      .all<{ rsi_account_id: number }>();
    expect(fleet.results).toEqual([{ rsi_account_id: a }]);
  });

  it("fleet list returns each ship's account id and its own account's pledge value", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const a = await createRsiAccount(env.DB, userId, { handle: "FA", ...real });
    const b = await createRsiAccount(env.DB, userId, { handle: "FB", ...real });
    const v1 = await seedVehicle(env.DB, { name: "Hornet A" });
    const v2 = await seedVehicle(env.DB, { name: "Hornet B" });
    await seedShip(userId, a, v1, 9001, 11100);
    await seedShip(userId, b, v2, 9002, 22200);

    const res = await api(sessionToken, "/api/vehicles");
    const fleet = (await res.json()) as Array<{ vehicle_id: number; rsi_account_id: number; current_value_cents: number }>;
    const byVehicle = new Map(fleet.map((f) => [f.vehicle_id, f]));
    expect(byVehicle.get(v1)).toMatchObject({ rsi_account_id: a, current_value_cents: 11100 });
    expect(byVehicle.get(v2)).toMatchObject({ rsi_account_id: b, current_value_cents: 22200 });
  });

  it("/api/status exposes features.multiAccount", async () => {
    const res = await SELF.fetch("http://localhost/api/status");
    const body = (await res.json()) as { features: { multiAccount: boolean } };
    expect(body.features.multiAccount).toBe(true);
  });

  it("account export includes rsi_accounts without referral codes", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    await createRsiAccount(env.DB, userId, { handle: "Exp", referralCode: "STAR-AAAA-BBBB", placeholder: false });
    const res = await api(sessionToken, "/api/account/export");
    expect(res.status).toBe(200);
    const text = await res.text();
    const data = JSON.parse(text) as { rsi_accounts: Array<Record<string, unknown>> };
    expect(data.rsi_accounts).toHaveLength(1);
    expect(data.rsi_accounts[0].rsi_handle).toBe("Exp");
    expect(data.rsi_accounts[0]).not.toHaveProperty("referral_code");
    expect(text).not.toContain("STAR-AAAA-BBBB");
  });
});
