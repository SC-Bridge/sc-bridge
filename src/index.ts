import { Hono, type Context, type Next } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import type { Env, HonoEnv } from "./lib/types";
import { createAuth } from "./lib/auth";
import { fleetRoutes } from "./routes/fleet";
import { vehicleRoutes } from "./routes/vehicles";
import { getShipLoadout, getSalvageForShip, listSalvageableShips, listChangelogEntries } from "./db/queries";
import { paintRoutes } from "./routes/paints";
import { importRoutes } from "./routes/import";
import { settingsRoutes } from "./routes/settings";
import { syncRoutes } from "./routes/sync";
import { analysisRoutes } from "./routes/analysis";
import { chatRoutes } from "./routes/chat";
import { debugRoutes } from "./routes/debug";
import { migrateRoutes } from "./routes/migrate";
import { accountRoutes } from "./routes/account";
import { orgRoutes } from "./routes/orgs";
import { adminRoutes } from "./routes/admin";
import { contractRoutes } from "./routes/contracts";
import { lootRoutes } from "./routes/loot";
import { hangarRoutes } from "./routes/hangar";
import { patchRoutes } from "./routes/patches";
import { gamedataRoutes } from "./routes/gamedata";
import { localizationRoutes } from "./routes/localization";
import { publicOpsRoutes } from "./routes/ops";
import { reputationRoutes } from "./routes/reputation";
import { publicFleetRoutes } from "./routes/publicFleet";
import { companionRoutes } from "./routes/companion";
import { companionAuthRoutes } from "./routes/companion-auth";
import { loadoutRoutes } from "./routes/loadout";
import { componentRoutes } from "./routes/components";
import { blueprintRoutes } from "./routes/blueprints";
import { weaponBuildRoutes } from "./routes/weaponBuilds";
import { fpsLoadoutRoutes } from "./routes/fpsLoadouts";
import { characterRoutes } from "./routes/characters";
import { validateEncryptionKey } from "./lib/crypto";
import { logEvent } from "./lib/logger";
import { isTrustedExtension } from "./lib/constants";
import { cachedJson, cacheSlug } from "./lib/cache";

// Version-skew guard: same constant is baked into the client bundle; the SPA
// compares its copy against this one via /api/status and reloads when stale.
// `typeof` guard: the define is absent under vitest-pool-workers.
const BUILD_ID = typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "dev";

const app = new Hono<HonoEnv>();

// Global error handler — structured logging for unhandled exceptions
app.onError((err, c) => {
  // Preserve HTTPException status codes (e.g. 401 from getAuthUser)
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  logEvent("unhandled_error", {
    method: c.req.method,
    path: c.req.path,
    error: err.message,
    stack: err.stack,
    ray: c.req.header("CF-Ray"),
  });
  return c.json({ error: "Internal Server Error" }, 500);
});


// Validate ENCRYPTION_KEY on first request per isolate (fail fast)
let encryptionKeyValidated = false;
app.use("*", async (c, next) => {
  if (!encryptionKeyValidated) {
    if (c.env.ENCRYPTION_KEY) {
      const err = validateEncryptionKey(c.env.ENCRYPTION_KEY);
      if (err) {
        console.error(`[startup] ${err}`);
        return c.json({ error: "Service configuration error" }, 503);
      }
    }
    encryptionKeyValidated = true;
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
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://static.cloudflareinsights.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' https://imagedelivery.net https://robertsspaceindustries.com " +
    "https://media.robertsspaceindustries.com https://cdn.robertsspaceindustries.com " +
    "https://media.starcitizen.tools https://starcitizen.tools " +
    "https://avatars.githubusercontent.com https://www.gravatar.com https://www.googletagmanager.com data:; " +
    // F249: gtag.js beacons /g/collect to www.google.com in some GA4 configs,
    // not the *.google-analytics.com / analytics.google.com hosts. Without
    // this connect-src entry the tracker is silently CSP-blocked.
    "connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://www.google.com https://static.cloudflareinsights.com; " +
    "frame-ancestors 'none'; base-uri 'self'; form-action 'self' http://localhost:* http://127.0.0.1:*",
  );
});

