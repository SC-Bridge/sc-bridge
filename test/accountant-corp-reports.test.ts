import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders } from "./helpers";

async function makeOrg(id: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO organization (id, name, slug, createdAt) VALUES (?, 'Corp', ?, '2026-06-01T00:00:00Z')`,
  ).bind(id, id).run();
}
async function addMember(orgId: string, userId: string, role: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO member (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, ?, '2026-06-01T00:00:00Z')`,
  ).bind(crypto.randomUUID(), orgId, userId, role).run();
}
async function setMode(token: string, orgId: string | null) {
  return SELF.fetch("http://localhost/api/accountant/mode", {
    method: "PUT",
    headers: { ...(await authHeaders(token)), "Content-Type": "application/json" },
    body: JSON.stringify({ orgId }),
  });
}
async function addEntry(token: string, body: Record<string, unknown>) {
  return SELF.fetch("http://localhost/api/accountant/ledger", {
    method: "POST",
    headers: { ...(await authHeaders(token)), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function report(token: string, path: string) {
  return (await SELF.fetch(`http://localhost/api/accountant/reports/${path}`, {
    headers: await authHeaders(token),
  })).json();
}

const FROM = "2026-06-01T00:00:00Z";
const TO = "2026-07-01T00:00:00Z";
const AT = "2026-07-01T00:00:00Z";
const income = (amount: number, desc: string) => ({
  amount, category: "trading", occurred_at: "2026-06-10T00:00:00Z", description: desc,
});
const expense = (amount: number, desc: string) => ({
  amount, category: "running_cost", occurred_at: "2026-06-10T00:00:00Z", description: desc,
});

describe("Corp reports — corp rows never leak into private reports (and vice versa)", () => {
  beforeAll(async () => { await setupTestDatabase(env.DB); });

  it("all five reports render only in-scope rows for private vs corp", async () => {
    const owner = await createTestUser(env.DB);
    const orgId = `org-${crypto.randomUUID().slice(0, 8)}`;
    await makeOrg(orgId);
    await addMember(orgId, owner.userId, "owner");

    // Private: +10,000 income, -3,000 expense → net 7,000.
    await setMode(owner.sessionToken, null);
    await addEntry(owner.sessionToken, income(10_000, "priv-income"));
    await addEntry(owner.sessionToken, expense(-3_000, "priv-expense"));

    // Corp: +50,000 income only.
    await setMode(owner.sessionToken, orgId);
    await addEntry(owner.sessionToken, income(50_000, "corp-income"));

    // ── Private reports must exclude the corp 50,000 ──────────────────────────
    await setMode(owner.sessionToken, null);
    const privPl = (await report(owner.sessionToken, `pl?from=${FROM}&to=${TO}`)) as {
      revenue: { total: number }; expenses: { total: number }; net: number;
    };
    expect(privPl.revenue.total).toBe(10_000);
    expect(privPl.expenses.total).toBe(-3_000);
    expect(privPl.net).toBe(7_000);

    const privBal = (await report(owner.sessionToken, `balance?at=${AT}`)) as { cash: number };
    expect(privBal.cash).toBe(7_000);

    const privNw = (await report(owner.sessionToken, `net-worth?from=${FROM}&to=${TO}`)) as {
      series: Array<{ netWorth: number }>;
    };
    expect(privNw.series.at(-1)?.netWorth).toBe(7_000);

    const privCf = (await report(owner.sessionToken, `cash-flow?from=${FROM}&to=${TO}`)) as {
      series: Array<{ in: number; out: number }>;
    };
    const privIn = privCf.series.reduce((s, b) => s + b.in, 0);
    const privOut = privCf.series.reduce((s, b) => s + b.out, 0);
    expect(privIn).toBe(10_000);
    expect(privOut).toBe(-3_000);

    const privInv = (await report(owner.sessionToken, `investment-option?from=${FROM}&to=${TO}`)) as {
      cashFlowNet: number;
    };
    expect(privInv.cashFlowNet).toBe(7_000);

    // ── Corp reports must include ONLY the corp 50,000 ────────────────────────
    await setMode(owner.sessionToken, orgId);
    const corpPl = (await report(owner.sessionToken, `pl?from=${FROM}&to=${TO}`)) as {
      revenue: { total: number }; expenses: { total: number }; net: number;
    };
    expect(corpPl.revenue.total).toBe(50_000);
    expect(corpPl.expenses.total).toBe(0);
    expect(corpPl.net).toBe(50_000);

    const corpBal = (await report(owner.sessionToken, `balance?at=${AT}`)) as { cash: number; equity: number };
    expect(corpBal.cash).toBe(50_000);
    // Cross-report invariant holds per-scope: balance.equity == net-worth last bucket.
    const corpNw = (await report(owner.sessionToken, `net-worth?from=${FROM}&to=${TO}`)) as {
      series: Array<{ netWorth: number }>;
    };
    expect(corpNw.series.at(-1)?.netWorth).toBe(corpBal.equity);

    const corpInv = (await report(owner.sessionToken, `investment-option?from=${FROM}&to=${TO}`)) as {
      cashFlowNet: number;
    };
    expect(corpInv.cashFlowNet).toBe(50_000);
  });

  it("a second member's corp entries appear in the org-wide corp report", async () => {
    const owner = await createTestUser(env.DB);
    const admin = await createTestUser(env.DB);
    const orgId = `org-${crypto.randomUUID().slice(0, 8)}`;
    await makeOrg(orgId);
    await addMember(orgId, owner.userId, "owner");
    await addMember(orgId, admin.userId, "admin");

    await setMode(owner.sessionToken, orgId);
    await addEntry(owner.sessionToken, income(20_000, "owner-corp"));
    await setMode(admin.sessionToken, orgId);
    await addEntry(admin.sessionToken, income(30_000, "admin-corp"));

    // Either manager sees the org-wide 50,000 total.
    const pl = (await report(owner.sessionToken, `pl?from=${FROM}&to=${TO}`)) as {
      revenue: { total: number };
    };
    expect(pl.revenue.total).toBe(50_000);
  });
});
