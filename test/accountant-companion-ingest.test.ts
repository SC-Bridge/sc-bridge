import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders } from "./helpers";

const BATCH = {
  events: [
    // Enriched purchase — auto-categorizes to assets (forward-compatible with the fixed log).
    {
      type: "transaction_complete", source: "log", timestamp: "2026-06-10T11:00:00Z",
      data: { event_id: "tx-1", amount: "1500000", direction: "buy", hint: "ship_purchase", ship: "Cutlass Black", item: "Cutlass Black", location: "New Babbage" },
    },
    // Fine — amount present today; lands in the Sorting List (no hint).
    { type: "fined", source: "log", timestamp: "2026-06-10T12:00:00Z", data: { event_id: "fine-1", amount: "5000" } },
    // Non-financial — must NOT create a ledger row.
    { type: "ship_boarded", source: "log", timestamp: "2026-06-10T13:00:00Z", data: { ship: "Carrack" } },
  ],
};

describe("Companion → ledger bridge — POST /api/companion/events", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  it("derives signed, categorized ledger rows from economy events", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const res = await SELF.fetch("http://localhost/api/companion/events", {
      method: "POST",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify(BATCH),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; stored: number; bridged: number };
    expect(body.ok).toBe(true);
    expect(body.stored).toBe(3);
    expect(body.bridged).toBe(2); // ship_boarded does not bridge

    const rows = await env.DB.prepare(
      "SELECT source_ref, amount, category, tag, source FROM accountant_entries WHERE user_id = ? ORDER BY source_ref",
    ).bind(userId).all<{ source_ref: string; amount: number; category: string | null; tag: string | null; source: string }>();
    expect(rows.results).toEqual([
      { source_ref: "companion:fine-1", amount: -5000, category: null, tag: null, source: "parsed" },
      { source_ref: "companion:tx-1", amount: -1500000, category: "assets", tag: null, source: "parsed" },
    ]);
  });

  it("is idempotent — re-posting the same batch adds no new ledger rows", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const headers = { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" };

    await SELF.fetch("http://localhost/api/companion/events", { method: "POST", headers, body: JSON.stringify(BATCH) });
    await SELF.fetch("http://localhost/api/companion/events", { method: "POST", headers, body: JSON.stringify(BATCH) });

    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM accountant_entries WHERE user_id = ?",
    ).bind(userId).first<{ n: number }>();
    expect(count?.n).toBe(2);
  });
});
