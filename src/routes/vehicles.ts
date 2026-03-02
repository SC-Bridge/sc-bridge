import { Hono } from "hono";
import type { Env } from "../lib/types";

/**
 * /api/ships/* — Ship reference database (all vehicles in the game)
 */
export function vehicleRoutes<E extends { Bindings: Env }>() {
  const routes = new Hono<E>();

  // GET /api/ships — list all vehicles
  routes.get("/", async (c) => {
    const db = c.env.DB;
    const result = await db
      .prepare(
        `SELECT v.id, v.uuid, v.slug, v.name, v.class_name,
          v.size, v.size_label, v.focus, v.classification, v.description,
          v.length, v.beam, v.height, v.mass, v.cargo,
          v.crew_min, v.crew_max, v.speed_scm, v.pledge_price, v.on_sale,
          v.image_url, v.image_url_small, v.image_url_medium, v.image_url_large,
          v.pledge_url, v.price_auec, v.acquisition_type, v.acquisition_source_name,
          m.name as manufacturer_name, m.code as manufacturer_code,
          ps.key as production_status
        FROM vehicles v
        LEFT JOIN manufacturers m ON m.id = v.manufacturer_id
        LEFT JOIN production_statuses ps ON ps.id = v.production_status_id
        WHERE v.is_paint_variant = 0
        ORDER BY v.name`,
      )
      .all();
    return c.json(result.results);
  });

  // GET /api/ships/:slug — get single vehicle by slug
  routes.get("/:slug", async (c) => {
    const slug = c.req.param("slug");
    const db = c.env.DB;
    const vehicle = await db
      .prepare(
        `SELECT v.id, v.uuid, v.slug, v.name, v.class_name,
          v.size, v.size_label, v.focus, v.classification, v.description,
          v.length, v.beam, v.height, v.mass, v.cargo,
          v.crew_min, v.crew_max, v.speed_scm, v.speed_max, v.health,
          v.vehicle_inventory, v.pledge_price, v.on_sale,
          v.image_url, v.image_url_small, v.image_url_medium, v.image_url_large,
          v.pledge_url, v.price_auec, v.acquisition_type, v.acquisition_source_name,
          v.boost_speed_back, v.angular_velocity_pitch, v.angular_velocity_yaw,
          v.angular_velocity_roll, v.fuel_capacity_hydrogen, v.fuel_capacity_quantum,
          v.thruster_count_main, v.thruster_count_maneuvering,
          m.name as manufacturer_name, m.code as manufacturer_code,
          ps.key as production_status
        FROM vehicles v
        LEFT JOIN manufacturers m ON m.id = v.manufacturer_id
        LEFT JOIN production_statuses ps ON ps.id = v.production_status_id
        WHERE v.slug = ? AND v.is_paint_variant = 0`,
      )
      .bind(slug)
      .first();

    if (!vehicle) {
      return c.json({ error: "Ship not found" }, 404);
    }
    return c.json(vehicle);
  });

  return routes;
}
