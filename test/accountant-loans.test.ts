import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders } from "./helpers";

async function newLoan(sessionToken: string, body: Record<string, unknown>) {
  return SELF.fetch("http://localhost/api/accountant/loans", {
    method: "POST",
    headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const BASE = {
  direction: "outgoing",
  counterparty: "@pilot42",
  principal: 100000,
  interest_rate: 5,
  interest_interval: "monthly",
  fee_multiplier: 1.5,
  started_at: "2026-06-01T00:00:00Z",
};

describe("Accountant — loan creation + list", () => {
  beforeAll(async () => { await setupTestDatabase(env.DB); });

  it("POST /loans atomically writes loan + principal + fee entries", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const res = await newLoan(sessionToken, BASE);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; id: number };
    expect(body.ok).toBe(true);

    const loan = await env.DB.prepare("SELECT * FROM accountant_loans WHERE id = ?")
      .bind(body.id).first<{ user_id: string; status: string }>();
    expect(loan?.user_id).toBe(userId);
    expect(loan?.status).toBe("open");

    const entries = await env.DB.prepare(
      "SELECT source, amount FROM accountant_entries WHERE loan_id = ? ORDER BY source",
    ).bind(body.id).all<{ source: string; amount: number }>();
    const bySource = Object.fromEntries(entries.results.map((e) => [e.source, e.amount]));
    expect(bySource.loan_principal).toBe(100000); // outgoing → receivable (+)
    // fee = round(principal * rate/100 * multiplier) = round(100000 * 0.05 * 1.5) = 7500
    // (owner amendment 2026-06-11; matches UX thumbnail "Fee: 7,500 aUEC (booked)")
    expect(bySource.loan_fee).toBe(7500); // charged to borrower (+ on lender side)
  });

  it("incoming loan posts principal as a liability (negative)", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const res = await newLoan(sessionToken, { ...BASE, direction: "incoming" });
    const { id } = (await res.json()) as { id: number };
    const principal = await env.DB.prepare(
      "SELECT amount FROM accountant_entries WHERE loan_id = ? AND source = 'loan_principal'",
    ).bind(id).first<{ amount: number }>();
    expect(principal?.amount).toBe(-100000);
  });

  it("zero fee_multiplier books no fee entry", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const res = await newLoan(sessionToken, { ...BASE, fee_multiplier: 0 });
    const { id } = (await res.json()) as { id: number };
    const fee = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM accountant_entries WHERE loan_id = ? AND source = 'loan_fee'",
    ).bind(id).first<{ n: number }>();
    expect(fee?.n).toBe(0);
  });

  it("rejects an invalid interval with 400", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const res = await newLoan(sessionToken, { ...BASE, interest_interval: "yearly" });
    expect(res.status).toBe(400);
  });

  it("GET /loans lists with computed outstanding, accrued, nextTickAt", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    await newLoan(sessionToken, { ...BASE, fee_multiplier: 0, interest_rate: 10, interest_interval: "daily" });
    const res = await SELF.fetch("http://localhost/api/accountant/loans", {
      headers: await authHeaders(sessionToken),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      loans: Array<{ outstanding: number; accrued: number; nextTickAt: string; status: string }>;
    };
    expect(body.loans).toHaveLength(1);
    // accrual catch-up runs in the read; with a 2026-06-01 start and "now" well past,
    // outstanding has grown beyond principal and accrued > 0.
    expect(body.loans[0].outstanding).toBeGreaterThanOrEqual(100000);
    expect(body.loans[0].accrued).toBeGreaterThan(0);
    expect(typeof body.loans[0].nextTickAt).toBe("string");
  });

  it("does not leak loans across users", async () => {
    const a = await createTestUser(env.DB);
    const b = await createTestUser(env.DB);
    await newLoan(a.sessionToken, BASE);
    const res = await SELF.fetch("http://localhost/api/accountant/loans", {
      headers: await authHeaders(b.sessionToken),
    });
    const body = (await res.json()) as { loans: unknown[] };
    expect(body.loans).toHaveLength(0);
  });

  describe("GET /loans/:id — detail", () => {
    it("returns params, repayments, outstanding, and the next-tick preview", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const create = await newLoan(sessionToken, { ...BASE, fee_multiplier: 0, interest_rate: 10, interest_interval: "daily" });
      const { id } = (await create.json()) as { id: number };

      const res = await SELF.fetch(`http://localhost/api/accountant/loans/${id}`, {
        headers: await authHeaders(sessionToken),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        loan: { id: number; counterparty: string; interest_rate: number };
        outstanding: number;
        accrued: number;
        repayments: Array<{ amount: number; occurred_at: string }>;
        preview: { nextTickAt: string; projectedAmount: number; paybackTotal: number };
      };
      expect(body.loan.id).toBe(id);
      expect(body.loan.counterparty).toBe("@pilot42");
      expect(Array.isArray(body.repayments)).toBe(true);
      // preview is the UPCOMING tick only (UX §B.2): projected = round(outstanding * rate/100)
      expect(body.preview.projectedAmount).toBe(Math.round((body.outstanding * 10) / 100));
      expect(body.preview.paybackTotal).toBe(body.outstanding + body.preview.projectedAmount);
      expect(typeof body.preview.nextTickAt).toBe("string");
    });

    it("404s for another user's loan", async () => {
      const a = await createTestUser(env.DB);
      const b = await createTestUser(env.DB);
      const create = await newLoan(a.sessionToken, BASE);
      const { id } = (await create.json()) as { id: number };
      const res = await SELF.fetch(`http://localhost/api/accountant/loans/${id}`, {
        headers: await authHeaders(b.sessionToken),
      });
      expect(res.status).toBe(404);
    });

    it("404s for a non-numeric id", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const res = await SELF.fetch("http://localhost/api/accountant/loans/abc", {
        headers: await authHeaders(sessionToken),
      });
      expect(res.status).toBe(404);
    });
  });
});
