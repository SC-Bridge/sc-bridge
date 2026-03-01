import { Hono } from "hono"
import type { HonoEnv } from "../lib/types"

/**
 * /api/contracts — Named NPC contract reference data (public, no auth required)
 */
export function contractRoutes<E extends HonoEnv>() {
  const app = new Hono<E>()

  // GET /api/contracts?giver=wikelo|gfs|ruto
  app.get("/", async (c) => {
    const db = c.env.DB
    const giver = c.req.query("giver")

    let query = "SELECT * FROM contracts WHERE is_active = 1"
    const params: string[] = []

    if (giver) {
      query += " AND giver_slug = ?"
      params.push(giver)
    }

    query += " ORDER BY giver_slug, CASE giver_slug WHEN 'wikelo' THEN CASE category WHEN 'Standard' THEN 0 WHEN 'Favours' THEN 1 WHEN 'Small Items' THEN 2 WHEN 'Vehicle Delivery' THEN 3 ELSE 4 END ELSE 0 END, sequence_num, id"

    const { results } = await db.prepare(query).bind(...params).all()
    return c.json(results)
  })

  return app
}