// Default: prevent CDN caching of API responses (route handlers can override)
app.use("/api/*", async (c, next) => {
  await next();
  if (!c.res.headers.has("Cache-Control")) {
    c.header("Cache-Control", "no-store");
  }
});

// Request body size limits — reject oversized payloads before parsing
// Most API endpoints need < 100KB. Hangar-sync carries the full RSI export
// (pledges + items + buybacks + upgrades), which for large accounts (500+
// pledges, 1000+ items) comfortably exceeds 5MB. Carve out a higher cap
// for that route only; everything else stays tight.
const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5MB default
const MAX_BODY_BYTES_HANGAR_SYNC = 20 * 1024 * 1024; // 20MB for /api/import/hangar-sync
// A full global.ini (~10MB) is uploaded to /api/localization/import.
const MAX_BODY_BYTES_LOCALIZATION_IMPORT = 15 * 1024 * 1024;
const HIGH_BODY_LIMITS: Record<string, number> = {
  "/api/import/hangar-sync": MAX_BODY_BYTES_HANGAR_SYNC,
  "/api/localization/import": MAX_BODY_BYTES_LOCALIZATION_IMPORT,
};
app.use("/api/*", async (c, next) => {
  const contentLength = c.req.header("Content-Length");
  const limit = HIGH_BODY_LIMITS[c.req.path] ?? MAX_BODY_BYTES;
  if (contentLength && parseInt(contentLength, 10) > limit) {
    return c.json({ error: "Request body too large" }, 413);
  }
  // Require Content-Length on mutation requests to prevent chunked transfer bypass (M-01)
  const method = c.req.method;
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && !contentLength) {
    return c.json({ error: "Content-Length header required" }, 411);
  }
  return next();
});

// CORS — TRUSTED_EXTENSION_ORIGINS and isTrustedExtension imported from ./lib/constants

app.use("/api/*", async (c, next) => {
  const origin = c.req.header("Origin") || "";
  const host = c.req.header("Host") || "";
  // Use BETTER_AUTH_URL (pinned env var) instead of Host header to prevent header spoofing (M-06)
  if (!origin) {
    const baseUrl = c.env.BETTER_AUTH_URL || `https://${host}`;
    return cors({ origin: baseUrl })(c, next);
  }
  try {
    // Allow pinned browser extension origins (SC Bridge Sync)
    if (isTrustedExtension(origin)) {
      return cors({ origin, credentials: true })(c, next);
    }
    const originHost = new URL(origin).hostname;
    const isSameOrigin = originHost === host || originHost === host.split(":")[0];
    const isLocalDev = (originHost === "localhost" || originHost === "127.0.0.1") && c.env.ENVIRONMENT === "development";
    if (isSameOrigin || isLocalDev) {
      return cors({ origin, credentials: true })(c, next);
    }
  } catch {
    // Malformed origin — reject
  }
  return next();
});

// --- Registration is open (invite system removed) ---

// --- Better Auth handler — use app.use (middleware wildcard) not app.on (route wildcard)
// app.on() with ** does not match multi-segment paths in the Workers runtime.
// app.use() wildcard * is recursive in Hono middleware and correctly matches all sub-paths.
app.use("/api/auth/*", async (c, next) => {
  const auth = createAuth(c.env);
  const response = await auth.handler(c.req.raw);
  if (response) return response;
  return next();
});

// --- Session middleware — populate c.get('user') for all API routes ---
// Also checks user status in DB to handle the 5-minute cookie cache window:
// Better Auth's cookie cache may return a stale session for up to 5 min after
// a user is banned/deleted. This DB check ensures banned/deleted users are
// treated as unauthenticated immediately, not after cache expiry.
app.use("/api/*", async (c, next) => {
  // Skip for auth routes (already handled above)
  if (c.req.path.startsWith("/api/auth/")) {
    return next();
  }

  const auth = createAuth(c.env);
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (session?.user) {
    // Verify user is still active (mitigates cookie cache staleness)
    const record = await c.env.DB
      .prepare("SELECT status FROM user WHERE id = ?")
      .bind(session.user.id)
      .first<{ status: string }>();
    if (record?.status === "active") {
      c.set("user", session.user);
      c.set("session", session.session);
    } else {
      // User is banned/deleted/suspended — treat as unauthenticated
      c.set("user", null);
      c.set("session", null);
    }
  } else {
    c.set("user", null);
    c.set("session", null);
  }
  return next();
});

