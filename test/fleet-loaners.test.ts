import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders, seedVehicle, seedFleetEntry } from "./helpers";
import { getOrCreatePrimaryAccountId } from "../src/lib/rsi-accounts";
import { getEntitledLoaners } from "../src/db/queries";

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

  describe("per RSI account", () => {
    async function secondAccount(userId: string): Promise<number> {
      await env.DB.prepare(
        "INSERT INTO user_rsi_accounts (user_id, label, is_primary, is_placeholder) VALUES (?, 'Alt', 0, 1)",
      )
        .bind(userId)
        .run();
      const row = await env.DB.prepare(
        "SELECT id FROM user_rsi_accounts WHERE user_id = ? AND is_primary = 0 ORDER BY id DESC LIMIT 1",
      )
        .bind(userId)
        .first<{ id: number }>();
      return row!.id;
    }
    async function seedOn(userId: string, vehicleId: number, accountId: number) {
      await env.DB.prepare(
        `INSERT INTO user_fleet (user_id, vehicle_id, is_loaner, imported_at, rsi_account_id)
         VALUES (?, ?, 0, datetime('now'), ?)`,
      )
        .bind(userId, vehicleId, accountId)
        .run();
    }
    async function list(sessionToken: string) {
      const res = await SELF.fetch("http://localhost/api/vehicles/loaners", {
        headers: await authHeaders(sessionToken),
      });
      return (await res.json()) as Array<Record<string, unknown>>;
    }

    it("one loaner row per entitled account", async () => {
      const { userId, sessionToken } = await createTestUser(env.DB);
      const a = await getOrCreatePrimaryAccountId(env.DB, userId);
      const b = await secondAccount(userId);
      const concept = await seedVehicle(env.DB, { slug: "pa-c1", name: "PA Concept", production_status_id: 3 });
      const loaner = await seedVehicle(env.DB, { slug: "pa-l1", name: "PA Loaner" });
      await seedLoaner(concept, loaner);
      await seedOn(userId, concept, a);
      await seedOn(userId, concept, b);

      const rows = await list(sessionToken);
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.rsi_account_id).sort()).toEqual([a, b].sort());
    });

    it("owning the ship on another account keeps the loaner", async () => {
      const { userId, sessionToken } = await createTestUser(env.DB);
      const a = await getOrCreatePrimaryAccountId(env.DB, userId);
      const b = await secondAccount(userId);
      const concept = await seedVehicle(env.DB, { slug: "pa-c2", name: "PA Concept 2", production_status_id: 3 });
      const loaner = await seedVehicle(env.DB, { slug: "pa-l2", name: "PA Loaner 2" });
      await seedLoaner(concept, loaner);
      await seedOn(userId, concept, a);
      await seedOn(userId, loaner, b);

      const rows = await list(sessionToken);
      expect(rows).toHaveLength(1);
      expect(rows[0].rsi_account_id).toBe(a);
    });

    it("owning the ship on the same account hides the loaner", async () => {
      const { userId, sessionToken } = await createTestUser(env.DB);
      const a = await getOrCreatePrimaryAccountId(env.DB, userId);
      const concept = await seedVehicle(env.DB, { slug: "pa-c3", name: "PA Concept 3", production_status_id: 3 });
      const loaner = await seedVehicle(env.DB, { slug: "pa-l3", name: "PA Loaner 3" });
      await seedLoaner(concept, loaner);
      await seedOn(userId, concept, a);
      await seedOn(userId, loaner, a);

      expect(await list(sessionToken)).toEqual([]);
    });

    it("getEntitledLoaners scopes to the given accounts", async () => {
      const { userId } = await createTestUser(env.DB);
      const a = await getOrCreatePrimaryAccountId(env.DB, userId);
      const b = await secondAccount(userId);
      const ca = await seedVehicle(env.DB, { slug: `pa-ca-${crypto.randomUUID().slice(0, 6)}`, name: "PA CA", production_status_id: 3 });
      const cb = await seedVehicle(env.DB, { slug: `pa-cb-${crypto.randomUUID().slice(0, 6)}`, name: "PA CB", production_status_id: 3 });
      const la = await seedVehicle(env.DB, { slug: `pa-la-${crypto.randomUUID().slice(0, 6)}`, name: "PA LA" });
      const lb = await seedVehicle(env.DB, { slug: `pa-lb-${crypto.randomUUID().slice(0, 6)}`, name: "PA LB" });
      await seedLoaner(ca, la);
      await seedLoaner(cb, lb);
      await seedOn(userId, ca, a);
      await seedOn(userId, cb, b);

      const onlyA = await getEntitledLoaners(env.DB, userId, [a]);
      expect(onlyA).toEqual([{ loaner: "PA LA", granted_by: "PA CA", rsi_account_id: a }]);
      const all = await getEntitledLoaners(env.DB, userId, null);
      expect(all.map((r) => r.loaner).sort()).toEqual(["PA LA", "PA LB"]);
    });
  });
});
