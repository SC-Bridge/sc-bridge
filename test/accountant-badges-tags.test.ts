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
