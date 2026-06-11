import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders } from "./helpers";

describe("Accountant — /api/accountant/ledger", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  describe("auth gate", () => {
    it("rejects unauthenticated requests with 401", async () => {
      const res = await SELF.fetch("http://localhost/api/accountant/ledger");
      expect(res.status).toBe(401);
    });

    it("returns an empty ledger for a new authenticated user", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const res = await SELF.fetch("http://localhost/api/accountant/ledger", {
        headers: await authHeaders(sessionToken),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { entries: unknown[]; total: number; balance: number };
      expect(body.entries).toEqual([]);
      expect(body.total).toBe(0);
      expect(body.balance).toBe(0);
    });
  });

  describe("POST /api/accountant/ledger — manual entry", () => {
    it("creates a categorized manual entry and reflects it in balance", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const headers = { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" };

      const res = await SELF.fetch("http://localhost/api/accountant/ledger", {
        method: "POST",
        headers,
        body: JSON.stringify({
          amount: -3200,
          category: "trading",
          tag: "minerals",
          occurred_at: "2026-06-01T14:03:00Z",
          location: "New Babbage",
          description: "Laranite sale fees",
        }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; id: number };
      expect(body.ok).toBe(true);
      expect(body.id).toBeGreaterThan(0);

      const ledger = await SELF.fetch("http://localhost/api/accountant/ledger", {
        headers: await authHeaders(sessionToken),
      });
      const data = (await ledger.json()) as { balance: number; total: number; entries: Array<{ source: string; category: string }> };
      expect(data.balance).toBe(-3200);
      expect(data.total).toBe(1);
      expect(data.entries[0].source).toBe("manual");
      expect(data.entries[0].category).toBe("trading");
    });

    it("rejects a manual entry without category with 400", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const res = await SELF.fetch("http://localhost/api/accountant/ledger", {
        method: "POST",
        headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 500, occurred_at: "2026-06-01T00:00:00Z" }),
      });
      expect(res.status).toBe(400);
    });

    it("accepts a balance adjustment without category (source=adjustment)", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const res = await SELF.fetch("http://localhost/api/accountant/ledger", {
        method: "POST",
        headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: 12000000,
          occurred_at: "2026-06-01T00:00:00Z",
          adjustment: true,
          notes: "Opening balance",
        }),
      });
      expect(res.status).toBe(200);

      const ledger = await SELF.fetch("http://localhost/api/accountant/ledger", {
        headers: await authHeaders(sessionToken),
      });
      const data = (await ledger.json()) as { balance: number; entries: Array<{ source: string; category: string | null }> };
      expect(data.balance).toBe(12000000);
      expect(data.entries[0].source).toBe("adjustment");
      expect(data.entries[0].category).toBeNull();
    });

    it("rejects zero amounts with 400", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const res = await SELF.fetch("http://localhost/api/accountant/ledger", {
        method: "POST",
        headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 0, category: "trading", occurred_at: "2026-06-01T00:00:00Z" }),
      });
      expect(res.status).toBe(400);
    });

    it("rejects an unknown category with 400", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const res = await SELF.fetch("http://localhost/api/accountant/ledger", {
        method: "POST",
        headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 100, category: "crime", occurred_at: "2026-06-01T00:00:00Z" }),
      });
      expect(res.status).toBe(400);
    });

    it("accepts category mission_income and reflects it in the ledger", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const headers = { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" };

      const res = await SELF.fetch("http://localhost/api/accountant/ledger", {
        method: "POST",
        headers,
        body: JSON.stringify({
          amount: 50000,
          category: "mission_income",
          occurred_at: "2026-06-01T14:00:00Z",
          description: "Bounty mission payout",
        }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; id: number };
      expect(body.ok).toBe(true);
      expect(body.id).toBeGreaterThan(0);

      const ledger = await SELF.fetch("http://localhost/api/accountant/ledger", {
        headers: await authHeaders(sessionToken),
      });
      const data = (await ledger.json()) as { entries: Array<{ category: string }> };
      expect(data.entries[0].category).toBe("mission_income");
    });
  });

  describe("GET /api/accountant/ledger — filters", () => {
    async function seedEntries(sessionToken: string) {
      const headers = { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" };
      const entries = [
        { amount: -3200, category: "trading", occurred_at: "2026-06-01T10:00:00Z", description: "Laranite buy" },
        { amount: -400, category: "running_cost", occurred_at: "2026-06-02T10:00:00Z", description: "Repair at Lorville" },
        { amount: 5000, category: "trading", occurred_at: "2026-06-03T10:00:00Z", description: "Laranite sell" },
      ];
      for (const e of entries) {
        const res = await SELF.fetch("http://localhost/api/accountant/ledger", {
          method: "POST",
          headers,
          body: JSON.stringify(e),
        });
        expect(res.status).toBe(200);
      }
    }

    it("filters by category", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      await seedEntries(sessionToken);
      const res = await SELF.fetch("http://localhost/api/accountant/ledger?category=trading", {
        headers: await authHeaders(sessionToken),
      });
      const data = (await res.json()) as { total: number; balance: number };
      expect(data.total).toBe(2);
      // balance stays the unfiltered all-time sum
      expect(data.balance).toBe(1400);
    });

    it("filters by date range", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      await seedEntries(sessionToken);
      const res = await SELF.fetch(
        "http://localhost/api/accountant/ledger?from=2026-06-02T00:00:00Z&to=2026-06-02T23:59:59Z",
        { headers: await authHeaders(sessionToken) },
      );
      const data = (await res.json()) as { total: number; entries: Array<{ description: string }> };
      expect(data.total).toBe(1);
      expect(data.entries[0].description).toBe("Repair at Lorville");
    });

    it("filters by text search across description/location/notes", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      await seedEntries(sessionToken);
      const res = await SELF.fetch("http://localhost/api/accountant/ledger?q=laranite", {
        headers: await authHeaders(sessionToken),
      });
      const data = (await res.json()) as { total: number };
      expect(data.total).toBe(2);
    });

    it("does not leak entries across users", async () => {
      const a = await createTestUser(env.DB);
      const b = await createTestUser(env.DB);
      await seedEntries(a.sessionToken);
      const res = await SELF.fetch("http://localhost/api/accountant/ledger", {
        headers: await authHeaders(b.sessionToken),
      });
      const data = (await res.json()) as { total: number; balance: number };
      expect(data.total).toBe(0);
      expect(data.balance).toBe(0);
    });
  });

  describe("PUT/DELETE /api/accountant/ledger/:id", () => {
    async function createManual(sessionToken: string): Promise<number> {
      const res = await SELF.fetch("http://localhost/api/accountant/ledger", {
        method: "POST",
        headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
        body: JSON.stringify({ amount: -500, category: "running_cost", occurred_at: "2026-06-01T00:00:00Z" }),
      });
      const body = (await res.json()) as { id: number };
      return body.id;
    }

    it("edits category/tag/notes on a manual entry", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const id = await createManual(sessionToken);
      const res = await SELF.fetch(`http://localhost/api/accountant/ledger/${id}`, {
        method: "PUT",
        headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
        body: JSON.stringify({ category: "trading", tag: "salvage", notes: "actually a salvage sale" }),
      });
      expect(res.status).toBe(200);

      const row = await env.DB.prepare("SELECT category, tag, notes FROM accountant_entries WHERE id = ?")
        .bind(id).first<{ category: string; tag: string; notes: string }>();
      expect(row?.category).toBe("trading");
      expect(row?.tag).toBe("salvage");
      expect(row?.notes).toBe("actually a salvage sale");
    });

    it("rejects amount edits on parsed entries with 400", async () => {
      const { userId, sessionToken } = await createTestUser(env.DB);
      await env.DB.prepare(
        `INSERT INTO accountant_entries (user_id, occurred_at, amount, source) VALUES (?, '2026-06-01T00:00:00Z', -100, 'parsed')`,
      ).bind(userId).run();
      const row = await env.DB.prepare("SELECT id FROM accountant_entries WHERE user_id = ?")
        .bind(userId).first<{ id: number }>();

      const res = await SELF.fetch(`http://localhost/api/accountant/ledger/${row!.id}`, {
        method: "PUT",
        headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
        body: JSON.stringify({ amount: -99999 }),
      });
      expect(res.status).toBe(400);
    });

    it("rejects edits and deletes on loan-linked rows with 400", async () => {
      const { userId, sessionToken } = await createTestUser(env.DB);
      await env.DB.prepare(
        `INSERT INTO accountant_loans (user_id, direction, counterparty, principal, interest_rate, interest_interval, started_at)
         VALUES (?, 'outgoing', '@pilot42', 100000, 5, 'monthly', '2026-06-01T00:00:00Z')`,
      ).bind(userId).run();
      const loan = await env.DB.prepare("SELECT id FROM accountant_loans WHERE user_id = ?")
        .bind(userId).first<{ id: number }>();
      await env.DB.prepare(
        `INSERT INTO accountant_entries (user_id, occurred_at, amount, source, loan_id)
         VALUES (?, '2026-06-01T00:00:00Z', 100000, 'loan_principal', ?)`,
      ).bind(userId, loan!.id).run();
      const entry = await env.DB.prepare("SELECT id FROM accountant_entries WHERE user_id = ?")
        .bind(userId).first<{ id: number }>();

      const headers = { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" };
      const put = await SELF.fetch(`http://localhost/api/accountant/ledger/${entry!.id}`, {
        method: "PUT", headers, body: JSON.stringify({ notes: "tamper" }),
      });
      expect(put.status).toBe(400);
      // "Content-Length": "0" required by the global M-01 mutation middleware (see blueprints.test.ts)
      const del = await SELF.fetch(`http://localhost/api/accountant/ledger/${entry!.id}`, {
        method: "DELETE", headers: { ...(await authHeaders(sessionToken)), "Content-Length": "0" },
      });
      expect(del.status).toBe(400);
    });

    it("deletes a manual entry and 404s another user's entry", async () => {
      const a = await createTestUser(env.DB);
      const b = await createTestUser(env.DB);
      const id = await createManual(a.sessionToken);

      const foreign = await SELF.fetch(`http://localhost/api/accountant/ledger/${id}`, {
        method: "DELETE", headers: { ...(await authHeaders(b.sessionToken)), "Content-Length": "0" },
      });
      expect(foreign.status).toBe(404);

      const own = await SELF.fetch(`http://localhost/api/accountant/ledger/${id}`, {
        method: "DELETE", headers: { ...(await authHeaders(a.sessionToken)), "Content-Length": "0" },
      });
      expect(own.status).toBe(200);
      const row = await env.DB.prepare("SELECT id FROM accountant_entries WHERE id = ?").bind(id).first();
      expect(row).toBeNull();
    });
  });

  describe("hardening — datetime validation, strict ids, search escaping", () => {
    async function postEntry(
      sessionToken: string,
      body: Record<string, unknown>,
    ): Promise<Response> {
      return SELF.fetch("http://localhost/api/accountant/ledger", {
        method: "POST",
        headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }

    it("rejects a non-ISO occurred_at with 400 and accepts a valid one", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const bad = await postEntry(sessionToken, {
        amount: 100, category: "trading", occurred_at: "banana",
      });
      expect(bad.status).toBe(400);

      const good = await postEntry(sessionToken, {
        amount: 100, category: "trading", occurred_at: "2026-06-01T14:03:00Z",
      });
      expect(good.status).toBe(200);
    });

    it("404s a non-integer id like 12.9 even when the truncated id exists", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const created = await postEntry(sessionToken, {
        amount: -500, category: "running_cost", occurred_at: "2026-06-01T00:00:00Z",
      });
      const { id } = (await created.json()) as { id: number };

      const res = await SELF.fetch(`http://localhost/api/accountant/ledger/${id}.9`, {
        method: "PUT",
        headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "should never land" }),
      });
      expect(res.status).toBe(404);

      const row = await env.DB.prepare("SELECT notes FROM accountant_entries WHERE id = ?")
        .bind(id).first<{ notes: string | null }>();
      expect(row?.notes).toBeNull();
    });

    it("treats LIKE wildcards in q as literals", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      await postEntry(sessionToken, {
        amount: 1000, category: "trading", occurred_at: "2026-06-01T00:00:00Z",
        description: "50% profit share",
      });
      await postEntry(sessionToken, {
        amount: 2000, category: "trading", occurred_at: "2026-06-02T00:00:00Z",
        description: "sold 50 units of gold",
      });

      const res = await SELF.fetch(
        `http://localhost/api/accountant/ledger?q=${encodeURIComponent("50%")}`,
        { headers: await authHeaders(sessionToken) },
      );
      const data = (await res.json()) as { total: number; entries: Array<{ description: string }> };
      expect(data.total).toBe(1);
      expect(data.entries[0].description).toBe("50% profit share");
    });

    it("filters by source=manual, excluding parsed entries", async () => {
      const { userId, sessionToken } = await createTestUser(env.DB);
      await postEntry(sessionToken, {
        amount: 100, category: "trading", occurred_at: "2026-06-01T00:00:00Z",
      });
      await env.DB.prepare(
        `INSERT INTO accountant_entries (user_id, occurred_at, amount, source) VALUES (?, '2026-06-02T00:00:00Z', -100, 'parsed')`,
      ).bind(userId).run();

      const res = await SELF.fetch("http://localhost/api/accountant/ledger?source=manual", {
        headers: await authHeaders(sessionToken),
      });
      const data = (await res.json()) as { total: number; entries: Array<{ source: string }> };
      expect(data.total).toBe(1);
      expect(data.entries[0].source).toBe("manual");
    });

    it("supports repeatable category params", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      await postEntry(sessionToken, { amount: 100, category: "trading", occurred_at: "2026-06-01T00:00:00Z" });
      await postEntry(sessionToken, { amount: -200, category: "running_cost", occurred_at: "2026-06-02T00:00:00Z" });
      await postEntry(sessionToken, { amount: 300, category: "financial", occurred_at: "2026-06-03T00:00:00Z" });

      const res = await SELF.fetch(
        "http://localhost/api/accountant/ledger?category=trading&category=running_cost",
        { headers: await authHeaders(sessionToken) },
      );
      const data = (await res.json()) as { total: number };
      expect(data.total).toBe(2);
    });

    it("allows amount edits on a manual entry", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const created = await postEntry(sessionToken, {
        amount: -500, category: "running_cost", occurred_at: "2026-06-01T00:00:00Z",
      });
      const { id } = (await created.json()) as { id: number };

      const res = await SELF.fetch(`http://localhost/api/accountant/ledger/${id}`, {
        method: "PUT",
        headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
        body: JSON.stringify({ amount: -750 }),
      });
      expect(res.status).toBe(200);

      const row = await env.DB.prepare("SELECT amount FROM accountant_entries WHERE id = ?")
        .bind(id).first<{ amount: number }>();
      expect(row?.amount).toBe(-750);
    });
  });
});
