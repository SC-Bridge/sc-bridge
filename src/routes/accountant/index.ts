import { Hono } from "hono";
import type { HonoEnv } from "../../lib/types";
import { ledgerRoutes } from "./ledger";
import { ingestRoutes } from "./ingest";
import { loansRoutes } from "./loans";
import { ordersRoutes } from "./orders";
import { workordersRoutes } from "./workorders";
import { sortingRoutes } from "./sorting";
import { badgesRoutes } from "./badges";
import { tagsRoutes } from "./tags";
import { reportsRoutes } from "./reports";
import { modeRoutes } from "./mode";
import { getActiveOrgId, resolveScope } from "../../lib/accountant/scope";

/**
 * /api/accountant — SC ERP Accountant module (design: accountant-m1-m3-design.md).
 * Everything here is per-user financial data: require a real session user
 * (mirrors companion.ts — the global API_TOKEN fallback must NOT grant access).
 */
export function accountantRoutes() {
  const routes = new Hono<HonoEnv>();

  routes.use("*", async (c, next) => {
    const user = c.get("user" as never) as { id: string } | undefined;
    if (!user) {
      return c.json({ error: "Authentication required" }, 401);
    }
    // Resolve the active ledger scope once per request (design §5.1). getActiveOrgId
    // returns null for a lapsed/absent corp membership, so resolveScope never throws
    // here — corp access errors surface from assertManager in write handlers instead.
    const scope = await resolveScope(c.env.DB, user.id, await getActiveOrgId(c.env.DB, user.id));
    c.set("acctScope", scope);
    return next();
  });

  routes.route("/", ledgerRoutes());
  routes.route("/mode", modeRoutes());
  routes.route("/ingest", ingestRoutes());
  routes.route("/loans", loansRoutes());
  routes.route("/orders", ordersRoutes());
  routes.route("/workorders", workordersRoutes());
  routes.route("/sorting", sortingRoutes());
  routes.route("/badges", badgesRoutes());
  routes.route("/tags", tagsRoutes());
  routes.route("/reports", reportsRoutes());
  return routes;
}
