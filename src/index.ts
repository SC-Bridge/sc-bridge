import { Hono, type Context, type Next } from "hono";
import { cors } from "hono/cors";
import type { Env, HonoEnv } from "./lib/types";
import { createAuth } from "./lib/auth";
import { fleetRoutes } from "./routes/fleet";
import { vehicleRoutes } from "./routes/vehicles";
import { paintRoutes } from "./routes/paints";
import { importRoutes } from "./routes/import";
import { settingsRoutes } from "./routes/settings";
import { syncRoutes } from "./routes/sync";
import { analysisRoutes } from "./routes/analysis";
import { debugRoutes } from "./routes/debug";
import { migrateRoutes } from "./routes/migrate";
import { accountRoutes } from "./routes/account";
import { validateEncryptionKey } from "./lib/crypto";
import { logEvent } from "./lib/logger";

const app = new Hono<HonoEnv>();

// Validate ENCRYPTION_KEY on first request (fail fast)
let encryptionKeyValidated = false;
app.use("*", async (c, next) => {
  if (!encryptionKeyValidated) {
    encryptionKeyValidated = true;
    if (c.env.ENCRYPTION_KEY) {
      const err = validateEncryptionKey(c.env.ENCRYPTION_KEY);
      if (err) console.error(`[startup] ${err}`);
    }
  }
  return next();
});

// Request logging — structured JSON for Workers Observability
app.use("*", async (c, next) => {
  const start = Date.now();
  await next();
  const cf = (c.req.raw as unknown as { cf?: Record<string, unknown> }).cf;
  logEvent("request", {
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    duration_ms: Date.now() - start,
    ip: c.req.header("CF-Connecting-IP"),
    country: cf?.country,
    city: cf?.city,
    colo: cf?.colo,
    user_agent: c.req.header("User-Agent"),
    ray: c.req.header("CF-Ray"),
  });
});

// Security headers
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
});

// CORS — strict same-origin in production, localhost in dev
app.use("/api/*", async (c, next) => {
  const origin = c.req.header("Origin") || "";
  const host = c.req.header("Host") || "";
  if (!origin) return cors({ origin: `https://${host}` })(c, next);
  try {
    const originHost = new URL(origin).hostname;
    const isSameOrigin = originHost === host || originHost === host.split(":")[0];
    const isLocalDev = originHost === "localhost" || originHost === "127.0.0.1";
    if (isSameOrigin || isLocalDev) {
      return cors({ origin, credentials: true })(c, next);
    }
  } catch {
    // Malformed origin — reject
  }
  return next();
});

// --- Better Auth handler — mount before session middleware ---
app.on(["POST", "GET"], "/api/auth/**", async (c) => {
  const auth = createAuth(c.env);
  return auth.handler(c.req.raw);
});

// --- Session middleware — populate c.get('user') for all API routes ---
app.use("/api/*", async (c, next) => {
  // Skip for auth routes (already handled above)
  if (c.req.path.startsWith("/api/auth/")) {
    return next();
  }

  const auth = createAuth(c.env);
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  c.set("user", session?.user ?? null);
  c.set("session", session?.session ?? null);
  return next();
});

// --- Route protection ---

// Public routes (no auth required): /api/health, /api/auth/**, /api/ships/*, /api/status
// Protected routes require session auth OR API_TOKEN fallback

// requireAuth middleware — session or API token
async function requireAuth(c: Context<HonoEnv>, next: Next): Promise<Response | void> {
  if (c.get("user")) {
    return next();
  }

  // Fallback: X-API-Key for external API consumers
  const token = c.env.API_TOKEN;
  if (token) {
    const provided = c.req.header("X-API-Key") || c.req.query("token") || "";
    const encoder = new TextEncoder();
    const a = encoder.encode(provided);
    const b = encoder.encode(token);
    if (a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b)) {
      return next();
    }
  }

  return c.json({ error: "Unauthorized" }, 401);
}

