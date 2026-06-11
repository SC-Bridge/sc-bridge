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

// Seed a loan row + principal entry. Returns loan_id.
// incoming: principal entry is negative (liability received); outgoing: positive (receivable given).
async function seedLoan(
  userId: string,
  overrides: Partial<{ direction: string; principal: number; started_at: string }> = {},
): Promise<number> {
  const o = { direction: "incoming", principal: 100000, started_at: "2026-06-01T00:00:00Z", ...overrides };
  const absPrincipal = Math.abs(o.principal);
  const entrySign = o.direction === "incoming" ? -1 : 1;
  const res = await env.DB.prepare(
    `INSERT INTO accountant_loans
       (user_id, direction, counterparty, principal, interest_rate, interest_interval, fee_multiplier, started_at)
     VALUES (?, ?, '@cp', ?, 0, 'daily', 0, ?)`,
  ).bind(userId, o.direction, absPrincipal, o.started_at).run();
  const loanId = res.meta.last_row_id as number;
  await env.DB.prepare(
    `INSERT INTO accountant_entries (user_id, occurred_at, amount, category, source, loan_id)
     VALUES (?, ?, ?, 'financial', 'loan_principal', ?)`,
  ).bind(userId, o.started_at, entrySign * absPrincipal, loanId).run();
  return loanId;
}

// Seed a repayment entry tied to an existing loan.
async function seedRepayment(
  userId: string,
  loanId: number,
  amount: number,
  occurred_at = "2026-06-20T00:00:00Z",
) {
  await env.DB.prepare(
    `INSERT INTO accountant_entries (user_id, occurred_at, amount, category, source, loan_id)
     VALUES (?, ?, ?, 'financial', 'loan_repayment', ?)`,
  ).bind(userId, occurred_at, amount, loanId).run();
}

async function balance(sessionToken: string, at = AT) {
  return SELF.fetch(`http://localhost/api/accountant/reports/balance?at=${at}`, { headers: await authHeaders(sessionToken) });
}

describe("Accountant — GET /reports/balance", () => {
  beforeAll(async () => { await setupTestDatabase(env.DB); });

  it("computes assets, liabilities, equity, and net worth at a timestamp", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    await seed(userId, 1200000, "assets");                                                     // asset
    await seedLoan(userId, { direction: "incoming", principal: 300000 });                     // incoming loan — liability 300k
    await seed(userId, 50000, "trading");                                                      // income (in net worth, not assets/liab line)
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

  // ── Finding 1: per-loan net liabilities ──────────────────────────────────

  it("incoming loan partially repaid: liabilities = outstanding balance (net per loan)", async () => {
    // Incoming loan: borrow 100k → entry −100k (loan_id set).
    // Repayment: pay back 40k → entry +40k (loan_id set, same loan).
    // Net on this loan = −100k + 40k = −60k → liabilities = 60k.
    const { userId, sessionToken } = await createTestUser(env.DB);
    const loanId = await seedLoan(userId, { direction: "incoming", principal: 100000 });
    await seedRepayment(userId, loanId, 40000); // positive repayment reduces liability
    const body = (await (await balance(sessionToken)).json()) as { liabilities: number; equity: number };
    expect(body.liabilities).toBe(60000);
    expect(body.equity).toBe(-60000); // no assets, just a net obligation
  });

  it("outgoing loan (lent money): contributes 0 to liabilities regardless of repayments", async () => {
    // Outgoing loan: lend 100k → entry +100k (loan_id set).
    // Repayment received: −40k (loan_id set).
    // Net = +60k → positive, so NOT a liability.
    const { userId, sessionToken } = await createTestUser(env.DB);
    const loanId = await seedLoan(userId, { direction: "outgoing", principal: 100000 });
    await seedRepayment(userId, loanId, -40000); // negative repayment on outgoing = partial receipt
    const body = (await (await balance(sessionToken)).json()) as { liabilities: number };
    expect(body.liabilities).toBe(0);
  });

  it("tactical financial entry (no loan_id): does NOT inflate liabilities", async () => {
    // Tactical investment: −80k financial entry, no loan_id.
    // This is an expense, not a loan obligation → should NOT appear as a liability.
    const { userId, sessionToken } = await createTestUser(env.DB);
    await seed(userId, -80000, "financial", "manual"); // no loan_id
    const body = (await (await balance(sessionToken)).json()) as { liabilities: number };
    expect(body.liabilities).toBe(0);
  });

  it("two loans: one incoming (net negative) + one outgoing (net positive) — only incoming counts", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const incomingId = await seedLoan(userId, { direction: "incoming", principal: 100000 });
    await seedRepayment(userId, incomingId, 25000); // net = −75k → liability 75k
    await seedLoan(userId, { direction: "outgoing", principal: 50000 }); // net = +50k → no liability
    const body = (await (await balance(sessionToken)).json()) as { liabilities: number };
    expect(body.liabilities).toBe(75000);
  });
});
