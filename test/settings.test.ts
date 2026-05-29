import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders } from "./helpers";

describe("Settings — /api/settings/preferences", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  describe("GET /api/settings/preferences", () => {
    it("returns empty object for new user", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const res = await SELF.fetch("http://localhost/api/settings/preferences", {
        headers: await authHeaders(sessionToken),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({});
    });

    it("requires authentication", async () => {
      const res = await SELF.fetch("http://localhost/api/settings/preferences");
      expect(res.status).toBe(401);
    });
  });

  describe("PUT /api/settings/preferences — new UI keys", () => {
    it("stores and retrieves privacyMode", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const headers = await authHeaders(sessionToken);

      const putRes = await SELF.fetch("http://localhost/api/settings/preferences", {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ privacyMode: "hidden" }),
      });
      expect(putRes.status).toBe(200);

      const getRes = await SELF.fetch("http://localhost/api/settings/preferences", { headers });
      const body = (await getRes.json()) as Record<string, string>;
      expect(body.privacyMode).toBe("hidden");
    });

    it("stores and retrieves stealthPercent", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const headers = await authHeaders(sessionToken);

      await SELF.fetch("http://localhost/api/settings/preferences", {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ stealthPercent: "25" }),
      });

      const getRes = await SELF.fetch("http://localhost/api/settings/preferences", { headers });
      const body = (await getRes.json()) as Record<string, string>;
      expect(body.stealthPercent).toBe("25");
    });

    it("stores and retrieves sidebarCollapsed", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const headers = await authHeaders(sessionToken);

      await SELF.fetch("http://localhost/api/settings/preferences", {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ sidebarCollapsed: "1" }),
      });

      const getRes = await SELF.fetch("http://localhost/api/settings/preferences", { headers });
      const body = (await getRes.json()) as Record<string, string>;
      expect(body.sidebarCollapsed).toBe("1");
    });

    it("stores and retrieves fontPreference", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const headers = await authHeaders(sessionToken);

      await SELF.fetch("http://localhost/api/settings/preferences", {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ fontPreference: "lexend" }),
      });

      const getRes = await SELF.fetch("http://localhost/api/settings/preferences", { headers });
      const body = (await getRes.json()) as Record<string, string>;
      expect(body.fontPreference).toBe("lexend");
    });

    it("rejects invalid privacyMode values", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const res = await SELF.fetch("http://localhost/api/settings/preferences", {
        method: "PUT",
        headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
        body: JSON.stringify({ privacyMode: "visible" }),
      });
      expect(res.status).toBe(400);
    });

    it("rejects invalid sidebarCollapsed values", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const res = await SELF.fetch("http://localhost/api/settings/preferences", {
        method: "PUT",
        headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
        body: JSON.stringify({ sidebarCollapsed: "true" }),
      });
      expect(res.status).toBe(400);
    });

    it("stores all UI prefs in a single request", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const headers = await authHeaders(sessionToken);

      await SELF.fetch("http://localhost/api/settings/preferences", {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          privacyMode: "stealth",
          stealthPercent: "42",
          sidebarCollapsed: "0",
          fontPreference: "atkinson",
        }),
      });

      const getRes = await SELF.fetch("http://localhost/api/settings/preferences", { headers });
      const body = (await getRes.json()) as Record<string, string>;
      expect(body.privacyMode).toBe("stealth");
      expect(body.stealthPercent).toBe("42");
      expect(body.sidebarCollapsed).toBe("0");
      expect(body.fontPreference).toBe("atkinson");
    });
  });

  describe("PUT /api/settings/preferences -- publicFleetShare", () => {
    it("accepts publicFleetShare='true' and persists it", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const res = await SELF.fetch("http://localhost/api/settings/preferences", {
        method: "PUT",
        headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
        body: JSON.stringify({ publicFleetShare: "true" }),
      });
      expect(res.status).toBe(200);

      const get = await SELF.fetch("http://localhost/api/settings/preferences", {
        headers: await authHeaders(sessionToken),
      });
      const prefs = (await get.json()) as Record<string, string>;
      expect(prefs.publicFleetShare).toBe("true");
    });

    it("clears publicFleetShare when set to null", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      await SELF.fetch("http://localhost/api/settings/preferences", {
        method: "PUT",
        headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
        body: JSON.stringify({ publicFleetShare: "true" }),
      });
      const clear = await SELF.fetch("http://localhost/api/settings/preferences", {
        method: "PUT",
        headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
        body: JSON.stringify({ publicFleetShare: null }),
      });
      expect(clear.status).toBe(200);
      const get = await SELF.fetch("http://localhost/api/settings/preferences", {
        headers: await authHeaders(sessionToken),
      });
      const prefs = (await get.json()) as Record<string, string>;
      expect(prefs.publicFleetShare).toBeUndefined();
    });

    it("rejects publicFleetShare with arbitrary string (strict enum)", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const res = await SELF.fetch("http://localhost/api/settings/preferences", {
        method: "PUT",
        headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
        body: JSON.stringify({ publicFleetShare: "yes" }),
      });
      expect(res.status).toBe(400);
    });
  });
});
