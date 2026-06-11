import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders } from "./helpers";

describe("Accountant — /api/accountant/ledger", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  describe("GET /api/accountant/ledger — income/expense aggregates", () => {
    async function seedAggregateEntries(sessionToken: string) {
      const headers = { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" };
      const entries = [
        { amount: 10000, category: "mission_income", occurred_at: "2026-06-01T10:00:00Z", description: "Bounty payout" },
        { amount: 5000, category: "trading", occurred_at: "2026-06-02T10:00:00Z", description: "Laranite sell" },
        { amount: -3000, category: "trading", occurred_at: "2026-06-03T10:00:00Z", description: "Laranite buy" },
        { amount: -500, category: "running_cost", occurred_at: "2026-06-04T10:00:00Z", description: "Repair" },
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

    it("unfiltered GET returns correct sum_income and sum_expense", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      await seedAggregateEntries(sessionToken);
      const res = await SELF.fetch("http://localhost/api/accountant/ledger", {
        headers: await authHeaders(sessionToken),
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        entries: Array<{ amount: number }>;
        total: number;
        balance: number;
        sum_income: number;
        sum_expense: number;
      };
      // sum_income = 10000 + 5000 = 15000
      expect(data.sum_income).toBe(15000);
      // sum_expense = -3000 + -500 = -3500
      expect(data.sum_expense).toBe(-3500);
      // balance stays the all-time unfiltered sum
      expect(data.balance).toBe(11500);
    });

    it("filtered by category: sums scope to matching rows; balance remains all-time sum", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      await seedAggregateEntries(sessionToken);
      const res = await SELF.fetch("http://localhost/api/accountant/ledger?category=trading", {
        headers: await authHeaders(sessionToken),
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        total: number;
        balance: number;
        sum_income: number;
        sum_expense: number;
      };
      // trading: +5000 income, -3000 expense
      expect(data.sum_income).toBe(5000);
      expect(data.sum_expense).toBe(-3000);
      expect(data.total).toBe(2);
      // balance is the unfiltered all-time sum (10000 + 5000 - 3000 - 500 = 11500)
      expect(data.balance).toBe(11500);
    });

    it("filtered by date range: sums scope to the window", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      await seedAggregateEntries(sessionToken);
      // window covers Jun 02 and Jun 03 only (+5000, -3000)
      const res = await SELF.fetch(
        "http://localhost/api/accountant/ledger?from=2026-06-02T00:00:00Z&to=2026-06-03T23:59:59Z",
        { headers: await authHeaders(sessionToken) },
      );
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        total: number;
        sum_income: number;
        sum_expense: number;
      };
      expect(data.total).toBe(2);
      expect(data.sum_income).toBe(5000);
      expect(data.sum_expense).toBe(-3000);
    });

    it("consistency: sum_income + sum_expense equals sum of entries[].amount for single-page results", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      await seedAggregateEntries(sessionToken);
      // Use a category filter guaranteed to return < 50 rows
      const res = await SELF.fetch("http://localhost/api/accountant/ledger?category=mission_income", {
        headers: await authHeaders(sessionToken),
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        entries: Array<{ amount: number }>;
        total: number;
        sum_income: number;
        sum_expense: number;
      };
      const entrySum = data.entries.reduce((acc, e) => acc + e.amount, 0);
      expect(data.sum_income + data.sum_expense).toBe(entrySum);
    });
  });
});