// requireRole middleware factory
function requireRole(...roles: string[]) {
  return async (c: Context<HonoEnv>, next: Next): Promise<Response | void> => {
    const authResp = await requireAuth(c, async () => {});
    if (authResp) return authResp;

    const user = c.get("user");
    if (!user?.role || !roles.includes(user.role)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    return next();
  };
}

// Protected: user fleet, import, settings, analysis, LLM
app.use("/api/vehicles/*", requireAuth);
app.use("/api/import/*", requireAuth);
app.use("/api/settings/*", requireAuth);
app.use("/api/analysis", requireAuth);
app.on(["POST", "DELETE"], "/api/llm/*", requireAuth);
app.use("/api/account/*", requireAuth);

// Admin-only: sync, debug, migrate
app.use("/api/sync/*", requireRole("admin", "super_admin"));
app.use("/api/debug/*", requireRole("admin", "super_admin"));
app.use("/api/migrate", requireRole("super_admin"));

// Health check
app.get("/api/health", (c) => c.json({ status: "ok" }));

// Status endpoint
app.get("/api/status", async (c) => {
  const db = c.env.DB;
  const user = c.get("user");

  const vehicleCount = await db
    .prepare("SELECT COUNT(*) as count FROM vehicles")
    .first<{ count: number }>();
  const paintCount = await db
    .prepare("SELECT COUNT(*) as count FROM paints")
    .first<{ count: number }>();

  // Fleet count is user-scoped if logged in, otherwise 0
  let fleetCount = 0;
  if (user) {
    const row = await db
      .prepare("SELECT COUNT(*) as count FROM user_fleet WHERE user_id = ?")
      .bind(user.id)
      .first<{ count: number }>();
    fleetCount = row?.count ?? 0;
  }

  const syncHistory = await db
    .prepare(
      `SELECT sh.id, sh.source_id, sh.endpoint, sh.status, sh.record_count,
        sh.error_message, sh.started_at, sh.completed_at, ss.label as source_label
      FROM sync_history sh
      LEFT JOIN sync_sources ss ON ss.id = sh.source_id
      ORDER BY sh.started_at DESC LIMIT 10`,
    )
    .all();

  return c.json({
    ships: vehicleCount?.count ?? 0,
    paints: paintCount?.count ?? 0,
    vehicles: fleetCount,
    sync_status: syncHistory.results,
    config: {
      sync_schedule: "0 3 * * *",
      db_driver: "d1",
    },
  });
});

// Mount route groups — matches Go router URL structure exactly
app.route("/api/ships", vehicleRoutes<HonoEnv>());
app.route("/api/vehicles", fleetRoutes());
app.route("/api/paints", paintRoutes<HonoEnv>());
app.route("/api/import", importRoutes());
app.route("/api/settings", settingsRoutes());
app.route("/api/sync", syncRoutes<HonoEnv>());
app.route("/api", analysisRoutes());
app.route("/api/debug", debugRoutes());
app.route("/api/migrate", migrateRoutes());
app.route("/api/account", accountRoutes());

// SPA catch-all — forward non-API requests to Workers Assets (serves index.html)
app.get("*", async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

// Export for Cloudflare Workers
export default {
  fetch: app.fetch,

  // Cron Trigger handler — staggered sync steps
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(runScheduledSync(event.cron, env));
  },
};

async function runScheduledSync(cron: string, env: Env): Promise<void> {
  const {
    triggerSCWikiSync,
    triggerSCWikiItemSync,
    triggerImageSync,
    triggerPaintSync,
    triggerRSISync,
  } = await import("./sync/pipeline");

  switch (cron) {
    case "0 3 * * *":
      console.log("[cron] Session cleanup + SC Wiki vehicles");
      logEvent("cron_trigger", { schedule: cron, task: "session_cleanup_and_scwiki_vehicles" });
      await cleanExpiredSessions(env);
      await triggerSCWikiSync(env);
      break;
    case "5 3 * * *":
      console.log("[cron] SC Wiki items");
      logEvent("cron_trigger", { schedule: cron, task: "scwiki_items" });
      await triggerSCWikiItemSync(env);
      break;
    case "15 3 * * *":
      console.log("[cron] FleetYards ship images");
      logEvent("cron_trigger", { schedule: cron, task: "fleetyards_images" });
      await triggerImageSync(env);
      break;
    case "30 3 * * *":
      console.log("[cron] Paint sync (scunpacked + FleetYards paint images)");
      logEvent("cron_trigger", { schedule: cron, task: "paint_sync" });
      await triggerPaintSync(env);
      break;
    case "45 3 * * *":
      console.log("[cron] RSI API images");
      logEvent("cron_trigger", { schedule: cron, task: "rsi_images" });
      await triggerRSISync(env);
      break;
    default:
      console.warn(`[cron] Unknown schedule: ${cron}`);
  }
}

async function cleanExpiredSessions(env: Env): Promise<void> {
  const db = env.DB;
  await db.exec("DELETE FROM session WHERE expiresAt < datetime('now')");
  await db.exec("DELETE FROM verification WHERE expiresAt < datetime('now')").catch(() => {
    // verification table may not exist yet
  });
}
