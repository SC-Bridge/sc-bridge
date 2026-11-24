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
});

describe("Settings — /api/settings/llm-config key removal", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  async function put(headers: Record<string, string>, body: unknown) {
    return SELF.fetch("http://localhost/api/settings/llm-config", {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function providers(headers: Record<string, string>) {
    const res = await SELF.fetch("http://localhost/api/settings/llm-config", { headers });
    const body = (await res.json()) as { providers: Record<string, { api_key_set: boolean }> };
    return body.providers;
  }

  it("removes one provider's key when the Settings page sends an empty api_key", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const headers = await authHeaders(sessionToken);

    expect((await put(headers, { provider: "anthropic", api_key: "sk-ant-test-key-1234567890" })).status).toBe(200);
    expect((await put(headers, { provider: "openai", api_key: "sk-openai-test-key-1234567890" })).status).toBe(200);
    expect((await providers(headers)).anthropic?.api_key_set).toBe(true);

    // Exactly what frontend/src/pages/Settings.jsx sends on "Remove"
    const res = await put(headers, { provider: "anthropic", api_key: "" });
    expect(res.status).toBe(200);

    const after = await providers(headers);
    expect(after.anthropic?.api_key_set ?? false).toBe(false);
    expect(after.openai?.api_key_set).toBe(true);
  });

  it("still updates only the model when api_key is omitted", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const headers = await authHeaders(sessionToken);

    await put(headers, { provider: "anthropic", api_key: "sk-ant-test-key-1234567890" });
    const res = await put(headers, { provider: "anthropic", model: "claude-haiku-4-5-20251001" });
    expect(res.status).toBe(200);
    expect((await providers(headers)).anthropic?.api_key_set).toBe(true);
  });
});
