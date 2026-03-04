import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import {
  createTestUser,
  authHeaders,
  seedVehicle,
  seedFleetEntry,
} from "./helpers";

describe("Import API — /api/import/hangarxplor", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  describe("POST /api/import/hangarxplor", () => {
    it("requires authentication", async () => {
      const res = await SELF.fetch("http://localhost/api/import/hangarxplor", {
        method: "POST",
        body: JSON.stringify([]),
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(401);
    });

    it("rejects non-array body", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const res = await SELF.fetch("http://localhost/api/import/hangarxplor", {
        method: "POST",
        headers: {
          ...(await await authHeaders(sessionToken)),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ships: [] }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.error).toBeDefined();
    });

    it("imports a single ship successfully", async () => {
      const { sessionToken } = await createTestUser(env.DB);

      // Seed the vehicle so import can match it
      await seedVehicle(env.DB, {
        slug: "gladius",
        name: "Gladius",
      });

      const entries = [
        {
          ship_code: "AEGS_Gladius",
          name: "Gladius",
          manufacturer_code: "AEGS",
          manufacturer_name: "Aegis Dynamics",
          lti: true,
          warbond: false,
          entity_type: "ship",
          pledge_id: "12345",
          pledge_name: "Gladius Standalone",
          pledge_date: "2024-01-01",
          pledge_cost: "$90.00",
        },
      ];

      const res = await SELF.fetch("http://localhost/api/import/hangarxplor", {
        method: "POST",
        headers: {
          ...(await await authHeaders(sessionToken)),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(entries),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.imported).toBe(1);
      expect(body.total).toBe(1);
      expect(body.message).toBe("Import complete");
    });

    it("clean-slate replaces existing fleet", async () => {
      const { userId, sessionToken } = await createTestUser(env.DB);

      // Pre-seed a vehicle and fleet entry
      const existingVehicle = await seedVehicle(env.DB, {
        slug: "aurora-mr-replace",
        name: "Aurora MR",
      });
      await seedFleetEntry(env.DB, userId, existingVehicle, {
        pledge_name: "Old Entry",
      });

      // Verify old entry exists
      const beforeRes = await SELF.fetch("http://localhost/api/vehicles", {
        headers: await authHeaders(sessionToken),
      });
      const beforeFleet = (await beforeRes.json()) as unknown[];
      expect(beforeFleet.length).toBe(1);

      // Import replaces everything with a new ship
      await seedVehicle(env.DB, {
        slug: "caterpillar",
        name: "Caterpillar",
      });

      const entries = [
        {
          ship_code: "DRAK_Caterpillar",
          name: "Caterpillar",
          manufacturer_code: "DRAK",
          manufacturer_name: "Drake Interplanetary",
          lti: false,
          insurance: "120 month",
          warbond: true,
          entity_type: "ship",
          pledge_id: "67890",
          pledge_name: "Cat Standalone",
          pledge_date: "2025-06-15",
          pledge_cost: "$295.00",
        },
      ];

      const importRes = await SELF.fetch(
        "http://localhost/api/import/hangarxplor",
        {
          method: "POST",
          headers: {
            ...(await await authHeaders(sessionToken)),
            "Content-Type": "application/json",
          },
          body: JSON.stringify(entries),
        }
      );
      expect(importRes.status).toBe(200);

      // Verify fleet was replaced — old Aurora MR should be gone
      const afterRes = await SELF.fetch("http://localhost/api/vehicles", {
        headers: await authHeaders(sessionToken),
      });
      const afterFleet = (await afterRes.json()) as Array<
        Record<string, unknown>
      >;
      expect(afterFleet.length).toBe(1);
      expect(afterFleet[0].vehicle_name).toBe("Caterpillar");
    });

    it("handles empty array gracefully", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const res = await SELF.fetch("http://localhost/api/import/hangarxplor", {
        method: "POST",
        headers: {
          ...(await await authHeaders(sessionToken)),
          "Content-Type": "application/json",
        },
        body: JSON.stringify([]),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.imported).toBe(0);
      expect(body.total).toBe(0);
    });

    it("creates stub vehicles for unknown ships", async () => {
      const { sessionToken } = await createTestUser(env.DB);

      const entries = [
        {
          ship_code: "XENO_UnknownShip",
          name: "Unknown Ship",
          manufacturer_code: "XENO",
          manufacturer_name: "Xeno Corp",
          lti: true,
          warbond: false,
          entity_type: "ship",
          pledge_id: "99999",
          pledge_name: "Unknown Pack",
          pledge_date: "2025-01-01",
          pledge_cost: "$0.00",
        },
      ];

      const res = await SELF.fetch("http://localhost/api/import/hangarxplor", {
        method: "POST",
        headers: {
          ...(await await authHeaders(sessionToken)),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(entries),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.imported).toBe(1);
    });

    it("detects custom ship names", async () => {
      const { sessionToken } = await createTestUser(env.DB);

      await seedVehicle(env.DB, {
        slug: "carrack",
        name: "Carrack",
      });

      const entries = [
        {
          ship_code: "RSI_Carrack",
          ship_name: "Jean-Luc",
          name: "Carrack",
          manufacturer_code: "RSI",
          manufacturer_name: "Roberts Space Industries",
          lti: true,
          warbond: false,
          entity_type: "ship",
          pledge_id: "44444",
          pledge_name: "Carrack LTI",
          pledge_date: "2024-06-01",
          pledge_cost: "$600.00",
        },
      ];

      const res = await SELF.fetch("http://localhost/api/import/hangarxplor", {
        method: "POST",
        headers: {
          ...(await await authHeaders(sessionToken)),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(entries),
      });
      expect(res.status).toBe(200);

      // Check that custom_name was set
      const fleetRes = await SELF.fetch("http://localhost/api/vehicles", {
        headers: await authHeaders(sessionToken),
      });
      const fleet = (await fleetRes.json()) as Array<Record<string, unknown>>;
      const carrack = fleet.find((s) => s.vehicle_name === "Carrack");
      expect(carrack).toBeDefined();
      expect(carrack!.custom_name).toBe("Jean-Luc");
    });

    it("does not affect other users' fleets", async () => {
      const user1 = await createTestUser(env.DB);
      const user2 = await createTestUser(env.DB);

      const vehicle = await seedVehicle(env.DB, {
        slug: "isolation-ship",
        name: "Isolation Ship",
      });
      await seedFleetEntry(env.DB, user1.userId, vehicle);

      // User2 imports — should not affect user1
      const res = await SELF.fetch("http://localhost/api/import/hangarxplor", {
        method: "POST",
        headers: {
          ...(await authHeaders(user2.sessionToken)),
          "Content-Type": "application/json",
        },
        body: JSON.stringify([]),
      });
      expect(res.status).toBe(200);

      // User1's fleet should still have the ship
      const fleetRes = await SELF.fetch("http://localhost/api/vehicles", {
        headers: await authHeaders(user1.sessionToken),
      });
      const fleet = (await fleetRes.json()) as unknown[];
      expect(fleet.length).toBe(1);
    });
  });
});
