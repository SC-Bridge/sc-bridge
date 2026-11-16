import { describe, it, expect, beforeAll } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders, seedVehicle } from "./helpers";
import { getOrCreatePrimaryAccountId } from "../src/lib/rsi-accounts";
import worker from "../src/index";

/**
 * /api/import/hangar-sync with ENVIRONMENT "production" — multi-account is
 * off there (one RSI account per sign-in). vitest.config.ts runs the worker
 * as "test", so these call the app directly with a production env.
 */

interface PayloadOpts {
  handle?: string | null;
  referral?: string | null;
  pledgeIds: number[];
  noAccount?: boolean;
  target?: { mode: "new" } | { mode: "map"; rsi_account_id: number };
}

function makePayload(opts: PayloadOpts) {
  return {
    pledges: opts.pledgeIds.map((id) => ({
      id,
      name: `Standalone Ship - Prodma Shipa ${id}`,
      value: "$50.00 USD",
      valueCents: 5000,
      currency: "New Money",
      date: "May 1, 2023",
      isUpgraded: false,
      isReclaimable: true,
      isGiftable: true,
      isWarbond: false,
      items: [
        { title: "Prodma Shipa", kind: "Ship" },
        { title: "Lifetime Insurance", kind: "Insurance" },
      ],
      upgradeData: null,
    })),
    buyback_pledges: [],
    upgrades: [],
    account: opts.noAccount
      ? null
      : { nickname: opts.handle ?? null, referral_code: opts.referral ?? null, displayname: "Display", store_credit_cents: 1000 },
    named_ships: [],
    sync_meta: { extension_version: "0.6.2", synced_at: "2026-11-15T00:00:00Z" },
    ...(opts.target ? { target: opts.target } : {}),
  };
}

async function prodSync(sessionToken: string, body: unknown) {
  const json = JSON.stringify(body);
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request("http://localhost/api/import/hangar-sync", {
      method: "POST",
      headers: {
        ...(await authHeaders(sessionToken)),
        "Content-Type": "application/json",
        "Content-Length": String(new TextEncoder().encode(json).length),
      },
      body: json,
    }),
    { ...env, ENVIRONMENT: "production" } as unknown as Parameters<typeof worker.fetch>[1],
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

async function pastRateLimit(userId: string) {
  await env.DB
    .prepare("UPDATE user_rsi_accounts SET synced_at = datetime('now', '-10 minutes') WHERE user_id = ?")
    .bind(userId)
    .run();
}

async function accountsOf(userId: string) {
  const { results } = await env.DB
    .prepare("SELECT id, rsi_handle, referral_code, label, is_primary, is_placeholder FROM user_rsi_accounts WHERE user_id = ? ORDER BY id")
    .bind(userId)
    .all<{ id: number; rsi_handle: string | null; referral_code: string | null; label: string | null; is_primary: number; is_placeholder: number }>();
  return results;
}

async function pledgeIdsOf(userId: string, accountId: number) {
  const { results } = await env.DB
    .prepare("SELECT rsi_pledge_id FROM user_pledges WHERE user_id = ? AND rsi_account_id = ? ORDER BY rsi_pledge_id")
    .bind(userId, accountId)
    .all<{ rsi_pledge_id: number }>();
  return results.map((r) => r.rsi_pledge_id);
}

describe("POST /api/import/hangar-sync — production (multi-account off)", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    await seedVehicle(env.DB, { slug: "prodma-shipa", name: "Prodma Shipa" });
  });

  it("one account + unknown identity → 409 with can_add false and the one account listed", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    expect((await prodSync(sessionToken, makePayload({ handle: "ProdAlpha", referral: "STAR-PA", pledgeIds: [3001] }))).status).toBe(200);
    const [a] = await accountsOf(userId);

    const res = await prodSync(sessionToken, makePayload({ handle: "ProdBravo", referral: "STAR-PB", pledgeIds: [3002] }));
    expect(res.status).toBe(409);
    const body = (await res.json()) as {
      error: string;
      reason: string;
      can_add: boolean;
      accounts: { id: number; rsi_handle: string | null }[];
    };
    expect(body).toMatchObject({ error: "needs_mapping", reason: "unknown", can_add: false });
    expect(body.accounts).toHaveLength(1);
    expect(body.accounts[0]).toMatchObject({ id: a.id, rsi_handle: "ProdAlpha" });
    expect(await accountsOf(userId)).toHaveLength(1);
  });

  it("target new with one account → 400", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    expect((await prodSync(sessionToken, makePayload({ handle: "ProdOne", pledgeIds: [3101] }))).status).toBe(200);

    const res = await prodSync(sessionToken, makePayload({ handle: "ProdTwo", pledgeIds: [3102], target: { mode: "new" } }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBeTruthy();
    expect(await accountsOf(userId)).toHaveLength(1);
  });

  it("renamed handle (same referral) → 409 partial, then map → 200 and handle updated", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    expect((await prodSync(sessionToken, makePayload({ handle: "ProdOld", referral: "STAR-PR", pledgeIds: [3201] }))).status).toBe(200);
    const [a] = await accountsOf(userId);

    const res = await prodSync(sessionToken, makePayload({ handle: "ProdNew", referral: "STAR-PR", pledgeIds: [3201] }));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { reason: string; candidate_id: number; can_add: boolean };
    expect(body).toMatchObject({ reason: "partial", candidate_id: a.id, can_add: false });

    await pastRateLimit(userId);
    const mapped = await prodSync(
      sessionToken,
      makePayload({ handle: "ProdNew", referral: "STAR-PR", pledgeIds: [3201], target: { mode: "map", rsi_account_id: a.id } }),
    );
    expect(mapped.status).toBe(200);
    const accounts = await accountsOf(userId);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ id: a.id, rsi_handle: "ProdNew", referral_code: "STAR-PR" });
  });

  it("sole placeholder + identity → adopted (200)", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const placeholderId = await getOrCreatePrimaryAccountId(env.DB, userId);

    const res = await prodSync(sessionToken, makePayload({ handle: "ProdAdopt", referral: "STAR-PD", pledgeIds: [3301] }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { rsi_account_id: number }).rsi_account_id).toBe(placeholderId);
    const accounts = await accountsOf(userId);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ id: placeholderId, rsi_handle: "ProdAdopt", is_placeholder: 0, label: null });
    expect(await pledgeIdsOf(userId, placeholderId)).toEqual([3301]);
  });

  it("sole placeholder without identity → 200, stays a placeholder", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const placeholderId = await getOrCreatePrimaryAccountId(env.DB, userId);

    const res = await prodSync(sessionToken, makePayload({ noAccount: true, pledgeIds: [3401] }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { rsi_account_id: number }).rsi_account_id).toBe(placeholderId);
    const accounts = await accountsOf(userId);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ id: placeholderId, rsi_handle: null, is_placeholder: 1, label: "Imported hangar" });
    expect(await pledgeIdsOf(userId, placeholderId)).toEqual([3401]);
  });
});
