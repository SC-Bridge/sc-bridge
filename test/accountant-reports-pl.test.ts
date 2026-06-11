import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders } from "./helpers";

const FROM = "2026-06-01T00:00:00Z";
const TO = "2026-07-01T00:00:00Z";

// Insert a ledger entry directly (reports are read-only; we seed the books).
async function seed(userId: string, e: {
  amount: number; category: string | null; source?: string; tag?: string | null;
  occurred_at?: string;
}) {
  await env.DB.prepare(
    `INSERT INTO accountant_entries (user_id, occurred_at, amount, category, tag, source)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(
    userId, e.occurred_at ?? "2026-06-15T12:00:00Z", e.amount,
    e.category, e.tag ?? null, e.source ?? "manual",
  ).run();
}

async function pl(sessionToken: string, qs = `from=${FROM}&to=${TO}`) {
  return SELF.fetch(`http://localhost/api/accountant/reports/pl?${qs}`, {
    headers: await authHeaders(sessionToken),
  });
}

describe("Accountant — GET /reports/pl", () => {
  beforeAll(async () => { await setupTestDatabase(env.DB); });

  it("rolls revenue and expenses into STATEMENT_LINES sections with a hand-computed net", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    await seed(userId, { amount: 4200000, category: "trading", tag: "minerals", source: "parsed" });
    await seed(userId, { amount: 320000, category: "production" }); // production income (+)
    await seed(userId, { amount: 45000, category: "mission_income" });
    await seed(userId, { amount: -280000, category: "running_cost", tag: "ship_consumables" });
    await seed(userId, { amount: -42000, category: "running_cost", tag: "player_consumables" });
    await seed(userId, { amount: -1400000, category: "production", tag: "specified" }); // production invest (−)
    await seed(userId, { amount: -80000, category: "financial", tag: "tactical" });
    // EXCLUDED from P&L — must NOT move the net:
    await seed(userId, { amount: 1200000, category: "assets" });            // balance sheet
    await seed(userId, { amount: 5000, category: null, source: "adjustment" }); // equity correction

    const res = await pl(sessionToken);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      revenue: { lines: Array<{ line: string; label: string; value: number; tag?: string; drill: Record<string, string> }>; total: number };
      expenses: { lines: Array<{ line: string; value: number; tag?: string }>; total: number };
      net: number;
    };
    expect(body.revenue.total).toBe(4200000 + 320000 + 45000); // 4,565,000
    expect(body.expenses.total).toBe(-(280000 + 42000 + 1400000 + 80000)); // −1,802,000
    expect(body.net).toBe(body.revenue.total + body.expenses.total); // +2,763,000

    // running cost is broken out PER TAG
    const rcTags = body.expenses.lines.filter((l) => l.line === "running_cost").map((l) => l.tag).sort();
    expect(rcTags).toEqual(["player_consumables", "ship_consumables"]);

    // each revenue line carries a drill-down filter (category + period at minimum)
    const trading = body.revenue.lines.find((l) => l.line === "trading_income");
    expect(trading?.drill.category).toBe("trading");
    expect(trading?.drill.from).toBe(FROM);
  });

  it("includes accrual_tick / loan_fee as interest income/expense (presentation cross-cutting)", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    await seed(userId, { amount: 15000, category: "financial", source: "accrual_tick", occurred_at: "2026-06-10T00:00:00Z" });
    await seed(userId, { amount: -2000, category: "financial", source: "loan_fee", occurred_at: "2026-06-02T00:00:00Z" });
    const body = (await (await pl(sessionToken)).json()) as {
      revenue: { lines: Array<{ line: string; value: number }> };
      expenses: { lines: Array<{ line: string; value: number }> };
    };
    expect(body.revenue.lines.find((l) => l.line === "interest_income")?.value).toBe(15000);
    expect(body.expenses.lines.find((l) => l.line === "interest_expense")?.value).toBe(-2000);
  });

  it("respects the half-open period: an entry at exactly `to` is EXCLUDED", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    await seed(userId, { amount: 100000, category: "trading", occurred_at: "2026-06-15T00:00:00Z" }); // in window
    await seed(userId, { amount: 999999, category: "trading", occurred_at: TO });                    // at `to` — excluded
    const body = (await (await pl(sessionToken)).json()) as { revenue: { total: number } };
    expect(body.revenue.total).toBe(100000);
  });

  it("rejects a missing/invalid from or to with 400", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    expect((await pl(sessionToken, "from=not-a-date&to=" + TO)).status).toBe(400);
  });

  it("does not leak another user's entries", async () => {
    const a = await createTestUser(env.DB);
    const b = await createTestUser(env.DB);
    await seed(a.userId, { amount: 500000, category: "trading" });
    const body = (await (await pl(b.sessionToken)).json()) as { revenue: { total: number } };
    expect(body.revenue.total).toBe(0);
  });
});
