import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, seedVehicle, seedFleetEntry, authHeaders } from "./helpers";

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

async function setExtensionHandle(userId: string, handle: string) {
  await env.DB.prepare(
    `INSERT INTO user_rsi_profiles (user_id, rsi_handle, synced_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET rsi_handle = excluded.rsi_handle, synced_at = datetime('now')`,
  )
    .bind(userId, handle)
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

  it("returns 200 with empty ships array when toggle is on but the fleet is empty", async () => {
    const { userId } = await createTestUser(env.DB);
    await setHandle(userId, "bob");
    await enableShare(userId);

    const res = await SELF.fetch("http://localhost/api/u/bob/fleet");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { handle: string; ships: unknown[] };
    expect(body.handle).toBe("bob");
    expect(body.ships).toEqual([]);
  });

  it("returns every ship regardless of org_visibility (org roster and public page are distinct)", async () => {
    const { userId } = await createTestUser(env.DB);
    await setHandle(userId, "carol");
    await enableShare(userId);
    const v1 = await seedVehicle(env.DB, { slug: "gladius-carol", name: "Gladius" });
    const v2 = await seedVehicle(env.DB, { slug: "carrack-carol", name: "Carrack" });
    const v3 = await seedVehicle(env.DB, { slug: "polaris-carol", name: "Polaris" });
    const f1 = await seedFleetEntry(env.DB, userId, v1, {});
    const f2 = await seedFleetEntry(env.DB, userId, v2, {});
    const f3 = await seedFleetEntry(env.DB, userId, v3, {});
    await setOrgVisibility(f1, "public");
    await setOrgVisibility(f2, "private");
    await setOrgVisibility(f3, "officers");

    const res = await SELF.fetch("http://localhost/api/u/carol/fleet");
    const body = (await res.json()) as { ships: Array<{ vehicle_name: string }> };
    expect(body.ships.map((s) => s.vehicle_name)).toEqual(["Carrack", "Gladius", "Polaris"]);
  });

  it("strips money fields from the response", async () => {
    const { userId } = await createTestUser(env.DB);
    await setHandle(userId, "dave");
    await enableShare(userId);
    const vid = await seedVehicle(env.DB, { slug: "idris-dave", name: "Idris" });
    await seedFleetEntry(env.DB, userId, vid, {
      pledge_cost: "$2700.00",
      pledge_name: "Idris-P LTI",
      pledge_id: "9999",
    });

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
    await seedFleetEntry(env.DB, userId, vid, {
      insurance_type_id: 1,
    });

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
    await seedFleetEntry(env.DB, userId, vid, {});

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

  it("resolves extension-verified user (no user_rsi_profile row, only user_rsi_profiles)", async () => {
    const { userId } = await createTestUser(env.DB);
    await setExtensionHandle(userId, "ExtUser");
    await enableShare(userId);
    const vid = await seedVehicle(env.DB, { slug: "aurora-extuser", name: "Aurora LN" });
    await seedFleetEntry(env.DB, userId, vid, {});

    const res = await SELF.fetch("http://localhost/api/u/ExtUser/fleet");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { handle: string; ships: Array<{ vehicle_name: string }> };
    expect(body.handle).toBe("ExtUser");
    expect(body.ships).toHaveLength(1);
    expect(body.ships[0].vehicle_name).toBe("Aurora LN");
  });

  it("extension-verified lookup is case-insensitive", async () => {
    const { userId } = await createTestUser(env.DB);
    await setExtensionHandle(userId, "MixedCaseExt");
    await enableShare(userId);
    const vid = await seedVehicle(env.DB, { slug: "gladius-mixed", name: "Gladius" });
    await seedFleetEntry(env.DB, userId, vid, {});

    const res = await SELF.fetch("http://localhost/api/u/mixedcaseext/fleet");
    expect(res.status).toBe(200);
  });

  it("when user has both manual + extension verification, manual handle takes precedence", async () => {
    const { userId } = await createTestUser(env.DB);
    await setHandle(userId, "ManualName");
    await setExtensionHandle(userId, "ExtName");
    await enableShare(userId);

    // Both names should resolve to the same user (manual preferred in canonical case)
    const m = await SELF.fetch("http://localhost/api/u/ManualName/fleet");
    expect(m.status).toBe(200);
    const mBody = (await m.json()) as { handle: string };
    expect(mBody.handle).toBe("ManualName");

    const e = await SELF.fetch("http://localhost/api/u/ExtName/fleet");
    expect(e.status).toBe(200);
  });

  it("org visibility changes do not affect the public page", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    await setHandle(userId, "Helen");
    await enableShare(userId);
    const v1 = await seedVehicle(env.DB, { slug: "cutlass-helen", name: "Cutlass Black" });
    const fleetId = await seedFleetEntry(env.DB, userId, v1, {});

    const patch = await SELF.fetch(`http://localhost/api/vehicles/${fleetId}/visibility`, {
      method: "PATCH",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ org_visibility: "officers" }),
    });
    expect(patch.status).toBe(200);

    const res = await SELF.fetch("http://localhost/api/u/helen/fleet");
    const body = (await res.json()) as {
      ships: Array<{ vehicle_name: string; org_visibility: string }>;
    };
    expect(body.ships).toHaveLength(1);
    expect(body.ships[0].vehicle_name).toBe("Cutlass Black");
    expect(body.ships[0].org_visibility).toBe("officers");
  });

  it("adding a ship shows on the public page (cache purged on fleet writes)", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    await setExtensionHandle(userId, "ExtPurge");
    await enableShare(userId);
    const vid = await seedVehicle(env.DB, { slug: "cutlass-extpurge", name: "Cutlass Black" });

    let res = await SELF.fetch("http://localhost/api/u/ExtPurge/fleet");
    let body = (await res.json()) as { ships: unknown[] };
    expect(body.ships).toHaveLength(0);

    const add = await SELF.fetch("http://localhost/api/vehicles/ingame", {
      method: "POST",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ vehicle_id: vid }),
    });
    expect(add.status).toBe(200);

    // Test env bypasses KV; in prod the explicit purge on fleet writes keeps this fresh.
    res = await SELF.fetch("http://localhost/api/u/ExtPurge/fleet");
    body = (await res.json()) as { ships: Array<{ vehicle_name: string }> };
    expect(body.ships).toHaveLength(1);
  });
});

