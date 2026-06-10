import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders } from "./helpers";

const BATCH = {
  entries: [
    { event_id: "evt-001", occurred_at: "2026-06-01T10:00:00Z", amount: -1500000, hint: "ship_purchase", description: "Cutlass Black" },
    { event_id: "evt-002", occurred_at: "2026-06-01T10:05:00Z", amount: -400, hint: "repair", location: "Lorville" },
    { event_id: "evt-003", occurred_at: "2026-06-01T10:10:00Z", amount: -2400, hint: "fuel", ship: "Starfarer Gemini" },
    { event_id: "evt-004", occurred_at: "2026-06-01T10:15:00Z", amount: 9000, description: "Unknown income" },
  ],
};

describe("Accountant — POST /api/accountant/ingest", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  it("requires authentication", async () => {
    const res = await SELF.fetch("http://localhost/api/accountant/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(BATCH),
    });
    expect(res.status).toBe(401);
  });

  it("ingests a batch, auto-categorizes, and routes the rest to sorting", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const res = await SELF.fetch("http://localhost/api/accountant/ingest", {
      method: "POST",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify(BATCH),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; inserted: number; duplicates: number };
    expect(body).toEqual({ ok: true, inserted: 4, duplicates: 0 });

    const rows = await env.DB.prepare(
      "SELECT source_ref, category, tag, source FROM accountant_entries WHERE user_id = ? ORDER BY source_ref",
    ).bind(userId).all<{ source_ref: string; category: string | null; tag: string | null; source: string }>();
    expect(rows.results).toEqual([
      { source_ref: "evt-001", category: "assets", tag: null, source: "parsed" },
      { source_ref: "evt-002", category: "running_cost", tag: "ship_consumables", source: "parsed" },
      { source_ref: "evt-003", category: null, tag: null, source: "parsed" },
      { source_ref: "evt-004", category: null, tag: null, source: "parsed" },
    ]);
  });

  it("is idempotent — re-sending the same batch inserts nothing", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const headers = { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" };

    const first = await SELF.fetch("http://localhost/api/accountant/ingest", {
      method: "POST", headers, body: JSON.stringify(BATCH),
    });
    expect(((await first.json()) as { inserted: number }).inserted).toBe(4);

    const second = await SELF.fetch("http://localhost/api/accountant/ingest", {
      method: "POST", headers, body: JSON.stringify(BATCH),
    });
    const body = (await second.json()) as { ok: boolean; inserted: number; duplicates: number };
    expect(body).toEqual({ ok: true, inserted: 0, duplicates: 4 });
  });

  it("does not dedupe the same event_id across different users", async () => {
    const a = await createTestUser(env.DB);
    const b = await createTestUser(env.DB);
    for (const u of [a, b]) {
      const res = await SELF.fetch("http://localhost/api/accountant/ingest", {
        method: "POST",
        headers: { ...(await authHeaders(u.sessionToken)), "Content-Type": "application/json" },
        body: JSON.stringify(BATCH),
      });
      expect(((await res.json()) as { inserted: number }).inserted).toBe(4);
    }
  });

  it("rejects an oversized batch with 400", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const entries = Array.from({ length: 501 }, (_, i) => ({
      event_id: `big-${i}`, occurred_at: "2026-06-01T00:00:00Z", amount: 1,
    }));
    const res = await SELF.fetch("http://localhost/api/accountant/ingest", {
      method: "POST",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects non-ISO occurred_at with 400", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const res = await SELF.fetch("http://localhost/api/accountant/ingest", {
      method: "POST",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ entries: [{ event_id: "bad-1", occurred_at: "yesterday", amount: 5 }] }),
    });
    expect(res.status).toBe(400);
  });
});
