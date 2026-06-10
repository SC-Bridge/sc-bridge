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
});
