import { Hono } from "hono";
import { getAuthUser, type HonoEnv } from "../../lib/types";
import { UNSORTED_PREDICATE } from "./schemas";
import { catchUpAccruals } from "../../lib/accountant/accrual";

/**
 * /api/accountant/badges — nav badge counts + the user's verify threshold.
 * Badges are derived from live queries: no notifications table (design §2).
 */
export function badgesRoutes() {
  const routes = new Hono<HonoEnv>();

  // GET /api/accountant/badges — nav badges + threshold (48h due-soon window)
  routes.get("/", async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    // Design §4.4: catch-up runs at the top of every badges read.
    // No try/catch — catchUpAccruals throws on logic errors; Hono returns 500
    // ("fail rather than serve stale numbers", design §6).
    await catchUpAccruals(db, userID);
    const [sorting, due, threshold] = await Promise.all([
      db.prepare(
        `SELECT COUNT(*) AS n FROM accountant_entries
         WHERE user_id = ? AND ${UNSORTED_PREDICATE}`,
      ).bind(userID).first<{ n: number }>(),
      db.prepare(
        `SELECT COUNT(*) AS n FROM accountant_loans
         WHERE user_id = ? AND status = 'open' AND due_at IS NOT NULL
           AND due_at <= datetime('now', '+48 hours')`,
      ).bind(userID).first<{ n: number }>(),
      db.prepare(
        "SELECT value FROM user_settings WHERE user_id = ? AND key = 'accountantVerifyThreshold'",
      ).bind(userID).first<{ value: string }>(),
    ]);
    return c.json({
      sorting: sorting?.n ?? 0,
      loansDueSoon: due?.n ?? 0,
      sortingThreshold: threshold ? parseInt(threshold.value, 10) : 10,
    });
  });

  return routes;
}
