import { Hono } from "hono";
import { getAuthUser, type HonoEnv } from "../../lib/types";

/**
 * /api/accountant/* — ledger, sorting list, badges, tags.
 * Single-ledger architecture: balance = SUM(amount); the Sorting List is the
 * `category IS NULL AND source='parsed'` slice of accountant_entries.
 */
export function ledgerRoutes() {
  const routes = new Hono<HonoEnv>();

  const PER_PAGE = 50;

  // GET /api/accountant/ledger
  routes.get("/ledger", async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10) || 1);

    const [entries, totalRow, balanceRow] = await Promise.all([
      db
        .prepare(
          `SELECT * FROM accountant_entries WHERE user_id = ?
           ORDER BY occurred_at DESC, id DESC LIMIT ? OFFSET ?`,
        )
        .bind(userID, PER_PAGE, (page - 1) * PER_PAGE)
        .all(),
      db
        .prepare("SELECT COUNT(*) AS n FROM accountant_entries WHERE user_id = ?")
        .bind(userID)
        .first<{ n: number }>(),
      db
        .prepare("SELECT COALESCE(SUM(amount), 0) AS balance FROM accountant_entries WHERE user_id = ?")
        .bind(userID)
        .first<{ balance: number }>(),
    ]);

    return c.json({
      entries: entries.results,
      total: totalRow?.n ?? 0,
      balance: balanceRow?.balance ?? 0,
      page,
    });
  });

  return routes;
}
