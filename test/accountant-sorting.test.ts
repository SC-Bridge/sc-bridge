import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders } from "./helpers";

async function seedUnsorted(userId: string, n: number): Promise<number[]> {
  const ids: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = await env.DB.prepare(
      `INSERT INTO accountant_entries (user_id, occurred_at, amount, source, source_ref)
       VALUES (?, '2026-06-01T00:00:00Z', -100, 'parsed', ?)`,
    ).bind(userId, `sort-${userId}-${i}`).run();
    ids.push(r.meta.last_row_id as number);
  }
  return ids;
}

describe("Accountant — Sorting List", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  it("GET /sorting returns only uncategorized parsed entries", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    await seedUnsorted(userId, 3);
    // a categorized + an adjustment entry must NOT appear
    await env.DB.prepare(
      `INSERT INTO accountant_entries (user_id, occurred_at, amount, source, category)
       VALUES (?, '2026-06-01T00:00:00Z', -50, 'parsed', 'trading')`,
    ).bind(userId).run();
    await env.DB.prepare(
      `INSERT INTO accountant_entries (user_id, occurred_at, amount, source)
       VALUES (?, '2026-06-01T00:00:00Z', 1000000, 'adjustment')`,
    ).bind(userId).run();

    const res = await SELF.fetch("http://localhost/api/accountant/sorting", {
      headers: await authHeaders(sessionToken),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: unknown[]; count: number };
    expect(body.count).toBe(3);
    expect(body.entries).toHaveLength(3);
  });

  it("PUT /sorting/bulk categorizes selected entries with a tag", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const ids = await seedUnsorted(userId, 3);

    const res = await SELF.fetch("http://localhost/api/accountant/sorting/bulk", {
      method: "PUT",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [ids[0], ids[1]], category: "trading", tag: "minerals" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; updated: number };
    expect(body).toEqual({ ok: true, updated: 2 });

    const remaining = await SELF.fetch("http://localhost/api/accountant/sorting", {
      headers: await authHeaders(sessionToken),
    });
    expect(((await remaining.json()) as { count: number }).count).toBe(1);
  });

  it("ignores ids that are not in the caller's sorting list", async () => {
    const a = await createTestUser(env.DB);
    const b = await createTestUser(env.DB);
    const aIds = await seedUnsorted(a.userId, 1);

    const res = await SELF.fetch("http://localhost/api/accountant/sorting/bulk", {
      method: "PUT",
      headers: { ...(await authHeaders(b.sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ ids: aIds, category: "trading" }),
    });
    const body = (await res.json()) as { updated: number };
    expect(body.updated).toBe(0);

    const row = await env.DB.prepare("SELECT category FROM accountant_entries WHERE id = ?")
      .bind(aIds[0]).first<{ category: string | null }>();
    expect(row?.category).toBeNull();
  });

  it("rejects an invalid category with 400", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const ids = await seedUnsorted(userId, 1);
    const res = await SELF.fetch("http://localhost/api/accountant/sorting/bulk", {
      method: "PUT",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ ids, category: "piracy" }),
    });
    expect(res.status).toBe(400);
  });
});
