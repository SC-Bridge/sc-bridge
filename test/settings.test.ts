import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders, seedVehicle } from "./helpers";

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

    it("stores and retrieves miningLoadouts (JSON array string)", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const headers = await authHeaders(sessionToken);

      const loadouts = JSON.stringify([
        { name: "My MOLE", ship: 1, laserIds: { 0: 12 }, moduleIds: { "0-0": 5 }, gadget: 3 },
      ]);
      const putRes = await SELF.fetch("http://localhost/api/settings/preferences", {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ miningLoadouts: loadouts }),
      });
      expect(putRes.status).toBe(200);

      const getRes = await SELF.fetch("http://localhost/api/settings/preferences", { headers });
      const body = (await getRes.json()) as Record<string, string>;
      expect(body.miningLoadouts).toBe(loadouts);
      // round-trips back to a usable array
      expect(JSON.parse(body.miningLoadouts)[0].name).toBe("My MOLE");
    });

    it("clears miningLoadouts when set to null", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const headers = await authHeaders(sessionToken);
      await SELF.fetch("http://localhost/api/settings/preferences", {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ miningLoadouts: "[]" }),
      });
      await SELF.fetch("http://localhost/api/settings/preferences", {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ miningLoadouts: null }),
      });
      const getRes = await SELF.fetch("http://localhost/api/settings/preferences", { headers });
      const body = (await getRes.json()) as Record<string, string>;
      expect(body.miningLoadouts).toBeUndefined();
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

    it("toggling publicFleetShare off makes /api/u/:handle/fleet return 404", async () => {
      const { userId, sessionToken } = await createTestUser(env.DB);

      // Set up a verified handle and seed a public ship
      await env.DB.prepare(
        `INSERT INTO user_rsi_profile (user_id, handle, verified_handle, verified_at, fetched_at)
         VALUES (?, 'iris', 'iris', datetime('now'), datetime('now'))`,
      ).bind(userId).run();
      const vehicleId = await seedVehicle(env.DB, { slug: "300i-iris", name: "300i" });
      await env.DB.prepare(
        `INSERT INTO user_fleet (user_id, vehicle_id, org_visibility, imported_at)
         VALUES (?, ?, 'public', datetime('now'))`,
      ).bind(userId, vehicleId).run();

      // Toggle ON
      const onRes = await SELF.fetch("http://localhost/api/settings/preferences", {
        method: "PUT",
        headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
        body: JSON.stringify({ publicFleetShare: "true" }),
      });
      expect(onRes.status).toBe(200);
      let publicRes = await SELF.fetch("http://localhost/api/u/iris/fleet");
      expect(publicRes.status).toBe(200);

      // Toggle OFF
      const offRes = await SELF.fetch("http://localhost/api/settings/preferences", {
        method: "PUT",
        headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
        body: JSON.stringify({ publicFleetShare: null }),
      });
      expect(offRes.status).toBe(200);
      publicRes = await SELF.fetch("http://localhost/api/u/iris/fleet");
      expect(publicRes.status).toBe(404);
    });
  });

  describe("accountantTier", () => {
    it("accepts 'easy' and persists value in user_settings", async () => {
      const { userId, sessionToken } = await createTestUser(env.DB);
      const headers = await authHeaders(sessionToken);

      const res = await SELF.fetch("http://localhost/api/settings/preferences", {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ accountantTier: "easy" }),
      });
      expect(res.status).toBe(200);

      const row = await env.DB
        .prepare("SELECT value FROM user_settings WHERE user_id = ? AND key = 'accountantTier'")
        .bind(userId)
        .first<{ value: string }>();
      expect(row?.value).toBe("easy");
    });

    it("accepts 'advanced' and persists value in user_settings", async () => {
      const { userId, sessionToken } = await createTestUser(env.DB);
      const headers = await authHeaders(sessionToken);

      const res = await SELF.fetch("http://localhost/api/settings/preferences", {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ accountantTier: "advanced" }),
      });
      expect(res.status).toBe(200);

      const row = await env.DB
        .prepare("SELECT value FROM user_settings WHERE user_id = ? AND key = 'accountantTier'")
        .bind(userId)
        .first<{ value: string }>();
      expect(row?.value).toBe("advanced");
    });

    it("accepts 'industrial' and persists value in user_settings", async () => {
      const { userId, sessionToken } = await createTestUser(env.DB);
      const headers = await authHeaders(sessionToken);

      const res = await SELF.fetch("http://localhost/api/settings/preferences", {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ accountantTier: "industrial" }),
      });
      expect(res.status).toBe(200);

      const row = await env.DB
        .prepare("SELECT value FROM user_settings WHERE user_id = ? AND key = 'accountantTier'")
        .bind(userId)
        .first<{ value: string }>();
      expect(row?.value).toBe("industrial");
    });

    it("rejects 'banana' (not in enum) with 400 and no DB write", async () => {
      const { userId, sessionToken } = await createTestUser(env.DB);
      const res = await SELF.fetch("http://localhost/api/settings/preferences", {
        method: "PUT",
        headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
        body: JSON.stringify({ accountantTier: "banana" }),
      });
      expect(res.status).toBe(400);

      const row = await env.DB
        .prepare("SELECT value FROM user_settings WHERE user_id = ? AND key = 'accountantTier'")
        .bind(userId)
        .first<{ value: string }>();
      expect(row).toBeNull();
    });

    it("rejects numeric values (wrong type) with 400", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const res = await SELF.fetch("http://localhost/api/settings/preferences", {
        method: "PUT",
        headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
        body: JSON.stringify({ accountantTier: 1 }),
      });
      expect(res.status).toBe(400);
    });

    it("GET preferences returns accountantTier after PUT", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const headers = await authHeaders(sessionToken);

      await SELF.fetch("http://localhost/api/settings/preferences", {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ accountantTier: "industrial" }),
      });

      const getRes = await SELF.fetch("http://localhost/api/settings/preferences", { headers });
      const body = (await getRes.json()) as Record<string, string>;
      expect(body.accountantTier).toBe("industrial");
    });

    it("GET preferences omits accountantTier when not set", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const headers = await authHeaders(sessionToken);

      const getRes = await SELF.fetch("http://localhost/api/settings/preferences", { headers });
      const body = (await getRes.json()) as Record<string, string>;
      expect(body.accountantTier).toBeUndefined();
    });

    it("after PUT, user_change_history contains a row with field_name='accountantTier' and correct new_value", async () => {
      const { userId, sessionToken } = await createTestUser(env.DB);
      const headers = await authHeaders(sessionToken);

      await SELF.fetch("http://localhost/api/settings/preferences", {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ accountantTier: "advanced" }),
      });

      const row = await env.DB
        .prepare(
          "SELECT field_name, new_value FROM user_change_history WHERE user_id = ? AND field_name = 'accountantTier' ORDER BY id DESC LIMIT 1"
        )
        .bind(userId)
        .first<{ field_name: string; new_value: string }>();
      expect(row?.field_name).toBe("accountantTier");
      expect(row?.new_value).toBe("advanced");
    });
  });
});
