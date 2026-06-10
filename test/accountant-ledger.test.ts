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
  });
});