// --- Channel resolution middleware ---
// Runs after the session middleware so c.get("user") is populated. Stashes
// the active channel ("LIVE" / "PTU" / "EPTU") on the request context based
// on ?channel= override or super_admin's adminPreviewPatch user setting.
// Routes downstream read it via getActiveChannel(c).
import { channelMiddleware } from "./lib/ptu";
app.use("/api/*", channelMiddleware);

// --- Route protection ---

// Public routes (no auth required): /api/health, /api/auth/**, /api/ships/*, /api/status
// Protected routes require session auth OR API_TOKEN fallback

// requireAuth middleware — session or API token
// Note: user status (active/banned/deleted) is already checked in the session middleware.
// If c.get("user") is set, the user is guaranteed active.
async function requireAuth(c: Context<HonoEnv>, next: Next): Promise<Response | void> {
  const user = c.get("user");
  if (user) return next();

  // Fallback: X-API-Key for external API consumers
  const token = c.env.API_TOKEN;
  if (token) {
    const provided = c.req.header("X-API-Key") || "";
    // Hash both values to fixed length before comparing — avoids leaking token length
    const encoder = new TextEncoder();
    const [hashA, hashB] = await Promise.all([
      crypto.subtle.digest("SHA-256", encoder.encode(provided)),
      crypto.subtle.digest("SHA-256", encoder.encode(token)),
    ]);
    if (crypto.subtle.timingSafeEqual(hashA, hashB)) {
      return next();
    }
  }

  return c.json({ error: "Unauthorized" }, 401);
}

// requireRole middleware factory — inlines auth checks to avoid double-next() from
// calling requireAuth with a no-op callback. API token users are always rejected
// because role checks require a session user with a role field.
function requireRole(...roles: string[]) {
  return async (c: Context<HonoEnv>, next: Next): Promise<Response | void> => {
    const user = c.get("user");
    if (!user) {
      // API token fallback check — valid tokens get 403 (no role context), invalid get 401
      const token = c.env.API_TOKEN;
      if (token) {
        const provided = c.req.header("X-API-Key") || "";
        const encoder = new TextEncoder();
        const [hashA, hashB] = await Promise.all([
          crypto.subtle.digest("SHA-256", encoder.encode(provided)),
          crypto.subtle.digest("SHA-256", encoder.encode(token)),
        ]);
        if (crypto.subtle.timingSafeEqual(hashA, hashB)) {
          return c.json({ error: "Forbidden" }, 403);
        }
      }
      return c.json({ error: "Unauthorized" }, 401);
    }
    // Reject deleted/suspended/banned users
    const record = await c.env.DB
      .prepare("SELECT status FROM user WHERE id = ?")
      .bind(user.id)
      .first<{ status: string }>();
    if (!record || record.status !== "active") {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!user.role || !roles.includes(user.role)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    return next();
  };
}

// Protected: user fleet, import, settings, localization, analysis, LLM
app.use("/api/vehicles/*", requireAuth);
app.use("/api/hangar", requireAuth);
app.use("/api/hangar/*", requireAuth);
app.use("/api/import/*", requireAuth);
app.use("/api/settings/*", requireAuth);
app.use("/api/localization/*", requireAuth);
app.use("/api/blueprints/*", requireAuth);
app.use("/api/blueprints", requireAuth);
app.use("/api/weapon-builds/*", requireAuth);
app.use("/api/weapon-builds", requireAuth);
app.use("/api/fps-loadouts/*", requireAuth);
app.use("/api/fps-loadouts", requireAuth);
app.use("/api/analysis", requireAuth);
app.use("/api/llm/*", async (c, next) => {
  // /api/llm/models is public (lists available providers); all other LLM endpoints require auth
  if (c.req.path.endsWith("/llm/models") && c.req.method === "GET") return next();
  return requireAuth(c, next);
});
// Public: serve R2-stored user avatars (no auth required)
app.get("/api/account/avatar/file/:userId", async (c) => {
  const userId = c.req.param("userId");
  const object = await c.env.AVATARS.get(`avatars/${userId}`);
  if (!object) return c.json({ error: "Not found" }, 404);
  const contentType = object.httpMetadata?.contentType ?? "image/jpeg";
  return new Response(object.body, {
    headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=3600" },
  });
});

app.use("/api/account", requireAuth);
app.use("/api/account/*", requireAuth);

// Admin-only: sync, debug, migrate, admin management
app.use("/api/sync/*", requireRole("admin", "super_admin"));
app.use("/api/debug/*", requireRole("admin", "super_admin"));
app.use("/api/migrate", requireRole("super_admin"));
app.use("/api/admin/*", requireRole("super_admin"));

// Health check
app.get("/api/health", (c) => c.json({ status: "ok" }));

// Status endpoint
app.get("/api/status", async (c) => {
  const db = c.env.DB;
  const user = c.get("user");

  const vehicleCount = await db
    .prepare(`SELECT COUNT(*) as count FROM vehicles v`)
    .first<{ count: number }>();
  const paintCount = await db
    .prepare("SELECT COUNT(*) as count FROM paints WHERE is_base_variant = 0")
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
    features: {
      ops: c.env.ENVIRONMENT !== "production",
      fpsLoadout: true, // live everywhere behind the page-level WIP banner
    },
    build: BUILD_ID,
  });
});

