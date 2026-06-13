import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders } from "./helpers";

describe("Account deletion — accountant tables", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  it("deletes accountant entries, loans, and tags with the account", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const loanInsert = await env.DB.prepare(
      `INSERT INTO accountant_loans (user_id, direction, counterparty, principal, interest_rate, interest_interval, started_at)
       VALUES (?, 'outgoing', '@x', 1000, 5, 'monthly', '2026-06-01T00:00:00Z')`,
    ).bind(userId).run();
    const loanId = loanInsert.meta.last_row_id;
    // Entry linked to the loan — exercises the entries-before-loans deletion order (FK)
    await env.DB.prepare(
      `INSERT INTO accountant_entries (user_id, occurred_at, amount, source, loan_id)
       VALUES (?, '2026-06-01T00:00:00Z', -1, 'loan_principal', ?)`,
    ).bind(userId, loanId).run();
    await env.DB.prepare(
      `INSERT INTO accountant_tags (user_id, category, name) VALUES (?, 'trading', 'quantanium')`,
    ).bind(userId).run();

    const res = await SELF.fetch("http://localhost/api/account", {
      method: "DELETE",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "DELETE" }),
    });
    expect([200, 204]).toContain(res.status);

    for (const table of ["accountant_entries", "accountant_loans", "accountant_tags"]) {
      const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`)
        .bind(userId).first<{ n: number }>();
      expect(row?.n, table).toBe(0);
    }
  });

  it("deletes ONLY private rows — corp-scoped rows (org_id set) survive a member's account deletion (M4 §5.7)", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const orgId = `org-${crypto.randomUUID().slice(0, 8)}`;
    await env.DB.prepare(
      `INSERT INTO organization (id, name, slug, createdAt) VALUES (?, 'Corp', ?, '2026-06-01T00:00:00Z')`,
    ).bind(orgId, orgId).run();

    // One private entry (org_id NULL) and one corp entry (org_id set) for the same user.
    await env.DB.prepare(
      `INSERT INTO accountant_entries (user_id, occurred_at, amount, category, source)
       VALUES (?, '2026-06-01T00:00:00Z', -100, 'running_cost', 'manual')`,
    ).bind(userId).run();
    await env.DB.prepare(
      `INSERT INTO accountant_entries (user_id, occurred_at, amount, category, source, org_id)
       VALUES (?, '2026-06-02T00:00:00Z', 5000, 'trading', 'manual', ?)`,
    ).bind(userId, orgId).run();

    const res = await SELF.fetch("http://localhost/api/account", {
      method: "DELETE",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "DELETE" }),
    });
    expect([200, 204]).toContain(res.status);

    const priv = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM accountant_entries WHERE user_id = ? AND org_id IS NULL",
    ).bind(userId).first<{ n: number }>();
    expect(priv?.n, "private rows deleted").toBe(0);
    const corp = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM accountant_entries WHERE org_id = ?",
    ).bind(orgId).first<{ n: number }>();
    expect(corp?.n, "corp rows survive").toBe(1);
  });

  it("deletes orders and workorders with the account (FK pressure: entries → orders → workorders)", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const wo = await env.DB.prepare(
      `INSERT INTO accountant_workorders (user_id, title) VALUES (?, 'Haul run')`,
    ).bind(userId).run();
    const woId = wo.meta.last_row_id;
    const order = await env.DB.prepare(
      `INSERT INTO accountant_orders (user_id, type, category, item, quantity, price_per_unit, total, start_at, workorder_id)
       VALUES (?, 'purchase', 'trading', 'Laranite', 10, 1000, 10000, '2026-06-01T00:00:00Z', ?)`,
    ).bind(userId, woId).run();
    const orderId = order.meta.last_row_id;
    // Entries linked to BOTH new FKs — exercises deletion order under FK enforcement.
    await env.DB.prepare(
      `INSERT INTO accountant_entries (user_id, occurred_at, amount, source, order_id)
       VALUES (?, '2026-06-01T00:00:00Z', -10000, 'po_reserve', ?)`,
    ).bind(userId, orderId).run();
    await env.DB.prepare(
      `INSERT INTO accountant_entries (user_id, occurred_at, amount, category, source, workorder_id)
       VALUES (?, '2026-06-02T00:00:00Z', -500, 'financial', 'wo_settlement', ?)`,
    ).bind(userId, woId).run();

    const res = await SELF.fetch("http://localhost/api/account", {
      method: "DELETE",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "DELETE" }),
    });
    expect([200, 204]).toContain(res.status);
    for (const table of ["accountant_entries", "accountant_orders", "accountant_workorders"]) {
      const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`)
        .bind(userId).first<{ n: number }>();
      expect(row?.n, table).toBe(0);
    }
  });
});
