import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders, seedVehicle, seedFleetEntry } from "./helpers";

async function seedLoaner(vehicleId: number, loanerId: number) {
  await env.DB.prepare(
    "INSERT OR IGNORE INTO vehicle_loaners (vehicle_id, loaner_id) VALUES (?, ?)",
  )
    .bind(vehicleId, loanerId)
    .run();
}

describe("Fleet Loaners API — /api/vehicles/loaners", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  it("requires authentication", async () => {
    const res = await SELF.fetch("http://localhost/api/vehicles/loaners");
    expect(res.status).toBe(401);
  });

  it("returns no loaners when the user only owns flight-ready ships", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const fr = await seedVehicle(env.DB, {
      slug: "ln-fr-only",
      name: "Aurora FR",
      production_status_id: 1, // flight_ready
    });
    const loaner = await seedVehicle(env.DB, { slug: "ln-fr-loaner", name: "Mustang" });
    // A flight-ready ship may have a matrix entry, but it must NOT yield loaners.
    await seedLoaner(fr, loaner);
    await seedFleetEntry(env.DB, userId, fr);

    const res = await SELF.fetch("http://localhost/api/vehicles/loaners", {
      headers: await authHeaders(sessionToken),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("derives the loaner for an owned concept ship", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const concept = await seedVehicle(env.DB, {
      slug: "ln-odin",
      name: "Odin",
      production_status_id: 3, // in_concept
    });
    const loaner = await seedVehicle(env.DB, {
      slug: "ln-idris",
      name: "Idris-P",
      production_status_id: 1,
    });
    await seedLoaner(concept, loaner);
    await seedFleetEntry(env.DB, userId, concept);

    const res = await SELF.fetch("http://localhost/api/vehicles/loaners", {
      headers: await authHeaders(sessionToken),
    });
    const loaners = (await res.json()) as Array<Record<string, unknown>>;
    expect(loaners).toHaveLength(1);
    expect(loaners[0].vehicle_name).toBe("Idris-P");
    expect(loaners[0].vehicle_slug).toBe("ln-idris");
    expect(loaners[0].is_derived_loaner).toBe(1);
    expect(loaners[0].loaner_for).toBe("Odin");
  });

  it("dedupes a loaner granted by multiple owned ships, listing each in loaner_for", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const c1 = await seedVehicle(env.DB, { slug: "ln-c1", name: "Concept One", production_status_id: 3 });
    const c2 = await seedVehicle(env.DB, { slug: "ln-c2", name: "Concept Two", production_status_id: 2 });
    const shared = await seedVehicle(env.DB, { slug: "ln-shared", name: "Shared Loaner" });
    await seedLoaner(c1, shared);
    await seedLoaner(c2, shared);
    await seedFleetEntry(env.DB, userId, c1);
    await seedFleetEntry(env.DB, userId, c2);

    const res = await SELF.fetch("http://localhost/api/vehicles/loaners", {
      headers: await authHeaders(sessionToken),
    });
    const loaners = (await res.json()) as Array<Record<string, unknown>>;
    expect(loaners).toHaveLength(1);
    expect(loaners[0].vehicle_name).toBe("Shared Loaner");
    expect(String(loaners[0].loaner_for)).toContain("Concept One");
    expect(String(loaners[0].loaner_for)).toContain("Concept Two");
  });

  it("excludes a loaner ship the user already owns", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const concept = await seedVehicle(env.DB, { slug: "ln-own-concept", name: "Owned Concept", production_status_id: 3 });
    const loaner = await seedVehicle(env.DB, { slug: "ln-own-loaner", name: "Already Owned" });
    await seedLoaner(concept, loaner);
    await seedFleetEntry(env.DB, userId, concept);
    await seedFleetEntry(env.DB, userId, loaner); // user already owns the loaner ship

    const res = await SELF.fetch("http://localhost/api/vehicles/loaners", {
      headers: await authHeaders(sessionToken),
    });
    expect(await res.json()).toEqual([]);
  });

  it("only returns the authenticated user's loaners", async () => {
    const u1 = await createTestUser(env.DB);
    const u2 = await createTestUser(env.DB);
    const concept = await seedVehicle(env.DB, { slug: "ln-iso-concept", name: "Iso Concept", production_status_id: 3 });
    const loaner = await seedVehicle(env.DB, { slug: "ln-iso-loaner", name: "Iso Loaner" });
    await seedLoaner(concept, loaner);
    await seedFleetEntry(env.DB, u2.userId, concept); // only u2 owns it

    const res = await SELF.fetch("http://localhost/api/vehicles/loaners", {
      headers: await authHeaders(u1.sessionToken),
    });
    expect(await res.json()).toEqual([]);
  });
});
