import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, seedVehicle, seedFleetEntry } from "./helpers";

async function setHandle(userId: string, handle: string) {
  await env.DB.prepare(
    `INSERT INTO user_rsi_profile (user_id, handle, verified_handle, verified_at, fetched_at)
     VALUES (?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET verified_handle = excluded.verified_handle, verified_at = excluded.verified_at`,
  )
    .bind(userId, handle, handle)
    .run();
}

async function enableShare(userId: string) {
  await env.DB.prepare(
    `INSERT INTO user_settings (user_id, key, value)
     VALUES (?, 'publicFleetShare', 'true')
     ON CONFLICT(user_id, key) DO UPDATE SET value = 'true'`,
  )
    .bind(userId)
    .run();
}

async function setOrgVisibility(fleetId: number, visibility: string) {
  await env.DB.prepare(`UPDATE user_fleet SET org_visibility = ? WHERE id = ?`)
    .bind(visibility, fleetId)
    .run();
}

describe("Public Fleet API — /api/u/:handle/fleet", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  it("returns 404 for unknown handle", async () => {
    const res = await SELF.fetch("http://localhost/api/u/nobody/fleet");
    expect(res.status).toBe(404);
  });

  it("returns 404 when handle exists but toggle is off", async () => {
    const { userId } = await createTestUser(env.DB);
    await setHandle(userId, "alice");
    const res = await SELF.fetch("http://localhost/api/u/alice/fleet");
    expect(res.status).toBe(404);
  });

  it("returns 200 with empty ships array when toggle is on but no ships are public", async () => {
    const { userId } = await createTestUser(env.DB);
    await setHandle(userId, "bob");
    await enableShare(userId);
    const vehicleId = await seedVehicle(env.DB, { slug: "aurora-mr-bob", name: "Aurora MR" });
    await seedFleetEntry(env.DB, userId, vehicleId, {});

    const res = await SELF.fetch("http://localhost/api/u/bob/fleet");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { handle: string; ships: unknown[] };
    expect(body.handle).toBe("bob");
    expect(body.ships).toEqual([]);
  });

  it("returns only ships with org_visibility = 'public'", async () => {
    const { userId } = await createTestUser(env.DB);
    await setHandle(userId, "carol");
    await enableShare(userId);
    const v1 = await seedVehicle(env.DB, { slug: "gladius-carol", name: "Gladius" });
    const v2 = await seedVehicle(env.DB, { slug: "carrack-carol", name: "Carrack" });
    const f1 = await seedFleetEntry(env.DB, userId, v1, {});
    const f2 = await seedFleetEntry(env.DB, userId, v2, {});
    await setOrgVisibility(f1, "public");
    await setOrgVisibility(f2, "private");

    const res = await SELF.fetch("http://localhost/api/u/carol/fleet");
    const body = (await res.json()) as { ships: Array<{ vehicle_name: string }> };
    expect(body.ships).toHaveLength(1);
    expect(body.ships[0].vehicle_name).toBe("Gladius");
  });

  it("strips money fields from the response", async () => {
    const { userId } = await createTestUser(env.DB);
    await setHandle(userId, "dave");
    await enableShare(userId);
    const vid = await seedVehicle(env.DB, { slug: "idris-dave", name: "Idris" });
    const fid = await seedFleetEntry(env.DB, userId, vid, {
      pledge_cost: "$2700.00",
      pledge_name: "Idris-P LTI",
      pledge_id: "9999",
    });
    await setOrgVisibility(fid, "public");

    const res = await SELF.fetch("http://localhost/api/u/dave/fleet");
    const body = (await res.json()) as { ships: Array<Record<string, unknown>> };
    const ship = body.ships[0];
    expect(ship.vehicle_name).toBe("Idris");
    expect(ship).not.toHaveProperty("pledge_cost");
    expect(ship).not.toHaveProperty("pledge_name");
    expect(ship).not.toHaveProperty("pledge_id");
    expect(ship).not.toHaveProperty("pledge_price");
    expect(ship).not.toHaveProperty("current_value_cents");
    expect(ship).not.toHaveProperty("warbond");
    expect(ship).not.toHaveProperty("is_loaner");
    expect(ship).not.toHaveProperty("original_vehicle_name");
  });

  it("includes insurance details (label, lifetime, duration)", async () => {
    const { userId } = await createTestUser(env.DB);
    await setHandle(userId, "eve");
    await enableShare(userId);
    const vid = await seedVehicle(env.DB, { slug: "polaris-eve", name: "Polaris" });
    const fid = await seedFleetEntry(env.DB, userId, vid, {
      insurance_type_id: 1,
    });
    await setOrgVisibility(fid, "public");

    const res = await SELF.fetch("http://localhost/api/u/eve/fleet");
    const body = (await res.json()) as { ships: Array<Record<string, unknown>> };
    expect(body.ships[0].insurance_label).toBe("Lifetime Insurance");
    expect(body.ships[0].is_lifetime).toBe(1);
  });

  it("resolves handle case-insensitively", async () => {
    const { userId } = await createTestUser(env.DB);
    await setHandle(userId, "Frank");
    await enableShare(userId);
    const vid = await seedVehicle(env.DB, { slug: "freelancer-frank", name: "Freelancer" });
    const fid = await seedFleetEntry(env.DB, userId, vid, {});
    await setOrgVisibility(fid, "public");

    const lower = await SELF.fetch("http://localhost/api/u/frank/fleet");
    expect(lower.status).toBe(200);
    const upper = await SELF.fetch("http://localhost/api/u/FRANK/fleet");
    expect(upper.status).toBe(200);
  });

  it("returns the verified handle (canonical case) in the response body", async () => {
    const { userId } = await createTestUser(env.DB);
    await setHandle(userId, "Gavin");
    await enableShare(userId);
    const res = await SELF.fetch("http://localhost/api/u/gavin/fleet");
    const body = (await res.json()) as { handle: string };
    expect(body.handle).toBe("Gavin");
  });
});
