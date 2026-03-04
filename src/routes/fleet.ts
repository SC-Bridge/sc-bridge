import { Hono } from "hono";
import { z } from "zod";
import { getAuthUser, type HonoEnv } from "../lib/types";
import { validate, IntIdParam, OrgVisibility } from "../lib/validation";

/**
 * /api/vehicles/* — User's fleet
 */
export function fleetRoutes() {
  const routes = new Hono<HonoEnv>();

  // GET /api/vehicles — list user fleet with full reference data
  routes.get("/", async (c) => {
    return getFleetList(c.env.DB, getAuthUser(c).id, c);
  });

  // GET /api/vehicles/with-insurance — alias (insurance is already part of fleet data)
  routes.get("/with-insurance", async (c) => {
    return getFleetList(c.env.DB, getAuthUser(c).id, c);
  });

  // PATCH /api/vehicles/:id/visibility — update org_visibility and/or available_for_ops
  routes.patch("/:id/visibility",
    validate("param", IntIdParam),
    validate("json", z.object({
      org_visibility: OrgVisibility.optional(),
      available_for_ops: z.boolean().optional(),
    }).refine((d) => d.org_visibility !== undefined || d.available_for_ops !== undefined, {
      message: "No fields to update",
    })),
    async (c) => {
    const { id } = c.req.valid("param");
    const db = c.env.DB;
    const userID = getAuthUser(c).id;

    const body = c.req.valid("json");

    const updates: string[] = [];
    const values: unknown[] = [];

    if (body.org_visibility !== undefined) {
      updates.push("org_visibility = ?");
      values.push(body.org_visibility);
    }

    if (body.available_for_ops !== undefined) {
      updates.push("available_for_ops = ?");
      values.push(body.available_for_ops ? 1 : 0);
    }

    values.push(userID, id);

    const result = await db
      .prepare(`UPDATE user_fleet SET ${updates.join(", ")} WHERE user_id = ? AND id = ?`)
      .bind(...values)
      .run();

    if (result.meta.changes === 0) {
      return c.json({ error: "Not found or not authorized" }, 404);
    }

    return c.json({ success: true });
  });

  return routes;
}

async function getFleetList(
  db: D1Database,
  userID: string,
  c: { json: (data: unknown, status?: number) => Response },
) {
  const result = await db
    .prepare(
      `SELECT uf.id, uf.user_id, uf.vehicle_id, uf.insurance_type_id, uf.warbond, uf.is_loaner,
        uf.pledge_id, uf.pledge_name, uf.pledge_cost, uf.pledge_date, uf.custom_name,
        uf.equipped_paint_id, uf.imported_at, uf.org_visibility, uf.available_for_ops,
        v.name as vehicle_name, v.slug as vehicle_slug, v.image_url, v.focus, v.size_label, v.cargo,
        v.crew_min, v.crew_max, v.pledge_price, v.speed_scm, v.classification,
        m.name as manufacturer_name, m.code as manufacturer_code,
        it.label as insurance_label, it.duration_months, it.is_lifetime,
        p.name as paint_name,
        ps.key as production_status
      FROM user_fleet uf
      JOIN vehicles v ON v.id = uf.vehicle_id
      LEFT JOIN manufacturers m ON m.id = v.manufacturer_id
      LEFT JOIN insurance_types it ON it.id = uf.insurance_type_id
      LEFT JOIN paints p ON p.id = uf.equipped_paint_id
      LEFT JOIN production_statuses ps ON ps.id = v.production_status_id
      WHERE uf.user_id = ?
      ORDER BY v.name`,
    )
    .bind(userID)
    .all();

  return c.json(result.results);
}
