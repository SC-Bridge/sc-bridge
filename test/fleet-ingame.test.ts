import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { setupTestDatabase } from "./apply-migrations";
import { seedVehicle, createTestUser, authHeaders } from "./helpers";
import { executeFleetSwap } from "../src/lib/fleet-import";

/**
 * In-game-purchased ships (migration 0261). Stored as user_fleet rows tagged
 * source='ingame' so they show in the fleet, survive HangarXplor re-imports,
 * and can be bulk-cleared after a server wipe.
 */
describe("In-game-purchased ships", () => {
  let vid: number;
  let vid2: number;
  let sessionToken: string;
  let userId: string;

  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    vid = await seedVehicle(env.DB, { slug: "ingame-a", name: "Ingame Ship A" });
    vid2 = await seedVehicle(env.DB, { slug: "ingame-b", name: "Ingame Ship B" });
    const user = await createTestUser(env.DB);
    sessionToken = user.sessionToken;
    userId = user.userId;
  });

  const jsonAuth = async () => ({ ...(await authHeaders(sessionToken)), "Content-Type": "application/json" });

  it("POST /ingame adds a ship that appears in the fleet tagged source='ingame'", async () => {
    const res = await SELF.fetch("http://localhost/api/vehicles/ingame", {
      method: "POST", headers: await jsonAuth(),
      body: JSON.stringify({ vehicle_id: vid, custom_name: "My aUEC Ship" }),
    });
    expect(res.status).toBe(200);

    const fleet = await (await SELF.fetch("http://localhost/api/vehicles", { headers: await authHeaders(sessionToken) })).json() as Array<Record<string, unknown>>;
    const added = fleet.find((s) => s.vehicle_id === vid);
    expect(added).toBeTruthy();
    expect(added!.source).toBe("ingame");
    expect(added!.custom_name).toBe("My aUEC Ship");
  });

  it("POST /ingame 404s for a non-existent vehicle", async () => {
    const res = await SELF.fetch("http://localhost/api/vehicles/ingame", {
      method: "POST", headers: await jsonAuth(),
      body: JSON.stringify({ vehicle_id: 99999999 }),
    });
    expect(res.status).toBe(404);
  });

  it("DELETE /ingame/:id removes a single in-game ship", async () => {
    const row = await env.DB.prepare("SELECT id FROM user_fleet WHERE user_id = ? AND vehicle_id = ? AND source = 'ingame'").bind(userId, vid).first<{ id: number }>();
    const del = await SELF.fetch(`http://localhost/api/vehicles/ingame/${row!.id}`, {
      method: "DELETE", headers: { ...(await authHeaders(sessionToken)), "Content-Length": "0" },
    });
    expect(del.status).toBe(200);
    const still = await env.DB.prepare("SELECT id FROM user_fleet WHERE id = ?").bind(row!.id).first();
    expect(still).toBeNull();
  });

  it("DELETE /ingame/:id will NOT delete a pledge (imported) ship", async () => {
    await env.DB.prepare(
      "INSERT INTO user_fleet (user_id, vehicle_id, source, pledge_id, imported_at) VALUES (?, ?, 'pledge', '555', datetime('now'))",
    ).bind(userId, vid2).run();
    const pledge = await env.DB.prepare("SELECT id FROM user_fleet WHERE user_id = ? AND vehicle_id = ? AND source = 'pledge'").bind(userId, vid2).first<{ id: number }>();
    const del = await SELF.fetch(`http://localhost/api/vehicles/ingame/${pledge!.id}`, {
      method: "DELETE", headers: { ...(await authHeaders(sessionToken)), "Content-Length": "0" },
    });
    expect(del.status).toBe(404); // not an in-game ship → not deletable here
    const still = await env.DB.prepare("SELECT id FROM user_fleet WHERE id = ?").bind(pledge!.id).first();
    expect(still).toBeTruthy();
  });

  it("DELETE /ingame clears ALL in-game ships but leaves pledge ships", async () => {
    // add two in-game ships
    for (const v of [vid, vid2]) {
      await SELF.fetch("http://localhost/api/vehicles/ingame", {
        method: "POST", headers: await jsonAuth(), body: JSON.stringify({ vehicle_id: v }),
      });
    }
    const del = await SELF.fetch("http://localhost/api/vehicles/ingame", {
      method: "DELETE", headers: { ...(await authHeaders(sessionToken)), "Content-Length": "0" },
    });
    expect(del.status).toBe(200);
    const counts = await env.DB.prepare(
      "SELECT source, COUNT(*) n FROM user_fleet WHERE user_id = ? GROUP BY source",
    ).bind(userId).all<{ source: string; n: number }>();
    const bySource = Object.fromEntries(counts.results.map((r) => [r.source, r.n]));
    expect(bySource.ingame ?? 0).toBe(0);
    expect(bySource.pledge ?? 0).toBeGreaterThan(0); // pledge ship from earlier test remains
  });

  it("re-import (executeFleetSwap) preserves in-game ships, sweeps stale pledge rows", async () => {
    const u = await createTestUser(env.DB);
    // Seed an OLD in-game ship + an OLD pledge ship.
    await env.DB.batch([
      env.DB.prepare("INSERT INTO user_fleet (user_id, vehicle_id, source, imported_at) VALUES (?, ?, 'ingame', '2020-01-01 00:00:00')").bind(u.userId, vid),
      env.DB.prepare("INSERT INTO user_fleet (user_id, vehicle_id, source, pledge_id, imported_at) VALUES (?, ?, 'pledge', '111', '2020-01-01 00:00:00')").bind(u.userId, vid2),
    ]);
    // Run a new import: insert one fresh pledge row tagged with the new importTag, then sweep.
    const tag = "2030-01-01 00:00:00";
    await executeFleetSwap(env.DB, u.userId, [
      env.DB.prepare("INSERT INTO user_fleet (user_id, vehicle_id, source, pledge_id, imported_at) VALUES (?, ?, 'pledge', '222', ?)").bind(u.userId, vid2, tag),
    ], tag);

    const rows = await env.DB.prepare("SELECT source, pledge_id, imported_at FROM user_fleet WHERE user_id = ?").bind(u.userId).all<{ source: string; pledge_id: string | null; imported_at: string }>();
    const sources = rows.results.map((r) => r.source).sort();
    // OLD pledge (111) swept; in-game survives; new pledge (222) present.
    expect(sources).toEqual(["ingame", "pledge"]);
    expect(rows.results.some((r) => r.source === "ingame")).toBe(true);
    expect(rows.results.some((r) => r.pledge_id === "111")).toBe(false);
    expect(rows.results.some((r) => r.pledge_id === "222")).toBe(true);
  });

  it("requires auth", async () => {
    const res = await SELF.fetch("http://localhost/api/vehicles/ingame", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vehicle_id: vid }),
    });
    expect(res.status).toBe(401);
  });
});