describe("Public Fleet page — /u/:handle/fleet (non-JS clients)", () => {
  it("serves the roster, title and Open Graph tags in the HTML shell", async () => {
    const { userId } = await createTestUser(env.DB);
    await setHandle(userId, "ShellUser");
    await enableShare(userId);
    const vid = await seedVehicle(env.DB, { slug: "carrack-shell", name: "Carrack" });
    await seedFleetEntry(env.DB, userId, vid, { custom_name: "Jean-Luc" });

    const res = await SELF.fetch("http://localhost/u/shelluser/fleet");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("<title>ShellUser's Fleet — SC Bridge</title>");
    expect(html).toContain(`property="og:description" content="1 ship shared publicly on SC Bridge"`);
    expect(html).toContain("Carrack");
    expect(html).toContain("Jean-Luc");
    expect(html).toMatch(/<div id="root">\s*<main/);
  });

  it("serves a not-found shell for an unknown handle", async () => {
    const res = await SELF.fetch("http://localhost/u/nobody-here/fleet");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("No public fleet for");
    expect(html).not.toContain("og:description");
  });

  it("leaves other SPA routes untouched", async () => {
    const res = await SELF.fetch("http://localhost/ships");
    const html = await res.text();
    expect(html).toContain("<title>SC Bridge — Star Citizen Companion</title>");
    expect(html).toMatch(/<div id="root"><\/div>/);
  });
});
