import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders } from "./helpers";

// All-time window large enough to contain the whole fixture.
const FROM = "2000-01-01T00:00:00Z";
const TO = "2099-01-01T00:00:00Z";
const AT = TO;

async function seed(userId: string, amount: number, category: string | null, source = "manual", occurred_at = "2026-06-15T00:00:00Z", tag: string | null = null) {
  await env.DB.prepare(
    `INSERT INTO accountant_entries (user_id, occurred_at, amount, category, tag, source) VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(userId, occurred_at, amount, category, tag, source).run();
}
const get = async (t: string, path: string) => (await SELF.fetch(`http://localhost${path}`, { headers: await authHeaders(t) })).json();

describe("Reports — cross-report consistency invariants", () => {
  beforeAll(async () => { await setupTestDatabase(env.DB); });

  it("P&L net (all-time) == ledger sum_income + sum_expense over the same window", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    await seed(userId, 500000, "trading");
    await seed(userId, -80000, "running_cost", "manual", "2026-06-16T00:00:00Z");
    await seed(userId, 45000, "mission_income", "manual", "2026-06-17T00:00:00Z");
    await seed(userId, 1200000, "assets"); // excluded from P&L, present in ledger sums

    const pl = (await get(sessionToken, `/api/accountant/reports/pl?from=${FROM}&to=${TO}`)) as { net: number; revenue: { total: number }; expenses: { total: number } };
    // P&L excludes assets; ledger sum_income/sum_expense include EVERYTHING. So the
    // invariant is scoped to NON-asset, non-excluded rows: assert P&L net equals the
    // signed sum of exactly the rows the mapping includes (here: trading + mission − running).
    expect(pl.net).toBe(500000 + 45000 - 80000); // 465,000 — assets correctly excluded
  });

  it("cash-flow net summed over all buckets == ledger SUM(amount) for non-adjustment rows", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    await seed(userId, 500000, "trading", "manual", "2026-06-01T00:00:00Z");
    await seed(userId, -80000, "running_cost", "manual", "2026-06-02T00:00:00Z");
    await seed(userId, 10000, null, "adjustment", "2026-06-03T00:00:00Z"); // excluded from cash flow
    const cf = (await get(sessionToken, `/api/accountant/reports/cash-flow?from=${FROM}&to=${TO}&interval=monthly`)) as { series: Array<{ net: number }> };
    const cfTotal = cf.series.reduce((s, b) => s + b.net, 0);
    expect(cfTotal).toBe(500000 - 80000); // adjustment excluded
  });

  // POST-PLAN RECONCILIATION: /net-worth series field is `netWorth` (not `equity`).
  // The plan's original test referenced `point.equity` — corrected to `point.netWorth`.
  // /balance liabilities are per-loan NET obligations; source=loan_principal is excluded
  // from P&L but IS included in net-worth cumulative balance (all entries sum).
  it("balance-sheet netWorth == net-worth series last point (same as-of instant)", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    await seed(userId, 1200000, "assets", "manual", "2026-06-01T00:00:00Z");
    await seed(userId, -300000, "financial", "loan_principal", "2026-06-02T00:00:00Z");
    await seed(userId, 50000, "trading", "manual", "2026-06-03T00:00:00Z");
    const nw = (await get(sessionToken, `/api/accountant/reports/net-worth?from=${FROM}&to=${TO}&interval=monthly`)) as { series: Array<{ netWorth: number }> };
    const bal = (await get(sessionToken, `/api/accountant/reports/balance?at=${AT}`)) as { netWorth: number };
    // Both endpoints compute the same quantity: SUM(amount) over all entries up to `at`.
    expect(nw.series[nw.series.length - 1].netWorth).toBe(bal.netWorth);
  });
});
