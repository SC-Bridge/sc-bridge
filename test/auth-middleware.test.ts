import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, createAdminUser, authHeaders } from "./helpers";

describe("Auth Middleware", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  describe("Protected routes without auth", () => {
    it("GET /api/vehicles returns 401 without auth", async () => {
      const res = await SELF.fetch("http://localhost/api/vehicles");
      expect(res.status).toBe(401);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.error).toBe("Unauthorized");
    });

    it("POST /api/import/hangarxplor returns 401 without auth", async () => {
      const res = await SELF.fetch("http://localhost/api/import/hangarxplor", {
        method: "POST",
        body: JSON.stringify([]),
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(401);
    });

    it("GET /api/settings returns 401 without auth", async () => {
      const res = await SELF.fetch("http://localhost/api/settings");
      expect(res.status).toBe(401);
    });

    it("GET /api/analysis returns 401 without auth", async () => {
      const res = await SELF.fetch("http://localhost/api/analysis");
      expect(res.status).toBe(401);
    });

    it("GET /api/account returns 401 without auth", async () => {
      const res = await SELF.fetch("http://localhost/api/account");
      expect(res.status).toBe(401);
    });
  });

  describe("Protected routes with valid auth", () => {
    it("GET /api/vehicles returns 200 with valid session", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const res = await SELF.fetch("http://localhost/api/vehicles", {
        headers: await authHeaders(sessionToken),
      });
      expect(res.status).toBe(200);
    });

    it("GET /api/analysis returns 200 with valid session", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const res = await SELF.fetch("http://localhost/api/analysis", {
        headers: await authHeaders(sessionToken),
      });
      expect(res.status).toBe(200);
    });
  });

  describe("Expired session", () => {
    it("returns 401 with expired session token", async () => {
      const userId = crypto.randomUUID();
      const now = new Date().toISOString();
      const expiredAt = new Date(Date.now() - 1000).toISOString(); // 1 second ago

      await env.DB
        .prepare(
          `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt, role)
           VALUES (?, 'Expired User', 'expired@test.com', 1, ?, ?, 'user')`
        )
        .bind(userId, now, now)
        .run();
      await env.DB
        .prepare(`UPDATE "user" SET status = 'active' WHERE id = ?`)
        .bind(userId)
        .run();

      const sessionToken = `expired-${crypto.randomUUID()}`;
      await env.DB
        .prepare(
          `INSERT INTO "session" (id, expiresAt, token, createdAt, updatedAt, userId)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(crypto.randomUUID(), expiredAt, sessionToken, now, now, userId)
        .run();

      const res = await SELF.fetch("http://localhost/api/vehicles", {
        headers: await authHeaders(sessionToken),
      });
      expect(res.status).toBe(401);
    });
  });

  describe("Inactive user status", () => {
    it("returns 401 for banned user", async () => {
      const { sessionToken } = await createTestUser(env.DB, { status: "banned" });
      const res = await SELF.fetch("http://localhost/api/vehicles", {
        headers: await authHeaders(sessionToken),
      });
      expect(res.status).toBe(401);
    });

    it("returns 401 for deleted user", async () => {
      const { sessionToken } = await createTestUser(env.DB, { status: "deleted" });
      const res = await SELF.fetch("http://localhost/api/vehicles", {
        headers: await authHeaders(sessionToken),
      });
      expect(res.status).toBe(401);
    });
  });

  describe("Admin-only routes", () => {
    it("GET /api/sync returns 401 without auth", async () => {
      const res = await SELF.fetch("http://localhost/api/sync/status");
      expect(res.status).toBe(401);
    });

    it("GET /api/debug returns 401 without auth", async () => {
      const res = await SELF.fetch("http://localhost/api/debug/imports");
      expect(res.status).toBe(401);
    });

    it("regular user gets 403 on admin routes", async () => {
      const { sessionToken } = await createTestUser(env.DB, { role: "user" });
      const res = await SELF.fetch("http://localhost/api/sync/status", {
        headers: await authHeaders(sessionToken),
      });
      expect(res.status).toBe(403);
    });

    it("admin user can access admin routes", async () => {
      const { sessionToken } = await createAdminUser(env.DB);
      const res = await SELF.fetch("http://localhost/api/debug/imports", {
        headers: await authHeaders(sessionToken),
      });
      // Should succeed (200) or return data — not 401/403
      expect(res.status).toBeLessThan(400);
    });
  });

  describe("Public routes", () => {
    it("GET /api/health is public", async () => {
      const res = await SELF.fetch("http://localhost/api/health");
      expect(res.status).toBe(200);
    });

    it("GET /api/ships is public", async () => {
      const res = await SELF.fetch("http://localhost/api/ships");
      expect(res.status).toBe(200);
    });

    it("GET /api/loot is public", async () => {
      const res = await SELF.fetch("http://localhost/api/loot");
      expect(res.status).toBe(200);
    });
  });
});
