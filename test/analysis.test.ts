import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders, seedVehicle, seedFleetEntry } from "./helpers";

describe("Analysis API — /api/analysis", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  describe("GET /api/analysis", () => {
    it("returns analysis structure for empty fleet", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const res = await SELF.fetch("http://localhost/api/analysis", {
        headers: await authHeaders(sessionToken),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty("overview");
      expect(body).toHaveProperty("size_distribution");
      expect(body).toHaveProperty("role_categories");
      expect(body).toHaveProperty("gap_analysis");
      expect(body).toHaveProperty("redundancies");
      expect(body).toHaveProperty("insurance_summary");
    });

    it("overview has correct totals for empty fleet", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const res = await SELF.fetch("http://localhost/api/analysis", {
        headers: await authHeaders(sessionToken),
      });
      const body = (await res.json()) as { overview: Record<string, number> };
      expect(body.overview.total_vehicles).toBe(0);
      expect(body.overview.flight_ready).toBe(0);
      expect(body.overview.total_cargo).toBe(0);
      expect(body.overview.lti_count).toBe(0);
    });

    it("correctly counts fleet with multiple ships", async () => {
      const { userId, sessionToken } = await createTestUser(env.DB);

      const fighter = await seedVehicle(env.DB, {
        slug: "analysis-gladius",
        name: "Gladius",
        focus: "Light Fighter",
        size_label: "Small",
        cargo: 0,
        crew_min: 1,
        crew_max: 1,
        pledge_price: 90,
        production_status_id: 1, // flight_ready
      });

      const hauler = await seedVehicle(env.DB, {
        slug: "analysis-caterpillar",
        name: "Caterpillar",
        focus: "Cargo",
        size_label: "Large",
        cargo: 576,
        crew_min: 1,
        crew_max: 5,
        pledge_price: 295,
        production_status_id: 1,
      });

      await seedFleetEntry(env.DB, userId, fighter, {
        insurance_type_id: 1, // LTI
      });
      await seedFleetEntry(env.DB, userId, hauler, {
        insurance_type_id: 2, // 120-month
      });

      const res = await SELF.fetch("http://localhost/api/analysis", {
        headers: await authHeaders(sessionToken),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        overview: Record<string, number>;
        size_distribution: Record<string, number>;
        role_categories: Record<string, string[]>;
        insurance_summary: Record<string, unknown[]>;
      };

      expect(body.overview.total_vehicles).toBe(2);
      expect(body.overview.flight_ready).toBe(2);
      expect(body.overview.total_cargo).toBe(576);
      expect(body.overview.lti_count).toBe(1);
      expect(body.overview.non_lti_count).toBe(1);
      expect(body.overview.min_crew).toBe(2); // 1 + 1
      expect(body.overview.max_crew).toBe(6); // 1 + 5
    });

    it("detects role gaps correctly", async () => {
      const { userId, sessionToken } = await createTestUser(env.DB);

      // Only combat ships — should detect Mining, Salvage, Medical, etc. as gaps
      const fighter = await seedVehicle(env.DB, {
        slug: "gap-analysis-fighter",
        name: "Sabre",
        focus: "Stealth Fighter",
      });
      await seedFleetEntry(env.DB, userId, fighter);

      const res = await SELF.fetch("http://localhost/api/analysis", {
        headers: await authHeaders(sessionToken),
      });
      const body = (await res.json()) as {
        gap_analysis: Array<{ role: string; priority: string }>;
      };

      const gapRoles = body.gap_analysis.map((g) => g.role);
      expect(gapRoles).toContain("Mining");
      expect(gapRoles).toContain("Salvage");
      // Should NOT include Combat since we have a fighter
      expect(gapRoles).not.toContain("Combat");
    });

    it("detects redundancies when 3+ ships share a focus", async () => {
      const { userId, sessionToken } = await createTestUser(env.DB);

      // 3 light fighters = redundancy
      for (let i = 0; i < 3; i++) {
        const vid = await seedVehicle(env.DB, {
          slug: `redundancy-fighter-${i}`,
          name: `Fighter ${i}`,
          focus: "Light Fighter",
        });
        await seedFleetEntry(env.DB, userId, vid);
      }

      const res = await SELF.fetch("http://localhost/api/analysis", {
        headers: await authHeaders(sessionToken),
      });
      const body = (await res.json()) as {
        redundancies: Array<{ role: string; ships: string[] }>;
      };

      expect(body.redundancies).toHaveLength(1);
      expect(body.redundancies[0].role).toBe("Light Fighter");
      expect(body.redundancies[0].ships).toHaveLength(3);
    });

    it("insurance_summary categorizes ships correctly", async () => {
      const { userId, sessionToken } = await createTestUser(env.DB);

      const ltiShip = await seedVehicle(env.DB, {
        slug: "ins-lti-ship",
        name: "LTI Ship",
      });
      const nonLtiShip = await seedVehicle(env.DB, {
        slug: "ins-nonlti-ship",
        name: "Non-LTI Ship",
      });
      const unknownShip = await seedVehicle(env.DB, {
        slug: "ins-unknown-ship",
        name: "Unknown Insurance Ship",
      });

      await seedFleetEntry(env.DB, userId, ltiShip, { insurance_type_id: 1 }); // LTI
      await seedFleetEntry(env.DB, userId, nonLtiShip, { insurance_type_id: 2 }); // 120-month
      await seedFleetEntry(env.DB, userId, unknownShip); // no insurance

      const res = await SELF.fetch("http://localhost/api/analysis", {
        headers: await authHeaders(sessionToken),
      });
      const body = (await res.json()) as {
        insurance_summary: {
          lti_ships: unknown[];
          non_lti_ships: unknown[];
          unknown_ships: unknown[];
        };
      };

      expect(body.insurance_summary.lti_ships).toHaveLength(1);
      expect(body.insurance_summary.non_lti_ships).toHaveLength(1);
      expect(body.insurance_summary.unknown_ships).toHaveLength(1);
    });

    it("size_distribution groups ships by size", async () => {
      const { userId, sessionToken } = await createTestUser(env.DB);

      const small = await seedVehicle(env.DB, {
        slug: "size-small",
        name: "Small Ship",
        size_label: "Small",
      });
      const medium = await seedVehicle(env.DB, {
        slug: "size-medium",
        name: "Medium Ship",
        size_label: "Medium",
      });

      await seedFleetEntry(env.DB, userId, small);
      await seedFleetEntry(env.DB, userId, medium);
      await seedFleetEntry(env.DB, userId, small); // second small

      const res = await SELF.fetch("http://localhost/api/analysis", {
        headers: await authHeaders(sessionToken),
      });
      const body = (await res.json()) as {
        size_distribution: Record<string, number>;
      };

      expect(body.size_distribution.Small).toBe(2);
      expect(body.size_distribution.Medium).toBe(1);
    });
  });
});
