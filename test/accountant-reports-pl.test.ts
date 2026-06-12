import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders } from "./helpers";
import { classifyPLLine, STATEMENT_LINES } from "../src/lib/accountant/constants";

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
      expenses: { lines: Array<{ line: string; value: number; tag?: string; drill: Record<string, string> }>; total: number };
      net: number;
    };
    expect(body.revenue.total).toBe(4200000 + 320000 + 45000); // 4,565,000
    expect(body.expenses.total).toBe(-(280000 + 42000 + 1400000 + 80000)); // −1,802,000
    expect(body.net).toBe(body.revenue.total + body.expenses.total); // +2,763,000

    // running cost is broken out PER TAG
    const rcTags = body.expenses.lines.filter((l) => l.line === "running_cost").map((l) => l.tag).sort();
    expect(rcTags).toEqual(["player_consumables", "ship_consumables"]);

    // each revenue line carries a drill-down filter (category + period at minimum);
    // the window echoes NORMALIZED UTC (isoDatetime) — the exact bounds the
    // report queried with, which the ledger drill-down reuses verbatim.
    const trading = body.revenue.lines.find((l) => l.line === "trading_income");
    expect(trading?.drill.category).toBe("trading");
    expect(trading?.drill.from).toBe(new Date(FROM).toISOString());
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

  // ── Finding 2: SQL vs classifier cross-check ─────────────────────────────
  // Seed every category (both signs), every source, all loan sources,
  // accrual ticks, and untagged + tagged rows; then assert that each P&L
  // line value from the API equals what classifyPLLine produces over the same entries.

  it("SQL aggregation matches classifyPLLine for a broad mixed fixture", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);

    // Comprehensive fixture covering every branch in classifyPLLine.
    const entries = [
      // trading — only positives appear on P&L (locked UX B.3)
      { amount: 500000, category: "trading" as const, source: "parsed" as const, tag: "minerals" },
      { amount: -50000, category: "trading" as const, source: "parsed" as const, tag: "minerals" }, // excluded (negative trading)
      // production income + investment
      { amount: 200000, category: "production" as const, source: "manual" as const, tag: "general" },
      { amount: -150000, category: "production" as const, source: "manual" as const, tag: "specified" },
      // mission income
      { amount: 75000, category: "mission_income" as const, source: "parsed" as const, tag: null },
      // running cost (per-tag)
      { amount: -30000, category: "running_cost" as const, source: "manual" as const, tag: "ship_consumables" },
      { amount: -10000, category: "running_cost" as const, source: "manual" as const, tag: "player_consumables" },
      // financial/tactical (negative, not loan-linked)
      { amount: -80000, category: "financial" as const, source: "manual" as const, tag: "tactical" },
      // interest income/expense (source-keyed)
      { amount: 12000, category: "financial" as const, source: "accrual_tick" as const, tag: null },
      { amount: -3000, category: "financial" as const, source: "loan_fee" as const, tag: null },
      // excluded sources — must NOT appear on P&L
      { amount: 999999, category: "assets" as const, source: "manual" as const, tag: null },
      { amount: 5000, category: null, source: "adjustment" as const, tag: null },
      { amount: -100000, category: "financial" as const, source: "loan_principal" as const, tag: null },
      { amount: 40000, category: "financial" as const, source: "loan_repayment" as const, tag: null },
    ] as const;

    for (const e of entries) await seed(userId, e);

    const res = await pl(sessionToken);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      revenue: { lines: Array<{ line: string; value: number; tag?: string }>; total: number };
      expenses: { lines: Array<{ line: string; value: number; tag?: string }>; total: number };
      net: number;
    };

    // Compute expected line values client-side via classifyPLLine.
    const expected = new Map<string, number>(); // "line" or "line|tag" → value
    for (const e of entries) {
      const result = classifyPLLine({ category: e.category, amount: e.amount, source: e.source, tag: e.tag });
      if (!result) continue;
      const spec = STATEMENT_LINES.find((s) => s.line === result.line);
      const key = spec?.perTag ? `${result.line}|${e.tag ?? ""}` : result.line;
      expected.set(key, (expected.get(key) ?? 0) + e.amount);
    }

    // Verify every line the API returns matches the classifier-computed value.
    const allLines = [...body.revenue.lines, ...body.expenses.lines];
    for (const l of allLines) {
      const spec = STATEMENT_LINES.find((s) => s.line === l.line);
      const key = spec?.perTag ? `${l.line}|${l.tag ?? ""}` : l.line;
      const exp = expected.get(key) ?? 0;
      expect(l.value, `line=${l.line} tag=${l.tag ?? "null"}`).toBe(exp);
    }

    // Also verify both totals are consistent.
    const expRevenueTotal = [...expected.entries()]
      .filter(([k]) => {
        const lineName = k.split("|")[0];
        return STATEMENT_LINES.find((s) => s.line === lineName)?.section === "revenue";
      })
      .reduce((s, [, v]) => s + v, 0);
    const expExpensesTotal = [...expected.entries()]
      .filter(([k]) => {
        const lineName = k.split("|")[0];
        return STATEMENT_LINES.find((s) => s.line === lineName)?.section === "expenses";
      })
      .reduce((s, [, v]) => s + v, 0);

    expect(body.revenue.total).toBe(expRevenueTotal);
    expect(body.expenses.total).toBe(expExpensesTotal);
    expect(body.net).toBe(expRevenueTotal + expExpensesTotal);
  });

  // ── Finding 3: tactical drill shape — category=financial, NO tag ─────────

  it("tactical drill carries category=financial and NO tag field (over-show is accepted)", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    // Mix: one tagged "tactical" entry + one untagged financial entry (custom use-case).
    // Both should roll into the single tactical line; drill must NOT filter to tag=tactical.
    await seed(userId, { amount: -60000, category: "financial", tag: "tactical" });
    await seed(userId, { amount: -20000, category: "financial", tag: null });

    const body = (await (await pl(sessionToken)).json()) as {
      expenses: { lines: Array<{ line: string; value: number; drill: Record<string, string> }> };
    };
    const tacticalLine = body.expenses.lines.find((l) => l.line === "tactical");
    expect(tacticalLine).toBeDefined();
    expect(tacticalLine?.value).toBe(-80000);       // both entries summed
    expect(tacticalLine?.drill.category).toBe("financial");
    expect(tacticalLine?.drill.tag).toBeUndefined(); // no tag filter — over-show accepted
  });
});
