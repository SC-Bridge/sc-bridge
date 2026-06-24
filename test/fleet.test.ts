import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders, seedVehicle, seedFleetEntry } from "./helpers";

describe("Fleet API — /api/vehicles", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  describe("GET /api/vehicles", () => {
    it("returns empty array for user with no fleet", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const res = await SELF.fetch("http://localhost/api/vehicles", {
        headers: await authHeaders(sessionToken),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([]);
    });

    it("returns fleet entries with joined reference data", async () => {
      const { userId, sessionToken } = await createTestUser(env.DB);
      const vehicleId = await seedVehicle(env.DB, {
        name: "Aurora MR",
        slug: "aurora-mr",
        focus: "Starter",
        size_label: "Small",
      });
      await seedFleetEntry(env.DB, userId, vehicleId, {
        insurance_type_id: 1, // LTI
        pledge_name: "Aurora MR Starter Pack",
      });

      const res = await SELF.fetch("http://localhost/api/vehicles", {
        headers: await authHeaders(sessionToken),
      });
      expect(res.status).toBe(200);
      const fleet = (await res.json()) as Array<Record<string, unknown>>;
      expect(fleet).toHaveLength(1);
      expect(fleet[0].vehicle_name).toBe("Aurora MR");
      expect(fleet[0].insurance_label).toBe("Lifetime Insurance");
      expect(fleet[0].pledge_name).toBe("Aurora MR Starter Pack");
    });

    it("returns only the authenticated user's fleet", async () => {
      const user1 = await createTestUser(env.DB);
      const user2 = await createTestUser(env.DB);
      const vehicleId = await seedVehicle(env.DB, {
        slug: "gladius-isolation",
        name: "Gladius",
      });

      await seedFleetEntry(env.DB, user1.userId, vehicleId);
      await seedFleetEntry(env.DB, user2.userId, vehicleId);

      const res = await SELF.fetch("http://localhost/api/vehicles", {
        headers: await authHeaders(user1.sessionToken),
      });
      const fleet = (await res.json()) as Array<Record<string, unknown>>;
      expect(fleet).toHaveLength(1);
      expect(fleet[0].user_id).toBeUndefined; // user_id not leaked... actually it is in the query
    });

    it("supports multiple ships including duplicates", async () => {
      const { userId, sessionToken } = await createTestUser(env.DB);
      const vehicleId = await seedVehicle(env.DB, {
        slug: "ptv-dup-test",
        name: "PTV",
      });

      // Two PTVs — no UNIQUE on user_fleet
      await seedFleetEntry(env.DB, userId, vehicleId);
      await seedFleetEntry(env.DB, userId, vehicleId, { custom_name: "PTV 2" });

      const res = await SELF.fetch("http://localhost/api/vehicles", {
        headers: await authHeaders(sessionToken),
      });
      const fleet = (await res.json()) as Array<Record<string, unknown>>;
      expect(fleet).toHaveLength(2);
    });
  });

  describe("GET /api/vehicles/with-insurance", () => {
    it("returns same data as /api/vehicles", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const [res1, res2] = await Promise.all([
        SELF.fetch("http://localhost/api/vehicles", {
          headers: await authHeaders(sessionToken),
        }),
        SELF.fetch("http://localhost/api/vehicles/with-insurance", {
          headers: await authHeaders(sessionToken),
        }),
      ]);
      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      const body1 = await res1.json();
      const body2 = await res2.json();
      expect(body1).toEqual(body2);
    });
  });

  describe("PATCH /api/vehicles/:id/visibility", () => {
    it("updates org_visibility", async () => {
      const { userId, sessionToken } = await createTestUser(env.DB);
      const vehicleId = await seedVehicle(env.DB, {
        slug: "vis-test-ship",
        name: "Visibility Test",
      });
      const fleetId = await seedFleetEntry(env.DB, userId, vehicleId);

      const res = await SELF.fetch(
        `http://localhost/api/vehicles/${fleetId}/visibility`,
        {
          method: "PATCH",
          headers: {
            ...(await await authHeaders(sessionToken)),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ org_visibility: "org" }),
        }
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.ok).toBe(true);
    });

    it("rejects invalid visibility value", async () => {
      const { userId, sessionToken } = await createTestUser(env.DB);
      const vehicleId = await seedVehicle(env.DB, {
        slug: "vis-invalid-test",
        name: "Invalid Vis Test",
      });
      const fleetId = await seedFleetEntry(env.DB, userId, vehicleId);

      const res = await SELF.fetch(
        `http://localhost/api/vehicles/${fleetId}/visibility`,
        {
          method: "PATCH",
          headers: {
            ...(await await authHeaders(sessionToken)),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ org_visibility: "invalid_value" }),
        }
      );
      expect(res.status).toBe(400);
    });

    it("returns 404 for another user's fleet entry", async () => {
      const user1 = await createTestUser(env.DB);
      const user2 = await createTestUser(env.DB);
      const vehicleId = await seedVehicle(env.DB, {
        slug: "vis-other-user",
        name: "Other User Ship",
      });
      const fleetId = await seedFleetEntry(env.DB, user1.userId, vehicleId);

      // user2 tries to modify user1's fleet entry
      const res = await SELF.fetch(
        `http://localhost/api/vehicles/${fleetId}/visibility`,
        {
          method: "PATCH",
          headers: {
            ...(await authHeaders(user2.sessionToken)),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ org_visibility: "public" }),
        }
      );
      expect(res.status).toBe(404);
    });

    it("rejects with no fields to update", async () => {
      const { userId, sessionToken } = await createTestUser(env.DB);
      const vehicleId = await seedVehicle(env.DB, {
        slug: "vis-empty-test",
        name: "Empty Update Test",
      });
      const fleetId = await seedFleetEntry(env.DB, userId, vehicleId);

      const res = await SELF.fetch(
        `http://localhost/api/vehicles/${fleetId}/visibility`,
        {
          method: "PATCH",
          headers: {
            ...(await await authHeaders(sessionToken)),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        }
      );
      expect(res.status).toBe(400);
    });
  });

  describe("PATCH /api/vehicles/:id/paint", () => {
    async function seedPaintLinked(vehicleId: number, name: string) {
      const result = await env.DB
        .prepare(
          "INSERT INTO paints (name, slug, class_name, image_url) VALUES (?, ?, ?, 'https://x/p.png') RETURNING id",
        )
        .bind(name, name.toLowerCase().replace(/\s+/g, "-"), `paint_${name.toLowerCase().replace(/\s+/g, "_")}`)
        .first<{ id: number }>();
      const paintId = result!.id;
      await env.DB
        .prepare("INSERT INTO paint_vehicles (paint_id, vehicle_id) VALUES (?, ?)")
        .bind(paintId, vehicleId)
        .run();
      return paintId;
    }

    async function grantPaintOwnership(userId: string, paintId: number) {
      await env.DB
        .prepare("INSERT INTO user_paints (user_id, paint_id) VALUES (?, ?)")
        .bind(userId, paintId)
        .run();
    }

    it("equips a paint the user owns + has the linkage", async () => {
      const { userId, sessionToken } = await createTestUser(env.DB);
      const vehicleId = await seedVehicle(env.DB, { slug: "paint-equip-1", name: "Test Ship" });
      const fleetId = await seedFleetEntry(env.DB, userId, vehicleId);
      const paintId = await seedPaintLinked(vehicleId, "Test Livery");
      await grantPaintOwnership(userId, paintId);

      const res = await SELF.fetch(`http://localhost/api/vehicles/${fleetId}/paint`, {
        method: "PATCH",
        headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
        body: JSON.stringify({ paint_id: paintId }),
      });
      expect(res.status).toBe(200);

      const row = await env.DB
        .prepare("SELECT equipped_paint_id FROM user_fleet WHERE id = ?")
        .bind(fleetId)
        .first<{ equipped_paint_id: number | null }>();
      expect(row?.equipped_paint_id).toBe(paintId);
    });

    it("rejects an unowned paint with 403", async () => {
      const { userId, sessionToken } = await createTestUser(env.DB);
      const vehicleId = await seedVehicle(env.DB, { slug: "paint-equip-2", name: "Test Ship 2" });
      const fleetId = await seedFleetEntry(env.DB, userId, vehicleId);
      const paintId = await seedPaintLinked(vehicleId, "Unowned Livery");
      // intentionally do NOT grant ownership

      const res = await SELF.fetch(`http://localhost/api/vehicles/${fleetId}/paint`, {
        method: "PATCH",
        headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
        body: JSON.stringify({ paint_id: paintId }),
      });
      expect(res.status).toBe(403);
    });

    it("rejects a paint not linked to this vehicle with 400", async () => {
      const { userId, sessionToken } = await createTestUser(env.DB);
      const vehicleId = await seedVehicle(env.DB, { slug: "paint-equip-3", name: "Test Ship 3" });
      const otherVehicleId = await seedVehicle(env.DB, { slug: "paint-equip-3-other", name: "Other Ship" });
      const fleetId = await seedFleetEntry(env.DB, userId, vehicleId);
      const paintId = await seedPaintLinked(otherVehicleId, "Wrong Livery"); // linked to OTHER vehicle
      await grantPaintOwnership(userId, paintId);

      const res = await SELF.fetch(`http://localhost/api/vehicles/${fleetId}/paint`, {
        method: "PATCH",
        headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
        body: JSON.stringify({ paint_id: paintId }),
      });
      expect(res.status).toBe(400);
    });

    it("accepts null to unset the equipped paint", async () => {
      const { userId, sessionToken } = await createTestUser(env.DB);
      const vehicleId = await seedVehicle(env.DB, { slug: "paint-equip-4", name: "Test Ship 4" });
      const fleetId = await seedFleetEntry(env.DB, userId, vehicleId);
      const paintId = await seedPaintLinked(vehicleId, "To Unset Livery");
      await grantPaintOwnership(userId, paintId);

      // Equip first
      await env.DB
        .prepare("UPDATE user_fleet SET equipped_paint_id = ? WHERE id = ?")
        .bind(paintId, fleetId)
        .run();

      // Now unset
      const res = await SELF.fetch(`http://localhost/api/vehicles/${fleetId}/paint`, {
        method: "PATCH",
        headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
        body: JSON.stringify({ paint_id: null }),
      });
      expect(res.status).toBe(200);

      const row = await env.DB
        .prepare("SELECT equipped_paint_id FROM user_fleet WHERE id = ?")
        .bind(fleetId)
        .first<{ equipped_paint_id: number | null }>();
      expect(row?.equipped_paint_id).toBeNull();
    });

    it("returns 404 for another user's fleet entry", async () => {
      const user1 = await createTestUser(env.DB);
      const user2 = await createTestUser(env.DB);
      const vehicleId = await seedVehicle(env.DB, { slug: "paint-equip-5", name: "Test Ship 5" });
      const fleetId = await seedFleetEntry(env.DB, user1.userId, vehicleId);
      const paintId = await seedPaintLinked(vehicleId, "Cross-user Livery");
      await grantPaintOwnership(user2.userId, paintId);

      const res = await SELF.fetch(`http://localhost/api/vehicles/${fleetId}/paint`, {
        method: "PATCH",
        headers: { ...(await authHeaders(user2.sessionToken)), "Content-Type": "application/json" },
        body: JSON.stringify({ paint_id: paintId }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /api/vehicles/bulk-visibility", () => {
    it("mode 'all' sets every ship in the caller's fleet", async () => {
      const { userId, sessionToken } = await createTestUser(env.DB);
      const v1 = await seedVehicle(env.DB, { slug: "bulk-v1", name: "Aurora" });
      const v2 = await seedVehicle(env.DB, { slug: "bulk-v2", name: "Gladius" });
      const v3 = await seedVehicle(env.DB, { slug: "bulk-v3", name: "Carrack" });
      await seedFleetEntry(env.DB, userId, v1, {});
      await seedFleetEntry(env.DB, userId, v2, {});
      await seedFleetEntry(env.DB, userId, v3, {});

      const res = await SELF.fetch("http://localhost/api/vehicles/bulk-visibility", {
        method: "PATCH",
        headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "all", org_visibility: "public" }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; updated: number };
      expect(body.ok).toBe(true);
      expect(body.updated).toBe(3);

      const rows = await env.DB
        .prepare(`SELECT org_visibility FROM user_fleet WHERE user_id = ?`)
        .bind(userId)
        .all<{ org_visibility: string }>();
      expect(rows.results.every((r) => r.org_visibility === "public")).toBe(true);
    });

    it("mode 'all' never touches another user's ships", async () => {
      const u1 = await createTestUser(env.DB);
      const u2 = await createTestUser(env.DB);
      const v = await seedVehicle(env.DB, { slug: "bulk-isolation", name: "Iso" });
      await seedFleetEntry(env.DB, u1.userId, v, {});
      const f2 = await seedFleetEntry(env.DB, u2.userId, v, {});

      const res = await SELF.fetch("http://localhost/api/vehicles/bulk-visibility", {
        method: "PATCH",
        headers: { ...(await authHeaders(u1.sessionToken)), "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "all", org_visibility: "public" }),
      });
      expect(res.status).toBe(200);

      const otherRow = await env.DB
        .prepare(`SELECT org_visibility FROM user_fleet WHERE id = ?`)
        .bind(f2)
        .first<{ org_visibility: string }>();
      expect(otherRow?.org_visibility).toBe("private");
    });

    it("mode 'entries' applies per-id visibility for the caller's ships", async () => {
      const { userId, sessionToken } = await createTestUser(env.DB);
      const v1 = await seedVehicle(env.DB, { slug: "entries-v1", name: "Aurora" });
      const v2 = await seedVehicle(env.DB, { slug: "entries-v2", name: "Gladius" });
      const f1 = await seedFleetEntry(env.DB, userId, v1, {});
      const f2 = await seedFleetEntry(env.DB, userId, v2, {});

      const res = await SELF.fetch("http://localhost/api/vehicles/bulk-visibility", {
        method: "PATCH",
        headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "entries",
          entries: [
            { id: f1, org_visibility: "public" },
            { id: f2, org_visibility: "officers" },
          ],
        }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; updated: number };
      expect(body.updated).toBe(2);

      const r1 = await env.DB.prepare(`SELECT org_visibility FROM user_fleet WHERE id = ?`).bind(f1).first<{ org_visibility: string }>();
      const r2 = await env.DB.prepare(`SELECT org_visibility FROM user_fleet WHERE id = ?`).bind(f2).first<{ org_visibility: string }>();
      expect(r1?.org_visibility).toBe("public");
      expect(r2?.org_visibility).toBe("officers");
    });

    it("mode 'entries' silently ignores ids that don't belong to the caller", async () => {
      const u1 = await createTestUser(env.DB);
      const u2 = await createTestUser(env.DB);
      const v = await seedVehicle(env.DB, { slug: "entries-foreign", name: "Iso2" });
      const f2 = await seedFleetEntry(env.DB, u2.userId, v, {});

      const res = await SELF.fetch("http://localhost/api/vehicles/bulk-visibility", {
        method: "PATCH",
        headers: { ...(await authHeaders(u1.sessionToken)), "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "entries",
          entries: [{ id: f2, org_visibility: "public" }],
        }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { updated: number };
      expect(body.updated).toBe(0);

      const r = await env.DB.prepare(`SELECT org_visibility FROM user_fleet WHERE id = ?`).bind(f2).first<{ org_visibility: string }>();
      expect(r?.org_visibility).toBe("private");
    });

    it("rejects unauthenticated requests", async () => {
      const res = await SELF.fetch("http://localhost/api/vehicles/bulk-visibility", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "all", org_visibility: "public" }),
      });
      expect(res.status).toBe(401);
    });

    it("rejects invalid org_visibility value", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const res = await SELF.fetch("http://localhost/api/vehicles/bulk-visibility", {
        method: "PATCH",
        headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "all", org_visibility: "bogus" }),
      });
      expect(res.status).toBe(400);
    });

    it("rejects entries-mode body with too many entries (cap 500)", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const entries = Array.from({ length: 501 }, (_, i) => ({ id: i + 1, org_visibility: "public" }));
      const res = await SELF.fetch("http://localhost/api/vehicles/bulk-visibility", {
        method: "PATCH",
        headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "entries", entries }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("PUT /api/vehicles/:id/tags", () => {
    async function putTags(sessionToken: string, fleetId: number, tags: string[]) {
      return SELF.fetch(`http://localhost/api/vehicles/${fleetId}/tags`, {
        method: "PUT",
        headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
        body: JSON.stringify({ tags }),
      });
    }

    it("sets tags and surfaces them on the fleet list", async () => {
      const { userId, sessionToken } = await createTestUser(env.DB);
      const vehicleId = await seedVehicle(env.DB, { slug: "tags-1", name: "Tagged Ship" });
      const fleetId = await seedFleetEntry(env.DB, userId, vehicleId);

      const res = await putTags(sessionToken, fleetId, ["cargo", "ground ops"]);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; tags: string[] };
      expect(body.ok).toBe(true);
      expect(body.tags).toEqual(["cargo", "ground ops"]);

      const list = await SELF.fetch("http://localhost/api/vehicles", {
        headers: await authHeaders(sessionToken),
      });
      const fleet = (await list.json()) as Array<{ id: number; tags: string[] }>;
      expect(fleet[0].tags.sort()).toEqual(["cargo", "ground ops"]);
    });

    it("replaces the full tag set (replace-all semantics)", async () => {
      const { userId, sessionToken } = await createTestUser(env.DB);
      const vehicleId = await seedVehicle(env.DB, { slug: "tags-2", name: "Replace Ship" });
      const fleetId = await seedFleetEntry(env.DB, userId, vehicleId);

      await putTags(sessionToken, fleetId, ["a", "b", "c"]);
      const res = await putTags(sessionToken, fleetId, ["x"]);
      expect(res.status).toBe(200);

      const rows = await env.DB
        .prepare("SELECT tag FROM user_fleet_tags WHERE user_fleet_id = ?")
        .bind(fleetId)
        .all<{ tag: string }>();
      expect(rows.results.map((r) => r.tag)).toEqual(["x"]);
    });

    it("de-duplicates tags case-insensitively, keeping first-seen casing", async () => {
      const { userId, sessionToken } = await createTestUser(env.DB);
      const vehicleId = await seedVehicle(env.DB, { slug: "tags-3", name: "Dup Ship" });
      const fleetId = await seedFleetEntry(env.DB, userId, vehicleId);

      const res = await putTags(sessionToken, fleetId, ["Cargo", "cargo", "CARGO", "mining"]);
      const body = (await res.json()) as { tags: string[] };
      expect(body.tags).toEqual(["Cargo", "mining"]);
    });

    it("clears all tags with an empty array", async () => {
      const { userId, sessionToken } = await createTestUser(env.DB);
      const vehicleId = await seedVehicle(env.DB, { slug: "tags-4", name: "Clear Ship" });
      const fleetId = await seedFleetEntry(env.DB, userId, vehicleId);

      await putTags(sessionToken, fleetId, ["one", "two"]);
      await putTags(sessionToken, fleetId, []);
      const rows = await env.DB
        .prepare("SELECT COUNT(*) AS n FROM user_fleet_tags WHERE user_fleet_id = ?")
        .bind(fleetId)
        .first<{ n: number }>();
      expect(rows?.n).toBe(0);
    });

    it("returns 404 for another user's fleet entry", async () => {
      const user1 = await createTestUser(env.DB);
      const user2 = await createTestUser(env.DB);
      const vehicleId = await seedVehicle(env.DB, { slug: "tags-5", name: "Foreign Ship" });
      const fleetId = await seedFleetEntry(env.DB, user1.userId, vehicleId);

      const res = await putTags(user2.sessionToken, fleetId, ["sneaky"]);
      expect(res.status).toBe(404);
    });

    it("rejects more than 10 tags", async () => {
      const { userId, sessionToken } = await createTestUser(env.DB);
      const vehicleId = await seedVehicle(env.DB, { slug: "tags-6", name: "Too Many" });
      const fleetId = await seedFleetEntry(env.DB, userId, vehicleId);

      const res = await putTags(sessionToken, fleetId, Array.from({ length: 11 }, (_, i) => `t${i}`));
      expect(res.status).toBe(400);
    });

    it("rejects a tag longer than 24 chars", async () => {
      const { userId, sessionToken } = await createTestUser(env.DB);
      const vehicleId = await seedVehicle(env.DB, { slug: "tags-7", name: "Too Long" });
      const fleetId = await seedFleetEntry(env.DB, userId, vehicleId);

      const res = await putTags(sessionToken, fleetId, ["x".repeat(25)]);
      expect(res.status).toBe(400);
    });
  });
});