// Loadout route must be mounted directly — Hono sub-router /:slug/loadout doesn't match
app.get("/api/ships/:slug/loadout", async (c) => {
  const slug = c.req.param("slug");
  const db = c.env.DB;
  return cachedJson(c, `ships:loadout:${cacheSlug(slug)}`, () =>
    getShipLoadout(db, slug),
  );
});

// Salvage data for a specific ship
app.get("/api/ships/:slug/salvage", async (c) => {
  const slug = c.req.param("slug");
  const db = c.env.DB;
  return cachedJson(c, `ships:salvage:${cacheSlug(slug)}`, () =>
    getSalvageForShip(db, slug),
  );
});

// All salvageable ships
app.get("/api/gamedata/salvageable-ships", async (c) => {
  const db = c.env.DB;
  return cachedJson(c, `gd:salvageable-ships`, () =>
    listSalvageableShips(db),
  );
});

// Public changelog (#124) — published entries, newest first.
app.get("/api/changelog", async (c) => {
  const db = c.env.DB;
  return cachedJson(c, `changelog:list`, () => listChangelogEntries(db));
});

// Mount route groups — matches Go router URL structure exactly
app.route("/api/ships", vehicleRoutes<HonoEnv>());
app.route("/api/vehicles", fleetRoutes());
app.route("/api/paints", paintRoutes<HonoEnv>());
app.route("/api/import", importRoutes());
app.route("/api/settings", settingsRoutes());
app.route("/api/sync", syncRoutes<HonoEnv>());
app.route("/api", analysisRoutes());
app.route("/api", chatRoutes());
app.route("/api/debug", debugRoutes());
app.route("/api/migrate", migrateRoutes());
app.route("/api/account", accountRoutes());
app.route("/api/orgs", orgRoutes());
app.route("/api/admin", adminRoutes());
app.route("/api/contracts", contractRoutes<HonoEnv>());
app.route("/api/loot", lootRoutes());
app.route("/api/hangar", hangarRoutes());
app.route("/api/patches", patchRoutes());
app.route("/api/gamedata", gamedataRoutes<HonoEnv>());
app.route("/api/localization", localizationRoutes());
// Ops: staging only
app.use("/api/ops/*", async (c, next) => {
  if (c.env.ENVIRONMENT === "production") return c.json({ error: "Not found" }, 404);
  return next();
});
app.route("/api/ops", publicOpsRoutes());
app.route("/api/users", reputationRoutes());
app.route("/api/u", publicFleetRoutes());
app.route("/api/companion", companionRoutes());
app.route("/api/loadout", loadoutRoutes());
app.route("/api/components", componentRoutes());
app.route("/api/blueprints", blueprintRoutes());
app.route("/api/weapon-builds", weaponBuildRoutes());
app.route("/api/fps-loadouts", fpsLoadoutRoutes());
app.route("/api/characters", characterRoutes());

