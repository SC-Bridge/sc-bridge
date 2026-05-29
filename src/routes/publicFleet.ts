import { Hono } from "hono";
import { z } from "zod";
import type { HonoEnv } from "../lib/types";
import { validate } from "../lib/validation";
import { cachedJson } from "../lib/cache";
import { publicFleetCacheKey, PUBLIC_FLEET_SELECT } from "../lib/publicFleet";

const HandleParam = z.object({
  handle: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/, "Invalid handle"),
});

export function publicFleetRoutes() {
  const routes = new Hono<HonoEnv>();

  routes.get("/:handle/fleet", validate("param", HandleParam), async (c) => {
    const { handle } = c.req.valid("param");
    const db = c.env.DB;
    const cacheKey = publicFleetCacheKey(handle);

    return cachedJson(c, cacheKey, async () => {
      // Match the handle against EITHER verification path:
      //   - `user_rsi_profile.verified_handle` (manual citizen-page verification)
      //   - `user_rsi_profiles.rsi_handle` (browser extension sync)
      // Both count as "verified" per account.ts:223-225 (`isManualVerified || isExtensionVerified`).
      // COALESCE prefers the manual handle for canonical-case display.
      const row = await db
        .prepare(
          `SELECT
             us.user_id,
             COALESCE(urp.verified_handle, urps.rsi_handle) AS verified_handle
           FROM user_settings us
           LEFT JOIN user_rsi_profile urp ON urp.user_id = us.user_id
           LEFT JOIN user_rsi_profiles urps ON urps.user_id = us.user_id
           WHERE us.key = 'publicFleetShare'
             AND us.value = 'true'
             AND (LOWER(urp.verified_handle) = LOWER(?) OR LOWER(urps.rsi_handle) = LOWER(?))
           LIMIT 1`,
        )
        .bind(handle, handle)
        .first<{ user_id: string; verified_handle: string }>();

      if (!row) return null;

      const ships = await db
        .prepare(
          `SELECT ${PUBLIC_FLEET_SELECT}
           FROM user_fleet uf
           JOIN vehicles v ON v.id = uf.vehicle_id
           LEFT JOIN vehicles rv ON rv.id = v.replaced_by_vehicle_id
           LEFT JOIN manufacturers m ON m.id = v.manufacturer_id
           LEFT JOIN manufacturers rm ON rm.id = rv.manufacturer_id
           LEFT JOIN insurance_types it ON it.id = uf.insurance_type_id
           LEFT JOIN paints p ON p.id = uf.equipped_paint_id
           LEFT JOIN production_statuses ps ON ps.id = v.production_status_id
           LEFT JOIN production_statuses rps ON rps.id = rv.production_status_id
           WHERE uf.user_id = ?
             AND uf.org_visibility = 'public'
           ORDER BY COALESCE(rv.name, v.name)`,
        )
        .bind(row.user_id)
        .all();

      return {
        handle: row.verified_handle,
        ships: ships.results,
      };
    });
  });

  return routes;
}
