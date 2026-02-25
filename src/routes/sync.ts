import { Hono } from "hono";
import type { Env } from "../lib/types";
import {
  triggerSCWikiSync,
  triggerSCWikiItemSync,
  triggerImageSync,
  triggerPaintSync,
  triggerRSISync,
  runFullSync,
} from "../sync/pipeline";
import {
  syncCDNShipImages,
  syncCDNPaintImages,
  type CDNShipsExport,
  type CDNPaintsExport,
} from "../sync/cdn";

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

  // POST /api/sync/scwiki — trigger SC Wiki vehicle sync (background)
  routes.post("/scwiki", async (c) => {
    const env = c.env;
    c.executionCtx.waitUntil(
      triggerSCWikiSync(env).catch((err) =>
        console.error("[sync] SC Wiki vehicle sync failed:", err),
      ),
    );
    return c.json({ message: "SC Wiki sync triggered" });
  });

  // POST /api/sync/items — trigger SC Wiki item sync (runs inline, not background)
  // Items sync is fast enough (~10-15s) to complete within the HTTP handler timeout.
  // Using waitUntil() was causing premature termination on production.
  routes.post("/items", async (c) => {
    try {
      const result = await triggerSCWikiItemSync(c.env);
      return c.json({ message: result });
    } catch (err) {
      console.error("[sync] SC Wiki item sync failed:", err);
      return c.json({ error: String(err) }, 500);
    }
  });

  // POST /api/sync/images — trigger FleetYards image sync (background)
  routes.post("/images", async (c) => {
    const env = c.env;
    c.executionCtx.waitUntil(
      triggerImageSync(env).catch((err) =>
        console.error("[sync] Image sync failed:", err),
      ),
    );
    return c.json({ message: "FleetYards image sync triggered" });
  });

  // POST /api/sync/paints — trigger paint sync pipeline (background)
  routes.post("/paints", async (c) => {
    const env = c.env;
    c.executionCtx.waitUntil(
      triggerPaintSync(env).catch((err) =>
        console.error("[sync] Paint sync failed:", err),
      ),
    );
    return c.json({ message: "Paint sync triggered" });
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

  // POST /api/sync/cdn/ships — import CDN crawl ships.json (inline, returns match report)
  routes.post("/cdn/ships", async (c) => {
    let body: CDNShipsExport;
    try {
      body = await c.req.json<CDNShipsExport>();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    if (!Array.isArray(body?.ships)) {
      return c.json({ error: "Body must be ships.json export (has 'ships' array)" }, 400);
    }
    try {
      const result = await syncCDNShipImages(c.env.DB, body);
      return c.json({ message: "CDN ship sync complete", ...result });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });

  // POST /api/sync/cdn/paints — import CDN crawl paints.json (inline, returns match report)
  routes.post("/cdn/paints", async (c) => {
    let body: CDNPaintsExport;
    try {
      body = await c.req.json<CDNPaintsExport>();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    if (!Array.isArray(body?.paints)) {
      return c.json({ error: "Body must be paints.json export (has 'paints' array)" }, 400);
    }
    try {
      const result = await syncCDNPaintImages(c.env.DB, body);
      return c.json({ message: "CDN paint sync complete", ...result });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
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