// Companion app auth flow — HTML pages outside /api/* (no CORS, no JSON middleware)
app.route("/companion", companionAuthRoutes());

// API fallthrough — return JSON 404 instead of HTML (prevents CF edge cache from caching HTML for API paths)
// Must use app.use() — app.all() route wildcards don't match multi-segment paths in the Workers runtime
app.use("/api/*", async (c) => c.json({ error: "Not Found" }, 404));

// SPA catch-all — forward non-API requests to Workers Assets (serves index.html)
// HTML responses get Cache-Control: no-cache so browsers always revalidate index.html.
// Without this, stale index.html references old chunk hashes → "error loading dynamically
// imported module" when the old .js files are purged from Workers Assets CDN.
app.get("*", async (c) => {
  const res = await c.env.ASSETS.fetch(c.req.raw);
  const ct = res.headers.get("Content-Type") ?? "";
  if (ct.startsWith("text/html")) {
    const headers = new Headers(res.headers);
    headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
    return new Response(res.body, { status: res.status, headers });
  }
  return res;
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
  const { triggerRSISync } = await import("./sync/pipeline");

  switch (cron) {
    case "30 3 * * *":
      console.log("[cron] Session cleanup");
      logEvent("cron_trigger", { schedule: cron, task: "session_cleanup" });
      await cleanExpiredSessions(env);
      break;
    case "45 3 * * *": {
      console.log("[cron] RSI API images");
      logEvent("cron_trigger", { schedule: cron, task: "rsi_images" });
      await triggerRSISync(env);
      // Migrate a batch of paint images from RSI CDN to CF Images. Self-
      // throttling — closes the gap chunk-by-chunk so no operator has to
      // POST /api/admin/images/paint-bulk-upload after each patch.
      const { closePaintImageGap } = await import("./sync/paintImageGap");
      const gap = await closePaintImageGap(env);
      logEvent("cron_complete", {
        task: "paint_image_gap",
        ...gap,
      });
      break;
    }
    case "0 4 * * *": {
      console.log("[cron] Fleetyards production status + loaner sync");
      logEvent("cron_trigger", { schedule: cron, task: "fleetyards_status" });
      const { syncProductionStatuses, syncLoaners } = await import("./sync/fleetyards");
      await syncProductionStatuses(env.DB);
      const loaners = await syncLoaners(env.DB);
      logEvent("cron_complete", { task: "fleetyards_loaners", ...loaners });
      break;
    }
    case "15 * * * *": {
      // Hourly: keep the localization base global.ini fresh by auto-ingesting a
      // clean community vanilla base (BeltaKoda/Dymerz) within hours of a patch.
      console.log("[cron] Localization base auto-ingest");
      logEvent("cron_trigger", { schedule: cron, task: "localization_ingest" });
      const { runLocalizationIngest } = await import("./sync/localizationIngest");
      const result = await runLocalizationIngest(env);
      logEvent("cron_complete", { task: "localization_ingest", ...result });
      break;
    }
    case "0 */2 * * *": {
      console.log("[cron] UEX commodity price sync");
      logEvent("cron_trigger", { schedule: cron, task: "uex_commodities" });
      const { syncUexPrices } = await import("./lib/uex");
      const result = await syncUexPrices(env.DB, "commodities", env.SC_BRIDGE_CACHE);
      if (result.errors.length > 0) {
        console.error(`[cron] UEX commodity errors:`, result.errors);
      }
      logEvent("cron_complete", { task: "uex_commodities", commodities: result.commodities, errors: result.errors.length });
      break;
    }
    case "30 5 * * *": {
      console.log("[cron] UEX item price sync");
      logEvent("cron_trigger", { schedule: cron, task: "uex_items" });
      const { syncUexPrices: syncUexItemPrices } = await import("./lib/uex");
      const result = await syncUexItemPrices(env.DB, "items", env.SC_BRIDGE_CACHE);
      if (result.errors.length > 0) {
        console.error(`[cron] UEX items errors:`, result.errors);
      }
      logEvent("cron_complete", { task: "uex_items", items: result.items, errors: result.errors.length });
      break;
    }
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
