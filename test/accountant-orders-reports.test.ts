import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders } from "./helpers";

// GOLDEN NEUTRALITY FIXTURE (design §8 "report exclusion", plan Task 10):
// adjustment +1,000,000 @ 06-01 → production PO qty 100 × 1,000 (100,000
// reserved) → fulfil 40 @ 06-12 (fulfilment −40,000 + release +40,000).
// Reserve-class sources (po_reserve / po_reserve_release / workorder_summary)
// must leave P&L, cash-flow, net-worth, investment-option, and equity
// byte-identical; only the fulfilment moves the books.

const W = "from=2000-01-01T00:00:00Z&to=2099-01-01T00:00:00Z";
const AT = "2099-01-01T00:00:00Z";

async function post(token: string, path: string, body: Record<string, unknown>) {
  return SELF.fetch(`http://localhost/api/accountant${path}`, {
    method: "POST",
    headers: { ...(await authHeaders(token)), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const get = async (t: string, path: string) =>
  SELF.fetch(`http://localhost/api/accountant${path}`, { headers: await authHeaders(t) });

// Seed cash via a balance adjustment (M1 endpoint) — adjustment rows are
// already excluded from cash-flow/P&L, so the fixture baseline is clean.
async function seedBalance(token: string, amount: number) {
  const res = await post(token, "/ledger", { amount, occurred_at: "2026-06-01T00:00:00Z", adjustment: true });
  expect(res.status).toBe(200);
}

const PO = {
  type: "purchase", category: "production", item: "Laranite (raw)",
  quantity: 100, price_per_unit: 1000,                    // total 100,000
  counterparty: "@vendor", start_at: "2026-06-10T00:00:00Z",
};

interface Balance {
  cash: number; holdings: number; assets: number;
  liabilities: number; equity: number; lockedInPOs: number;
}

// The four reports a reserve must never move — raw text, so the neutrality
// assertion is byte-identical rather than field-cherry-picked.
async function reportSnapshots(token: string): Promise<string[]> {
  return [
    await (await get(token, `/reports/pl?${W}`)).text(),
    await (await get(token, `/reports/cash-flow?${W}&interval=monthly`)).text(),
    await (await get(token, `/reports/net-worth?${W}&interval=monthly`)).text(),
    await (await get(token, `/reports/investment-option?${W}`)).text(),
  ];
}
const balance = async (token: string, at = AT) =>
  (await (await get(token, `/reports/balance?at=${at}`)).json()) as Balance;

describe("M5 — reserve neutrality across every report (golden fixture)", () => {
  beforeAll(async () => { await setupTestDatabase(env.DB); });

  it("creating the PO changes NOTHING in P&L, cash-flow, net-worth, investment-option, or equity", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    await seedBalance(sessionToken, 1000000);
    const before = await reportSnapshots(sessionToken);
    const balBefore = await balance(sessionToken);
    expect(balBefore.cash).toBe(1000000);
    expect(balBefore.lockedInPOs).toBe(0);
    expect(balBefore.equity).toBe(1000000);

    expect((await post(sessionToken, "/orders", PO)).status).toBe(200);

    expect(await reportSnapshots(sessionToken)).toEqual(before);  // byte-identical
    const balAfter = await balance(sessionToken);
    expect(balAfter.cash).toBe(900000);          // reserve is a real negative row inside cash
    expect(balAfter.lockedInPOs).toBe(100000);   // … but earmarked, not spent
    expect(balAfter.equity).toBe(1000000);       // cash + holdings + lockedInPOs — no dip on a mere lock
  });

  it("after the partial fulfilment the books move by the FULFILMENT only", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    await seedBalance(sessionToken, 1000000);
    const res = await post(sessionToken, "/orders", PO);
    const { id } = (await res.json()) as { id: number };
    expect((await post(sessionToken, `/orders/${id}/fulfillments`, {
      quantity: 40, occurred_at: "2026-06-12T00:00:00Z",
    })).status).toBe(200);

    // Release excluded; fulfilment included.
    const cf = (await (await get(sessionToken, `/reports/cash-flow?${W}&interval=monthly`)).json()) as {
      series: Array<{ net: number }>;
    };
    expect(cf.series.reduce((s, b) => s + b.net, 0)).toBe(-40000);

    // Ledger deltas: −100,000 reserve − 40,000 fulfilment + 40,000 release → cash 900,000.
    // (The plan narrative's "860,000" contradicts its own deltas and equity golden.)
    const bal = await balance(sessionToken);
    expect(bal.cash).toBe(900000);
    expect(bal.lockedInPOs).toBe(60000);
    expect(bal.equity).toBe(960000);             // = cash + holdings + lockedInPOs — the new identity

    // Cross-report invariant survives: net-worth last point == balance.equity.
    const nw = (await (await get(sessionToken, `/reports/net-worth?${W}&interval=monthly`)).json()) as {
      series: Array<{ netWorth: number }>;
    };
    expect(nw.series[nw.series.length - 1].netWorth).toBe(960000);

    // P&L: production_invest −40,000 (per-tag), revenue untouched.
    const pl = (await (await get(sessionToken, `/reports/pl?${W}`)).json()) as {
      revenue: { total: number };
      expenses: { lines: Array<{ line: string; value: number }> };
    };
    expect(pl.revenue.total).toBe(0);
    expect(pl.expenses.lines.find((l) => l.line === "production_invest")?.value).toBe(-40000);
  });

  it("workorder_summary is excluded everywhere (0-amount, but pinned by source)", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    await seedBalance(sessionToken, 1000000);
    const before = await reportSnapshots(sessionToken);
    const balBefore = await balance(sessionToken);
    // 0-amount by design (a valued summary would double-count) — placed in a
    // month with no other entries, so without the SOURCE exclusion it would
    // mint a new zero bucket in the cash-flow and net-worth series.
    await env.DB.prepare(
      `INSERT INTO accountant_entries (user_id, occurred_at, amount, category, source)
       VALUES (?, '2026-07-20T00:00:00Z', 0, NULL, 'workorder_summary')`,
    ).bind(userId).run();
    expect(await reportSnapshots(sessionToken)).toEqual(before);
    expect(await balance(sessionToken)).toEqual(balBefore);
  });

  it("trading PURCHASE fulfilments stay off the P&L (locked B.3 'no purchases line' — inherited, finding 4)", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    await seedBalance(sessionToken, 1000000);
    const res = await post(sessionToken, "/orders", {
      ...PO, category: "trading", tag: "minerals", item: "Laranite", quantity: 10,  // total 10,000
    });
    const { id } = (await res.json()) as { id: number };
    const plBefore = await (await get(sessionToken, `/reports/pl?${W}`)).text();
    expect((await post(sessionToken, `/orders/${id}/fulfillments`, {
      quantity: 10, occurred_at: "2026-06-12T00:00:00Z",
    })).status).toBe(200);
    // −10,000 trading fulfilment classifies through the EXISTING rules → null.
    expect(await (await get(sessionToken, `/reports/pl?${W}`)).text()).toBe(plBefore);
  });

  it("/balance gains lockedInPOs and preserves assets = equity + liabilities", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    await seedBalance(sessionToken, 1000000);
    expect((await post(sessionToken, "/orders", PO)).status).toBe(200);

    const bal = await balance(sessionToken);
    expect(bal.lockedInPOs).toBe(100000);
    expect(bal.assets).toBe(bal.equity + bal.liabilities);
    expect(bal.equity).toBe(bal.cash + bal.holdings + bal.lockedInPOs);

    // Snapshot semantics: lockedInPOs honors the same `occurred_at < at` cutoff
    // as cash — the reserve row (posted at server-now) is invisible at a
    // pre-PO instant, so equity stays consistent at every `at`.
    const early = await balance(sessionToken, "2026-06-05T00:00:00Z");
    expect(early.cash).toBe(1000000);
    expect(early.lockedInPOs).toBe(0);
    expect(early.equity).toBe(1000000);
  });
});
