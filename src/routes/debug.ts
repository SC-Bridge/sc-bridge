import { Hono } from "hono";
import type { HonoEnv } from "../lib/types";

/**
 * /api/debug/* — Debug endpoints
 */
export function debugRoutes() {
  const routes = new Hono<HonoEnv>();

  // GET /api/debug/imports — debug import state
  routes.get("/imports", async (c) => {
    const db = c.env.DB;

    const vehicleCount = await db
      .prepare("SELECT COUNT(*) as count FROM vehicles")
      .first<{ count: number }>();

    // Show fleet counts for all users (admin view)
    const fleetCount = await db
      .prepare("SELECT COUNT(*) as count FROM user_fleet")
      .first<{ count: number }>();

    // Sample fleet entries — vehicle/insurance data only, no user PII (user_id, custom_name)
    const sampleResult = await db
      .prepare(
        `SELECT uf.id, uf.vehicle_id, v.name as vehicle_name, v.slug as vehicle_slug,
          it.label as insurance
        FROM user_fleet uf
        JOIN vehicles v ON v.id = uf.vehicle_id
        LEFT JOIN insurance_types it ON it.id = uf.insurance_type_id
        ORDER BY v.name
        LIMIT 5`,
      )
      .all();

    return c.json({
      vehicle_ref_count: vehicleCount?.count ?? 0,
      user_fleet_count: fleetCount?.count ?? 0,
      sample_fleet: sampleResult.results,
    });
  });

  return routes;
}
