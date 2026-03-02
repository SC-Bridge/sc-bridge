import { Hono } from "hono";
import type { Env } from "../lib/types";
import {
  triggerRSISync,
  runFullSync,
} from "../sync/pipeline";

/**
 * /api/sync/* — Sync management
 *
 * All sync POST handlers run in the background via executionCtx.waitUntil()
 * and return immediately. This avoids Workers HTTP request timeout (30s CPU).
 */
export function syncRoutes<E extends { Bindings: Env }>() {
  const routes = new Hono<E>();

  // GET /api/sync/status — recent sync history
  routes.get("/status", async (c) => {
    const db = c.env.DB;
    const result = await db
      .prepare(
        `SELECT sh.id, sh.source_id, sh.endpoint, sh.status, sh.record_count,
          sh.error_message, sh.started_at, sh.completed_at,
          ss.label as source_label
        FROM sync_history sh
        LEFT JOIN sync_sources ss ON ss.id = sh.source_id
        ORDER BY sh.started_at DESC LIMIT 10`,
      )
      .all();
    return c.json(result.results);
  });

  // POST /api/sync/rsi — trigger RSI API image sync (background)
  routes.post("/rsi", async (c) => {
    const env = c.env;
    c.executionCtx.waitUntil(
      triggerRSISync(env).catch((err) =>
        console.error("[sync] RSI sync failed:", err),
      ),
    );
    return c.json({ message: "RSI sync triggered" });
  });

  // POST /api/sync/all — trigger full sync pipeline (background)
  // Restricted to development — likely exceeds Workers 30s CPU limit in production.
  // Use the staggered cron triggers instead.
  routes.post("/all", async (c) => {
    if (c.env.ENVIRONMENT !== "development") {
      return c.json({ error: "Full sync disabled in production — use individual sync endpoints or cron triggers" }, 403);
    }
    const env = c.env;
    c.executionCtx.waitUntil(
      runFullSync(env).catch((err) =>
        console.error("[sync] Full sync failed:", err),
      ),
    );
    return c.json({ message: "Full sync pipeline triggered" });
  });

  return routes;
}
