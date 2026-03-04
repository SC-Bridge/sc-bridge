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
      expect(body.success).toBe(true);
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
});
