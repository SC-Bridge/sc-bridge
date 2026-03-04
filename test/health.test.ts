import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders } from "./helpers";

describe("Health & Status", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  describe("GET /api/health", () => {
    it("returns 200 with ok status", async () => {
      const res = await SELF.fetch("http://localhost/api/health");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ status: "ok" });
    });

    it("does not require authentication", async () => {
      const res = await SELF.fetch("http://localhost/api/health");
      expect(res.status).toBe(200);
    });
  });

  describe("GET /api/status", () => {
    it("returns counts when unauthenticated", async () => {
      const res = await SELF.fetch("http://localhost/api/status");
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty("ships");
      expect(body).toHaveProperty("paints");
      expect(body).toHaveProperty("vehicles");
      expect(body.vehicles).toBe(0); // no fleet without auth
    });

    it("returns fleet count when authenticated", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const res = await SELF.fetch("http://localhost/api/status", {
        headers: await authHeaders(sessionToken),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      // Fleet count is 0 since no ships imported, but should be a number
      expect(typeof body.vehicles).toBe("number");
    });

    it("includes sync_status and config", async () => {
      const res = await SELF.fetch("http://localhost/api/status");
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty("sync_status");
      expect(body).toHaveProperty("config");
      expect((body.config as Record<string, unknown>).db_driver).toBe("d1");
    });
  });

  describe("API 404 fallthrough", () => {
    it("returns JSON 404 for unknown API routes", async () => {
      const res = await SELF.fetch("http://localhost/api/nonexistent");
      expect(res.status).toBe(404);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.error).toBe("Not Found");
    });
  });

  describe("Security headers", () => {
    it("sets security headers on API responses", async () => {
      const res = await SELF.fetch("http://localhost/api/health");
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(res.headers.get("X-Frame-Options")).toBe("DENY");
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    });
  });
});
