import { Hono } from "hono"
import type { HonoEnv } from "../lib/types"
import { getActiveChannel, isPTUChannel, resolveTable } from "../lib/ptu";
import { parseRewardItemNames, rankRewardSets } from "../lib/loot-sets"
import { getArmourSetSlugsByItemName } from "../db/queries"
import { cachedJson, cacheSlug } from "../lib/cache"

/**
 * /api/contracts — Named NPC contract reference data (public, no auth required)
 */
export function contractRoutes<E extends HonoEnv>() {
  const app = new Hono<E>()

  // GET /api/contracts?giver=wikelo|gfs|ruto
  app.get("/", async (c) => {
    const isPTU = isPTUChannel(getActiveChannel(c));
    const t = (n: string) => resolveTable(n, isPTU);
    const db = c.env.DB
    const giver = c.req.query("giver")
    if (giver && giver.length > 100) {
      return c.json({ error: "Invalid filter" }, 400)
    }

    return cachedJson(c, `contracts:${cacheSlug(giver ?? "all")}`, async () => {
      let query = `SELECT c.*,
          COALESCE(c.reward_vehicle_slug, v.slug) AS reward_vehicle_slug
        FROM ${t("contracts")} c
        LEFT JOIN ${t("vehicles")} v ON v.name = c.reward_text AND c.reward_vehicle_slug IS NULL
        WHERE c.is_active = 1`
      const params: string[] = []

      if (giver) {
        query += " AND c.giver_slug = ?"
        params.push(giver)
      }

      query += " ORDER BY c.giver_slug, CASE c.giver_slug WHEN 'wikelo' THEN CASE c.category WHEN 'Standard' THEN 0 WHEN 'Favours' THEN 1 WHEN 'Small Items' THEN 2 WHEN 'Vehicle Delivery' THEN 3 ELSE 4 END ELSE 0 END, c.sequence_num, c.id"

      const { results } = await db.prepare(query).bind(...params).all()

      // Attach armour set slugs derived from the reward items: each reward
      // name is matched exactly to a loot_map armour piece, and the pieces
      // are grouped into sets the same way /api/loot/sets groups them.
      const rows = results as Record<string, unknown>[]
      const rewardNames = new Map<Record<string, unknown>, string[]>()
      for (const row of rows) {
        if (!row.reward_vehicle_slug && row.reward_text) {
          rewardNames.set(row, parseRewardItemNames(row.reward_text as string))
        }
      }
      const allNames = [...new Set([...rewardNames.values()].flat())]
      const setSlugByItemName = await getArmourSetSlugsByItemName(db, allNames, isPTU)
      for (const [row, names] of rewardNames) {
        const setSlugs = rankRewardSets(names, setSlugByItemName)
        if (setSlugs.length > 0) {
          row.reward_set_slug = setSlugs[0]
          row.reward_set_slugs = setSlugs
        }
      }

      return results
    })
  })

  return app
}
