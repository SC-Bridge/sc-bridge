/**
 * "Standard" paints (migration 0289): one synthetic livery per hull, linked
 * to its own hull as the default (paint_vehicles.is_default_for_vehicle = 1).
 *
 * They are not items, so they stay out of the paint browser, the paint count,
 * /paints/:slug and pledge-title matching. The ship's paint list shows them
 * first, and the fleet read names the default a ship wears with nothing equipped.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders, seedVehicle, seedFleetEntry } from "./helpers";
import { getAllPaints, getPaintBySlug, getPaintCount, getPaintsForVehicle } from "../src/db/queries";
import { preloadPaintMap, findPaintLocal } from "../src/lib/fleet-import";

async function seedPaint(
  name: string,
  opts: { standard?: boolean; image?: boolean } = {},
): Promise<number> {
  const slug = name.toLowerCase().replace(/\s+/g, "-");
  const row = await env.DB.prepare(
    `INSERT INTO paints (name, slug, class_name, image_url, is_standard)
     VALUES (?, ?, ?, ?, ?) RETURNING id`,
  )
    .bind(name, slug, slug.replace(/-/g, "_"), opts.image ? "https://x/p.png" : null, opts.standard ? 1 : 0)
    .first<{ id: number }>();
  return row!.id;
}

async function link(paintId: number, vehicleId: number, isDefault: boolean) {
  await env.DB.prepare(
    "INSERT INTO paint_vehicles (paint_id, vehicle_id, is_default_for_vehicle) VALUES (?, ?, ?)",
  )
    .bind(paintId, vehicleId, isDefault ? 1 : 0)
    .run();
}

describe("Standard paints", () => {
  let vehicleId: number;
  let standardId: number;
  let redId: number;

  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    vehicleId = await seedVehicle(env.DB, { slug: "std-titan", name: "Std Titan" });
    standardId = await seedPaint("Std Titan Standard", { standard: true, image: true });
    redId = await seedPaint("Std Titan Red Livery", { image: true });
    await link(standardId, vehicleId, true);
    await link(redId, vehicleId, false);
  });

  it("lists the hull's default first on the ship's paint list, flagged", async () => {
    const paints = await getPaintsForVehicle(env.DB, "std-titan");
    expect(paints.map((p) => p.id)).toEqual([standardId, redId]);
    expect(paints[0]).toMatchObject({ is_standard: 1, is_default: 1 });
    expect(paints[1]).toMatchObject({ is_standard: 0, is_default: 0 });
  });

  it("keeps Standard rows out of the paint browser, the count and slug pages", async () => {
    const all = await getAllPaints(env.DB);
    expect(all.some((p) => p.id === standardId)).toBe(false);
    expect(all.some((p) => p.id === redId)).toBe(true);

    const before = await getPaintCount(env.DB);
    await seedPaint("Std Other Standard", { standard: true });
    expect(await getPaintCount(env.DB)).toBe(before);

    expect(await getPaintBySlug(env.DB, "std-titan-standard")).toBeNull();
    expect(await getPaintBySlug(env.DB, "std-titan-red-livery")).not.toBeNull();
  });

  it("never matches an RSI pledge title to a Standard row", async () => {
    const map = await preloadPaintMap(env.DB);
    expect(findPaintLocal(map, "Std Titan - Standard Paint")).toBeFalsy();
    expect(findPaintLocal(map, "Std Titan - Red Paint")).toBe(redId);
  });

  it("names the default paint a fleet ship wears with nothing equipped", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    await seedFleetEntry(env.DB, userId, vehicleId);
    const res = await SELF.fetch("http://localhost/api/vehicles", {
      headers: await authHeaders(sessionToken),
    });
    expect(res.status).toBe(200);
    const [entry] = (await res.json()) as Array<{ paint_name: string | null; default_paint_name: string | null }>;
    expect(entry.paint_name).toBeNull();
    expect(entry.default_paint_name).toBe("Std Titan Standard");
  });
});
