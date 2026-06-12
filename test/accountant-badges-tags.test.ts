import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders } from "./helpers";

describe("Accountant — badges + tags + threshold", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  it("GET /badges reports sorting count, due-soon loans, and default threshold", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    await env.DB.prepare(
      `INSERT INTO accountant_entries (user_id, occurred_at, amount, source, source_ref)
       VALUES (?, '2026-06-01T00:00:00Z', -100, 'parsed', 'badge-1')`,
    ).bind(userId).run();
    // loan due inside 48h window
    await env.DB.prepare(
      `INSERT INTO accountant_loans (user_id, direction, counterparty, principal, interest_rate, interest_interval, started_at, due_at)
       VALUES (?, 'incoming', '@lender', 50000, 3, 'weekly', '2026-06-01T00:00:00Z', datetime('now', '+12 hours'))`,
    ).bind(userId).run();
    // settled loan due soon must NOT count
    await env.DB.prepare(
      `INSERT INTO accountant_loans (user_id, direction, counterparty, principal, interest_rate, interest_interval, started_at, due_at, status)
       VALUES (?, 'incoming', '@lender2', 1000, 3, 'weekly', '2026-06-01T00:00:00Z', datetime('now', '+12 hours'), 'settled')`,
    ).bind(userId).run();

    const res = await SELF.fetch("http://localhost/api/accountant/badges", {
      headers: await authHeaders(sessionToken),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sorting: number; loansDueSoon: number; sortingThreshold: number };
    expect(body.sorting).toBe(1);
    expect(body.loansDueSoon).toBe(1);
    expect(body.sortingThreshold).toBe(10);
  });

  it("GET /badges counts open/in_progress orders past deliver_by as ordersOverdue", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const insertOrder = (status: string, deliverBySql: string) => env.DB.prepare(
      `INSERT INTO accountant_orders
         (user_id, type, category, item, quantity, price_per_unit, total, status, start_at, deliver_by)
       VALUES (?, 'sale', 'trading', 'Laranite', 10, 1000, 10000, ?, '2026-06-01T00:00:00Z', ${deliverBySql})`,
    ).bind(userId, status).run();
    await insertOrder("open", "'2026-06-02T00:00:00Z'");            // overdue + open → counts
    await insertOrder("complete", "'2026-06-02T00:00:00Z'");        // overdue but closed → no
    await insertOrder("open", "datetime('now', '+5 days')");        // future deliver_by → no

    const res = await SELF.fetch("http://localhost/api/accountant/badges", {
      headers: await authHeaders(sessionToken),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { ordersOverdue: number }).ordersOverdue).toBe(1);
  });

  it("counts an order overdue by hours on the SAME UTC day (ISO 'T' vs datetime('now') space pin)", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    // A few hours in the past, clamped to UTC midnight so the deliver_by stays
    // on TODAY'S UTC date — at char 10 ISO has 'T' where datetime('now') has a
    // space, so a raw string compare never flags same-day overdue orders.
    const nowMs = Date.now();
    const sameDayPast = new Date(
      Math.max(nowMs - 3 * 3_600_000, new Date(nowMs).setUTCHours(0, 0, 0, 0)),
    ).toISOString();
    await env.DB.prepare(
      `INSERT INTO accountant_orders
         (user_id, type, category, item, quantity, price_per_unit, total, status, start_at, deliver_by)
       VALUES (?, 'sale', 'trading', 'Laranite', 10, 1000, 10000, 'open', '2026-06-01T00:00:00Z', ?)`,
    ).bind(userId, sameDayPast).run();

    const res = await SELF.fetch("http://localhost/api/accountant/badges", {
      headers: await authHeaders(sessionToken),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { ordersOverdue: number }).ordersOverdue).toBe(1);
  });

  it("threshold preference round-trips through settings and into /badges", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const put = await SELF.fetch("http://localhost/api/settings/preferences", {
      method: "PUT",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ accountantVerifyThreshold: "25" }),
    });
    expect(put.status).toBe(200);

    const res = await SELF.fetch("http://localhost/api/accountant/badges", {
      headers: await authHeaders(sessionToken),
    });
    expect(((await res.json()) as { sortingThreshold: number }).sortingThreshold).toBe(25);
  });

  it("rejects a threshold below the spec'd minimum of 10", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const res = await SELF.fetch("http://localhost/api/settings/preferences", {
      method: "PUT",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ accountantVerifyThreshold: "5" }),
    });
    expect(res.status).toBe(400);
  });

  it("tags: defaults + create + duplicate rejection + delete", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const headers = { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" };

    const initial = await SELF.fetch("http://localhost/api/accountant/tags", {
      headers: await authHeaders(sessionToken),
    });
    const initialBody = (await initial.json()) as { defaults: Record<string, string[]>; custom: unknown[] };
    expect(initialBody.defaults.trading).toContain("minerals");
    expect(initialBody.custom).toEqual([]);

    const create = await SELF.fetch("http://localhost/api/accountant/tags", {
      method: "POST", headers, body: JSON.stringify({ category: "trading", name: "quantanium" }),
    });
    expect(create.status).toBe(200);
    const created = (await create.json()) as { ok: boolean; id: number };
    expect(created.ok).toBe(true);

    const dupe = await SELF.fetch("http://localhost/api/accountant/tags", {
      method: "POST", headers, body: JSON.stringify({ category: "trading", name: "quantanium" }),
    });
    expect(dupe.status).toBe(409);

    // suite convention: DELETE sends Content-Length: 0 for the M-01 middleware
    const del = await SELF.fetch(`http://localhost/api/accountant/tags/${created.id}`, {
      method: "DELETE", headers: { ...(await authHeaders(sessionToken)), "Content-Length": "0" },
    });
    expect(del.status).toBe(200);
  });

  it("tags: duplicate detection is case-insensitive", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const headers = { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" };

    const create = await SELF.fetch("http://localhost/api/accountant/tags", {
      method: "POST", headers, body: JSON.stringify({ category: "trading", name: "quantanium" }),
    });
    expect(create.status).toBe(200);

    const dupe = await SELF.fetch("http://localhost/api/accountant/tags", {
      method: "POST", headers, body: JSON.stringify({ category: "trading", name: "Quantanium" }),
    });
    expect(dupe.status).toBe(409);
  });

  it("tags: cannot delete another user's tag", async () => {
    const a = await createTestUser(env.DB);
    const b = await createTestUser(env.DB);
    const create = await SELF.fetch("http://localhost/api/accountant/tags", {
      method: "POST",
      headers: { ...(await authHeaders(a.sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ category: "trading", name: "corundum" }),
    });
    const created = (await create.json()) as { id: number };

    const del = await SELF.fetch(`http://localhost/api/accountant/tags/${created.id}`, {
      method: "DELETE", headers: { ...(await authHeaders(b.sessionToken)), "Content-Length": "0" },
    });
    expect(del.status).toBe(404);

    const row = await env.DB.prepare("SELECT id FROM accountant_tags WHERE id = ?")
      .bind(created.id).first<{ id: number }>();
    expect(row?.id).toBe(created.id);
  });

  it("tags: only the trading category is user-extensible", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const res = await SELF.fetch("http://localhost/api/accountant/tags", {
      method: "POST",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ category: "assets", name: "ships" }),
    });
    expect(res.status).toBe(400);
  });
});
