import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders } from "./helpers";
import { catchUpAccruals } from "../src/lib/accountant/accrual";

async function newLoan(sessionToken: string, body: Record<string, unknown>) {
  return SELF.fetch("http://localhost/api/accountant/loans", {
    method: "POST",
    headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function forgive(sessionToken: string, id: number, body: Record<string, unknown>) {
  return SELF.fetch(`http://localhost/api/accountant/loans/${id}/forgive`, {
    method: "POST",
    headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// interest_rate 0 → outstanding stays exactly at principal, immune to run date.
const BASE = {
  direction: "outgoing",
  counterparty: "@pilot42",
  principal: 100000,
  interest_rate: 0,
  interest_interval: "monthly",
  fee_multiplier: 0,
  started_at: "2026-06-01T00:00:00Z",
};

describe("M2 amendment — loan partial forgiveness", () => {
  beforeAll(async () => { await setupTestDatabase(env.DB); });

  it("OUTGOING loan: forgiving 40,000 posts a −40,000 loan_forgiveness entry; outstanding 100,000 → 60,000", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const create = await newLoan(sessionToken, BASE);
    const { id } = (await create.json()) as { id: number };

    const res = await forgive(sessionToken, id, { amount: 40000 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; settled: boolean; outstanding: number };
    expect(body.ok).toBe(true);
    expect(body.settled).toBe(false);
    expect(body.outstanding).toBe(60000);

    // Entry sign is OPPOSITE the +100,000 receivable — you eat the loss.
    const entry = await env.DB.prepare(
      "SELECT amount, category, source, loan_id FROM accountant_entries WHERE loan_id = ? AND source = 'loan_forgiveness'",
    ).bind(id).first<{ amount: number; category: string; source: string; loan_id: number }>();
    expect(entry?.amount).toBe(-40000);
    expect(entry?.category).toBe("financial");
    expect(entry?.loan_id).toBe(id);
  });

  it("INCOMING loan: forgiving 40,000 posts a +40,000 entry (debt relief); |outstanding| → 60,000", async () => {
    // THE M2 DOUBLE-NEGATION PIN — both directions fixed by fixture (design §5.6).
    const { sessionToken } = await createTestUser(env.DB);
    const create = await newLoan(sessionToken, { ...BASE, direction: "incoming" });
    const { id } = (await create.json()) as { id: number };

    const res = await forgive(sessionToken, id, { amount: 40000 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; settled: boolean; outstanding: number };
    expect(body.settled).toBe(false);
    expect(body.outstanding).toBe(60000);

    const entry = await env.DB.prepare(
      "SELECT amount FROM accountant_entries WHERE loan_id = ? AND source = 'loan_forgiveness'",
    ).bind(id).first<{ amount: number }>();
    expect(entry?.amount).toBe(40000); // your position improves — debt relief (+)
  });

  it("forgiveness landing outstanding on exactly 0 auto-settles (repayment parity)", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const create = await newLoan(sessionToken, BASE);
    const { id } = (await create.json()) as { id: number };

    const res = await forgive(sessionToken, id, { amount: 100000 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; settled: boolean; outstanding: number };
    expect(body.settled).toBe(true);
    expect(body.outstanding).toBe(0);

    const loan = await env.DB.prepare("SELECT status FROM accountant_loans WHERE id = ?")
      .bind(id).first<{ status: string }>();
    expect(loan?.status).toBe("settled");
  });

  it("over-forgiveness → 400 echoing outstanding", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const create = await newLoan(sessionToken, BASE);
    const { id } = (await create.json()) as { id: number };

    const res = await forgive(sessionToken, id, { amount: 100001 });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; outstanding: number };
    expect(body.error).toBeTruthy();
    expect(body.outstanding).toBe(100000);
  });

  it("subsequent accrual ticks compound on the REDUCED outstanding (forgiveness reduces future interest)", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    // 10% daily, started 1 hour ago → no tick due yet at forgiveness time.
    const started_at = new Date(Date.now() - 3600_000).toISOString();
    const create = await newLoan(sessionToken, {
      ...BASE, interest_rate: 10, interest_interval: "daily", started_at,
    });
    const { id } = (await create.json()) as { id: number };

    // Forgive 50,000 via the API (entry occurred_at ≈ now, well before tick 1's timestamp).
    const res = await forgive(sessionToken, id, { amount: 50000 });
    expect(res.status).toBe(200);

    // Direct engine call with the injectable clock: advance past tick 1.
    const startedMs = new Date(started_at).getTime();
    await catchUpAccruals(env.DB, userId, startedMs + 86400_000 + 1000);

    const tick = await env.DB.prepare(
      "SELECT amount FROM accountant_entries WHERE loan_id = ? AND source = 'accrual_tick' AND tick_index = 1",
    ).bind(id).first<{ amount: number }>();
    // Base = 100,000 − 50,000 forgiven = 50,000 → tick = round(50000 * 0.10) = 5,000 (NOT 10,000).
    expect(tick?.amount).toBe(5000);
  });

  it("forgiveness rejected on a settled loan; foreign user → 404; amount must be a positive integer", async () => {
    const a = await createTestUser(env.DB);
    const b = await createTestUser(env.DB);

    // Settled loan → 400.
    const settledCreate = await newLoan(a.sessionToken, BASE);
    const { id: settledId } = (await settledCreate.json()) as { id: number };
    expect((await forgive(a.sessionToken, settledId, { amount: 100000 })).status).toBe(200); // auto-settles
    const onSettled = await forgive(a.sessionToken, settledId, { amount: 1 });
    expect(onSettled.status).toBe(400);
    const settledBody = (await onSettled.json()) as { error: string };
    expect(settledBody.error).toBe("Loan already settled");

    // Foreign user → 404.
    const openCreate = await newLoan(a.sessionToken, BASE);
    const { id: openId } = (await openCreate.json()) as { id: number };
    expect((await forgive(b.sessionToken, openId, { amount: 1 })).status).toBe(404);

    // amount must be a positive integer.
    expect((await forgive(a.sessionToken, openId, { amount: 0 })).status).toBe(400);
    expect((await forgive(a.sessionToken, openId, { amount: -5000 })).status).toBe(400);
    expect((await forgive(a.sessionToken, openId, { amount: 1.5 })).status).toBe(400);
    expect((await forgive(a.sessionToken, openId, {})).status).toBe(400);
  });

  it("loan_forgiveness entries are immutable via ledger endpoints (loan_id guard covers the new source)", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const create = await newLoan(sessionToken, BASE);
    const { id } = (await create.json()) as { id: number };
    await forgive(sessionToken, id, { amount: 40000 });

    const entry = await env.DB.prepare(
      "SELECT id FROM accountant_entries WHERE loan_id = ? AND source = 'loan_forgiveness'",
    ).bind(id).first<{ id: number }>();

    const put = await SELF.fetch(`http://localhost/api/accountant/ledger/${entry!.id}`, {
      method: "PUT",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "tamper" }),
    });
    expect(put.status).toBe(400);
  });

  it("P&L: outgoing forgiveness shows as 'forgiveness_loss' expense; incoming as 'debt_relief' revenue", async () => {
    // All-time window — forgiveness entries post at server now.
    const qs = "from=2020-01-01T00:00:00Z&to=2099-01-01T00:00:00Z";

    // Incoming-forgiveness user → debt_relief revenue.
    const inc = await createTestUser(env.DB);
    const incCreate = await newLoan(inc.sessionToken, { ...BASE, direction: "incoming" });
    const { id: incId } = (await incCreate.json()) as { id: number };
    await forgive(inc.sessionToken, incId, { amount: 40000 });
    const incPl = (await (await SELF.fetch(`http://localhost/api/accountant/reports/pl?${qs}`, {
      headers: await authHeaders(inc.sessionToken),
    })).json()) as { revenue: { lines: Array<{ line: string; value: number }> } };
    const relief = incPl.revenue.lines.find((l) => l.line === "debt_relief");
    expect(relief?.value).toBe(40000);

    // Outgoing-forgiveness user → forgiveness_loss expense.
    const out = await createTestUser(env.DB);
    const outCreate = await newLoan(out.sessionToken, BASE);
    const { id: outId } = (await outCreate.json()) as { id: number };
    await forgive(out.sessionToken, outId, { amount: 40000 });
    const outPl = (await (await SELF.fetch(`http://localhost/api/accountant/reports/pl?${qs}`, {
      headers: await authHeaders(out.sessionToken),
    })).json()) as { expenses: { lines: Array<{ line: string; value: number }> } };
    const loss = outPl.expenses.lines.find((l) => l.line === "forgiveness_loss");
    expect(loss?.value).toBe(-40000);
  });
});
