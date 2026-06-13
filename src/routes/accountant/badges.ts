import { Hono } from "hono";
import { getAuthUser, type HonoEnv } from "../../lib/types";
import { UNSORTED_PREDICATE } from "./schemas";
import { catchUp } from "../../lib/accountant/catchup";

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
    const scope = c.get("acctScope")!;
    // Design §4.4: catch-up runs at the top of every badges read.
    // No try/catch — catchUp throws on logic errors; Hono returns 500
    // ("fail rather than serve stale numbers", design §6).
    await catchUp(db, scope);
    const [sorting, due, overdue, threshold] = await Promise.all([
      db.prepare(
        `SELECT COUNT(*) AS n FROM accountant_entries
         WHERE ${scope.sql} AND ${UNSORTED_PREDICATE}`,
      ).bind(...scope.binds).first<{ n: number }>(),
      db.prepare(
        `SELECT COUNT(*) AS n FROM accountant_loans
         WHERE ${scope.sql} AND status = 'open' AND due_at IS NOT NULL
           AND due_at <= datetime('now', '+48 hours')`,
      ).bind(...scope.binds).first<{ n: number }>(),
      // Bound ISO now, NOT datetime('now'): deliver_by is ISO ('T' at char 10),
      // datetime('now') uses a space — raw compare misses same-UTC-day overdue.
      db.prepare(
        `SELECT COUNT(*) AS n FROM accountant_orders
         WHERE ${scope.sql} AND status IN ('open', 'in_progress')
           AND deliver_by IS NOT NULL AND deliver_by < ?`,
      ).bind(...scope.binds, new Date().toISOString()).first<{ n: number }>(),
      // Verify threshold is a PERSONAL preference (per-user), not corp-scoped.
      db.prepare(
        "SELECT value FROM user_settings WHERE user_id = ? AND key = 'accountantVerifyThreshold'",
      ).bind(userID).first<{ value: string }>(),
    ]);
    return c.json({
      sorting: sorting?.n ?? 0,
      loansDueSoon: due?.n ?? 0,
      ordersOverdue: overdue?.n ?? 0,
      sortingThreshold: threshold ? parseInt(threshold.value, 10) : 10,
    });
  });

  return routes;
}
