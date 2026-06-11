import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders } from "./helpers";

const AT = "2026-07-01T00:00:00Z";

async function seed(userId: string, amount: number, category: string | null, source = "manual", occurred_at = "2026-06-15T00:00:00Z") {
  await env.DB.prepare(
    `INSERT INTO accountant_entries (user_id, occurred_at, amount, category, source) VALUES (?, ?, ?, ?, ?)`,
  ).bind(userId, occurred_at, amount, category, source).run();
}

async function balance(sessionToken: string, at = AT) {
  return SELF.fetch(`http://localhost/api/accountant/reports/balance?at=${at}`, { headers: await authHeaders(sessionToken) });
}

describe("Accountant — GET /reports/balance", () => {
  beforeAll(async () => { await setupTestDatabase(env.DB); });

  it("computes assets, liabilities, equity, and net worth at a timestamp", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    await seed(userId, 1200000, "assets");                                  // asset
    await seed(userId, -300000, "financial", "loan_principal");             // incoming loan liability
    await seed(userId, 50000, "trading");                                   // income (in net worth, not assets/liab line)
    const res = await balance(sessionToken);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { assets: number; liabilities: number; equity: number; netWorth: number; at: string };
    expect(body.assets).toBe(1200000);
    expect(body.liabilities).toBe(300000);          // reported as positive magnitude
    expect(body.equity).toBe(1200000 - 300000);     // 900,000
    expect(body.netWorth).toBe(1200000 - 300000 + 50000); // total balance as of `at`
  });

  it("excludes entries at or after `at` (snapshot is strictly before)", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    await seed(userId, 100000, "assets", "manual", "2026-06-15T00:00:00Z");
    await seed(userId, 999999, "assets", "manual", AT);  // exactly at — excluded
    const body = (await (await balance(sessionToken)).json()) as { assets: number };
    expect(body.assets).toBe(100000);
  });

  it("rejects a missing/invalid `at` with 400", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    expect((await balance(sessionToken, "nope")).status).toBe(400);
  });
});
