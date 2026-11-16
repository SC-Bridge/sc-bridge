import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders, seedVehicle } from "./helpers";
import { createRsiAccount, parseAccountsParam } from "../src/lib/rsi-accounts";

interface Analysis {
  overview: { total_vehicles: number; total_pledge_value: number; total_melt_value: number | null };
  insurance_summary: {
    lti_ships: Array<{ ship_name: string; rsi_account_id?: number }>;
    non_lti_ships: Array<{ ship_name: string; rsi_account_id?: number }>;
    unknown_ships: Array<{ ship_name: string; rsi_account_id?: number }>;
  };
}

let seq = 0;

async function seedAccount(userId: string): Promise<number> {
  seq++;
  return createRsiAccount(env.DB, userId, { handle: `acct${seq}`, referralCode: null, placeholder: false });
}

async function seedShip(userId: string, accountId: number, name: string): Promise<void> {
  seq++;
  const vehicleId = await seedVehicle(env.DB, { slug: `an-acct-${seq}`, name });
  await env.DB
    .prepare(
      `INSERT INTO user_fleet (user_id, vehicle_id, is_loaner, warbond, imported_at, rsi_account_id)
       VALUES (?, ?, 0, 0, datetime('now'), ?)`,
    )
    .bind(userId, vehicleId, accountId)
    .run();
}

async function seedPledge(userId: string, accountId: number, cents: number, reclaimable: number): Promise<void> {
  seq++;
  await env.DB
    .prepare("INSERT INTO user_hangar_syncs (user_id, source) VALUES (?, 'extension')")
    .bind(userId)
    .run();
  const sync = await env.DB
    .prepare("SELECT id FROM user_hangar_syncs WHERE user_id = ? ORDER BY id DESC LIMIT 1")
    .bind(userId)
    .first<{ id: number }>();
  await env.DB
    .prepare(
      `INSERT INTO user_pledges (user_id, sync_id, rsi_pledge_id, name, value, value_cents, currency, is_upgraded, is_reclaimable, rsi_account_id)
       VALUES (?, ?, ?, 'Pledge', '$0', ?, 'USD', 0, ?, ?)`,
    )
    .bind(userId, sync!.id, 9000 + seq, cents, reclaimable, accountId)
    .run();
}

async function getAnalysis(token: string, query = ""): Promise<Analysis> {
  const res = await SELF.fetch(`http://localhost/api/analysis${query}`, { headers: await authHeaders(token) });
  expect(res.status).toBe(200);
  return (await res.json()) as Analysis;
}

const shipNames = (a: Analysis) =>
  [...a.insurance_summary.lti_ships, ...a.insurance_summary.non_lti_ships, ...a.insurance_summary.unknown_ships]
    .map((s) => s.ship_name)
    .sort();

describe("Analysis scoped to accounts", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  async function twoAccountUser() {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const a = await seedAccount(userId);
    const b = await seedAccount(userId);
    await seedShip(userId, a, "Alpha Ship");
    await seedShip(userId, b, "Bravo Ship");
    await seedPledge(userId, a, 10000, 1);
    await seedPledge(userId, b, 25000, 0);
    return { userId, sessionToken, a, b };
  }

  it("no accounts param means all accounts", async () => {
    const { sessionToken } = await twoAccountUser();
    const body = await getAnalysis(sessionToken);
    expect(body.overview.total_vehicles).toBe(2);
    expect(shipNames(body)).toEqual(["Alpha Ship", "Bravo Ship"]);
    expect(body.overview.total_pledge_value).toBe(350);
    expect((await getAnalysis(sessionToken, "?accounts=all")).overview.total_vehicles).toBe(2);
  });

  it("totals follow the account selection", async () => {
    const { sessionToken, a, b } = await twoAccountUser();
    const onlyA = await getAnalysis(sessionToken, `?accounts=${a}`);
    expect(onlyA.overview.total_vehicles).toBe(1);
    expect(shipNames(onlyA)).toEqual(["Alpha Ship"]);
    expect(onlyA.overview.total_pledge_value).toBe(100);
    expect(onlyA.overview.total_melt_value).toBe(100);
    const onlyB = await getAnalysis(sessionToken, `?accounts=${b}`);
    expect(shipNames(onlyB)).toEqual(["Bravo Ship"]);
    expect(onlyB.overview.total_pledge_value).toBe(250);
    expect(onlyB.overview.total_melt_value).toBe(0);
  });

  it("carries rsi_account_id onto insurance rows", async () => {
    const { sessionToken, a, b } = await twoAccountUser();
    const body = await getAnalysis(sessionToken);
    const rows = [...body.insurance_summary.unknown_ships, ...body.insurance_summary.non_lti_ships, ...body.insurance_summary.lti_ships];
    expect(rows.find((r) => r.ship_name === "Alpha Ship")?.rsi_account_id).toBe(a);
    expect(rows.find((r) => r.ship_name === "Bravo Ship")?.rsi_account_id).toBe(b);
  });

  it("the pledge_cost fallback follows the account selection", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const a = await seedAccount(userId);
    const b = await seedAccount(userId);
    await seedShip(userId, a, "Cost A");
    await seedShip(userId, b, "Cost B");
    await env.DB
      .prepare("UPDATE user_fleet SET pledge_cost = CASE rsi_account_id WHEN ? THEN '$60.00' ELSE '$40.00' END WHERE user_id = ?")
      .bind(a, userId)
      .run();
    expect((await getAnalysis(sessionToken)).overview.total_pledge_value).toBe(100);
    expect((await getAnalysis(sessionToken, `?accounts=${a}`)).overview.total_pledge_value).toBe(60);
  });

  it("ignores another user's account id", async () => {
    const { sessionToken } = await twoAccountUser();
    const other = await twoAccountUser();
    const body = await getAnalysis(sessionToken, `?accounts=${other.a}`);
    expect(body.overview.total_vehicles).toBe(0);
    expect(body.overview.total_pledge_value).toBe(0);
    expect(shipNames(body)).toEqual([]);
  });
});

describe("parseAccountsParam", () => {
  it("treats missing, empty and 'all' as all accounts", () => {
    expect(parseAccountsParam(undefined)).toBeNull();
    expect(parseAccountsParam("")).toBeNull();
    expect(parseAccountsParam("all")).toBeNull();
  });
  it("keeps positive integers, deduplicated, in order", () => {
    expect(parseAccountsParam("3,1,3")).toEqual([3, 1]);
  });
  it("returns null when nothing valid remains", () => {
    expect(parseAccountsParam("x,0,-2")).toBeNull();
  });
  it("caps at the first 10 ids", () => {
    expect(parseAccountsParam("1,2,3,4,5,6,7,8,9,10,11")).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
