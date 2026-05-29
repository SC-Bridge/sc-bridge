import { Hono } from "hono";
import { z } from "zod";
import type { HonoEnv } from "../lib/types";
import { uploadToCFImages } from "../lib/cfImages";
import { getVehiclesNeedingCFUpload, setVehicleCFImagesID } from "../db/queries";
import { concurrentMap } from "../lib/utils";
import { validate } from "../lib/validation";
import { purgeByPrefix } from "../lib/cache";
import { normaliseTitle } from "../lib/titleNorm";
import { runLocalizationIngest } from "../sync/localizationIngest";

/**
 * /api/admin/* — Admin-only management endpoints (super_admin required)
 */
export function adminRoutes() {
  const routes = new Hono<HonoEnv>();

  /**
   * POST /api/admin/images/bulk-upload?limit=50&offset=0
   *
   * Uploads ship images to Cloudflare Images in batches.
   * Idempotent — skips vehicles that already have a cf_images_id.
   * Returns { processed, succeeded, failed, errors: [{ slug, error }] }
   */
  routes.post("/images/bulk-upload",
    validate("query", z.object({
      limit: z.coerce.number().int().min(1).max(100).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    })),
    async (c) => {
    const token = c.env.CLOUDFLARE_IMAGES_TOKEN;
    const accountHash = c.env.CF_ACCOUNT_HASH;
    const accountId = c.env.CF_ACCOUNT_ID;

    if (!token || !accountHash || !accountId) {
      return c.json(
        { error: "CLOUDFLARE_IMAGES_TOKEN, CF_ACCOUNT_HASH, and CF_ACCOUNT_ID must be set" },
        500,
      );
    }

    const { limit, offset } = c.req.valid("query");

    const vehicles = await getVehiclesNeedingCFUpload(c.env.DB, limit, offset);

    const errors: { slug: string; error: string }[] = [];

    const results = await concurrentMap(vehicles, 5, async (v) => {
      try {
        const cfImagesId = await uploadToCFImages(accountId, token, v.best_image_url, {
          slug: v.slug,
          vehicle_id: String(v.vehicle_id),
        });
        await setVehicleCFImagesID(c.env.DB, v.vehicle_id, cfImagesId, accountHash);
        return true;
      } catch (err) {
        errors.push({ slug: v.slug, error: String(err) });
        console.error(`[admin/images] CF upload failed for ${v.slug}:`, err);
        return false;
      }
    });

    const succeeded = results.filter(Boolean).length;

    return c.json({
      processed: vehicles.length,
      succeeded,
      failed: results.length - succeeded,
      errors,
    });
  });

  /**
   * POST /api/admin/images/paint-bulk-upload?limit=50&offset=0
   *
   * Upload paint images to CF Images. Processes paints that have RSI URLs
   * but no CF Images URL. Updates paint image_url to CF Images delivery URL.
   */
  routes.post("/images/paint-bulk-upload",
    validate("query", z.object({
      limit: z.coerce.number().int().min(1).max(100).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    })),
    async (c) => {
    const token = c.env.CLOUDFLARE_IMAGES_TOKEN;
    const accountHash = c.env.CF_ACCOUNT_HASH;
    const accountId = c.env.CF_ACCOUNT_ID;

    if (!token || !accountHash || !accountId) {
      return c.json({ error: "CF Images credentials not configured" }, 500);
    }

    const { limit, offset } = c.req.valid("query");
    const db = c.env.DB;

    // Find paints with RSI URLs (not yet on CF Images)
    const { results: paints } = await db
      .prepare(
        `SELECT id, name, slug, image_url FROM paints
        WHERE image_url IS NOT NULL AND image_url != ''
          AND image_url NOT LIKE 'https://imagedelivery.net%'
        ORDER BY id
        LIMIT ? OFFSET ?`,
      )
      .bind(limit, offset)
      .all();

    const errors: { name: string; error: string }[] = [];

    const results = await concurrentMap(paints as { id: number; name: string; slug: string; image_url: string }[], 5, async (p) => {
      try {
        const cfImagesId = await uploadToCFImages(accountId, token, p.image_url, {
          slug: p.slug,
          paint_id: String(p.id),
          type: "paint",
        });
        const deliveryUrl = `https://imagedelivery.net/${accountHash}/${cfImagesId}/medium`;
        await db
          .prepare("UPDATE paints SET image_url = ? WHERE id = ?")
          .bind(deliveryUrl, p.id)
          .run();
        return true;
      } catch (err) {
        errors.push({ name: p.name, error: String(err) });
        console.error(`[admin/images] Paint CF upload failed for ${p.name}:`, err);
        return false;
      }
    });

    const succeeded = results.filter(Boolean).length;

    // Count remaining
    const remaining = await db
      .prepare(
        `SELECT COUNT(*) as cnt FROM paints
        WHERE image_url IS NOT NULL AND image_url != ''
          AND image_url NOT LIKE 'https://imagedelivery.net%'`,
      )
      .first<{ cnt: number }>();

    return c.json({
      processed: paints.length,
      succeeded,
      failed: results.length - succeeded,
      remaining: remaining?.cnt ?? 0,
      errors,
    });
  });

  /**
   * POST /api/admin/images/upload
   * Body: { slug: string, imageUrl: string }
   *
   * Manually upload a specific ship image by slug and source URL.
   * Useful for ships with broken/missing images (e.g. Valkyrie Liberator Edition).
   * Returns { slug, cf_images_id, image_url }
   */
  routes.post("/images/upload",
    validate("json", z.object({
      slug: z.string().min(1, "slug is required").max(100),
      imageUrl: z.string().url("imageUrl must be a valid URL"),
    })),
    async (c) => {
    const token = c.env.CLOUDFLARE_IMAGES_TOKEN;
    const accountHash = c.env.CF_ACCOUNT_HASH;
    const accountId = c.env.CF_ACCOUNT_ID;

    if (!token || !accountHash || !accountId) {
      return c.json(
        { error: "CLOUDFLARE_IMAGES_TOKEN, CF_ACCOUNT_HASH, and CF_ACCOUNT_ID must be set" },
        500,
      );
    }

    const { slug, imageUrl } = c.req.valid("json");

    const vehicleRow = await c.env.DB
      .prepare(`SELECT v.id FROM vehicles v WHERE v.slug = ?`)
      .bind(slug)
      .first<{ id: number }>();

    if (!vehicleRow) {
      return c.json({ error: `Vehicle not found: ${slug}` }, 404);
    }

    // Ensure vehicle_images row exists
    await c.env.DB
      .prepare(
        `INSERT OR IGNORE INTO vehicle_images (vehicle_id, updated_at)
        VALUES (?, datetime('now'))`,
      )
      .bind(vehicleRow.id)
      .run();

    const cfImagesId = await uploadToCFImages(accountId, token, imageUrl, {
      slug,
      vehicle_id: String(vehicleRow.id),
    });

    await setVehicleCFImagesID(c.env.DB, vehicleRow.id, cfImagesId, accountHash);

    const deliveryUrl = `https://imagedelivery.net/${accountHash}/${cfImagesId}/medium`;

    return c.json({
      slug,
      cf_images_id: cfImagesId,
      image_url: deliveryUrl,
    });
  });

  /**
   * PUT /api/admin/versions/default
   *
   * Sets which game version is the public default.
   * Body: { code: string }
   */
  routes.put("/versions/default",
    validate("json", z.object({
      code: z.string().min(1, "code is required").max(100),
    })),
    async (c) => {
    const { code } = c.req.valid("json");

    // Verify version exists
    const version = await c.env.DB
      .prepare("SELECT id, code, channel FROM game_versions WHERE code = ?")
      .bind(code)
      .first<{ id: number; code: string; channel: string }>();

    if (!version) {
      return c.json({ error: `Game version not found: ${code}` }, 404);
    }

    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE game_versions SET is_default = 0 WHERE is_default = 1"),
      c.env.DB.prepare("UPDATE game_versions SET is_default = 1 WHERE code = ?").bind(code),
    ]);

    // Purge all cached data — version change invalidates everything
    const kv = c.env.SC_BRIDGE_CACHE;
    const purgeResult = await purgeByPrefix(kv);

    return c.json({ code: version.code, channel: version.channel, is_default: 1, cache_purged: purgeResult.deleted });
  });

  /**
   * GET /api/admin/manufacturers
   *
   * List manufacturers for the Add Concept Ship dropdown. The table has
   * multiple rows per manufacturer name — e.g., "Aegis Dynamics" appears
   * with codes AEG (canonical ship brand), FSKI / MXOX / PRAR (weapon
   * component sub-brands), and various PAINT_* codes. We want the
   * ship-brand row.
   *
   * Picks the canonical row per name as "the one with the most non-paint
   * vehicles." For Aegis Dynamics that's AEG (36 ships) over FSKI/etc.
   * (0 ships). Excludes rows whose code starts with PAINT_.
   *
   * `ship_slug_prefix` is the most-common prefix used by existing ships
   * of this manufacturer (e.g., Aegis → "aegs", MISC/Musashi → "misc")
   * — NOT the manufacturer.slug column, which holds the lowercased code
   * ("aeg", "mis") and doesn't match the ship slug convention.
   */
  routes.get("/manufacturers", async (c) => {
    const result = await c.env.DB
      .prepare(
        `SELECT id, name, code, slug, ship_slug_prefix, ship_count FROM (
           SELECT m.id, m.name, m.code, m.slug,
             (SELECT COUNT(*) FROM vehicles v
                WHERE v.manufacturer_id = m.id AND v.is_paint_variant = 0) AS ship_count,
             (SELECT substr(v.slug, 1, instr(v.slug, '-') - 1)
              FROM vehicles v
              WHERE v.manufacturer_id = m.id AND v.is_paint_variant = 0
                AND v.slug LIKE '%-%'
              GROUP BY substr(v.slug, 1, instr(v.slug, '-') - 1)
              ORDER BY COUNT(*) DESC
              LIMIT 1) AS ship_slug_prefix,
             ROW_NUMBER() OVER (
               PARTITION BY m.name
               ORDER BY
                 (SELECT COUNT(*) FROM vehicles v
                    WHERE v.manufacturer_id = m.id AND v.is_paint_variant = 0) DESC,
                 m.id ASC
             ) AS rn
           FROM manufacturers m
           WHERE m.code IS NOT NULL
             AND m.slug IS NOT NULL
             AND m.removed = 0
             AND m.code NOT LIKE 'PAINT_%'
             AND m.code NOT LIKE 'SHOP_%'
         )
         WHERE rn = 1
           AND ship_count > 0
         ORDER BY name`,
      )
      .all<{
        id: number; name: string; code: string; slug: string;
        ship_slug_prefix: string | null; ship_count: number
      }>();
    return c.json(result.results);
  });

  /**
   * POST /api/admin/vehicles/concept
   *
   * Add a concept ship — pledgeable on the RSI store but not yet in DataCore.
   * Matches the existing pattern of concept ships (class_name IS NULL,
   * is_pledgeable=1, nullable spec columns). Nightly RSI sync will enrich
   * pledge_url, pledge_price, and image_url* once CIG adds the ship to the
   * Ship Matrix.
   *
   * Body: {
   *   name: required string,
   *   slug: optional string (auto-derived from manufacturer.slug + name if absent),
   *   manufacturer_id: required number,
   *   focus, classification, description, pledge_url, image_url: optional
   * }
   */
  routes.post("/vehicles/concept",
    validate("json", z.object({
      name: z.string().min(1).max(100),
      slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, digits, and dashes").optional(),
      manufacturer_id: z.number().int().positive(),
      focus: z.string().max(50).optional(),
      classification: z.string().max(50).optional(),
      description: z.string().max(5000).optional(),
      pledge_url: z.string().url().max(500).optional(),
      image_url: z.string().url().max(500).optional(),
    })),
    async (c) => {
      const body = c.req.valid("json");

      // Verify manufacturer exists + grab slug/name for auto-derive
      const mfr = await c.env.DB
        .prepare("SELECT id, name, slug FROM manufacturers WHERE id = ?")
        .bind(body.manufacturer_id)
        .first<{ id: number; name: string; slug: string }>();
      if (!mfr) {
        return c.json({ error: `Manufacturer not found: ${body.manufacturer_id}` }, 404);
      }

      // Auto-derive slug if not provided. Uses the most-common existing
      // ship-slug prefix for this manufacturer (e.g. "aegs" for Aegis
      // Dynamics — not the manufacturer.slug "aeg"). Falls back to
      // manufacturer.slug when no ships exist yet. Strips the manufacturer's
      // first-word from the ship name so "Aegis Odin" → "aegs-odin"
      // (not "aegs-aegis-odin").
      let slug = body.slug;
      if (!slug) {
        const prefixRow = await c.env.DB
          .prepare(
            `SELECT substr(v.slug, 1, instr(v.slug, '-') - 1) AS prefix
             FROM vehicles v
             WHERE v.manufacturer_id = ? AND v.is_paint_variant = 0 AND v.slug LIKE '%-%'
             GROUP BY prefix
             ORDER BY COUNT(*) DESC
             LIMIT 1`,
          )
          .bind(body.manufacturer_id)
          .first<{ prefix: string }>();
        const prefix = prefixRow?.prefix ?? mfr.slug;
        const mfrFirstWord = mfr.name.split(/\s+/)[0]?.toLowerCase() ?? "";
        let suffix = body.name.toLowerCase();
        if (mfrFirstWord && suffix.startsWith(mfrFirstWord + " ")) {
          suffix = suffix.slice(mfrFirstWord.length + 1);
        }
        suffix = suffix.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        slug = `${prefix}-${suffix}`;
      }

      // Reject if slug already exists
      const existing = await c.env.DB
        .prepare("SELECT 1 FROM vehicles WHERE slug = ?")
        .bind(slug)
        .first();
      if (existing) {
        return c.json({ error: `Slug already exists: ${slug}` }, 409);
      }

      // Look up current default game_version_id
      const version = await c.env.DB
        .prepare("SELECT id FROM game_versions WHERE is_default = 1 LIMIT 1")
        .first<{ id: number }>();
      if (!version) {
        return c.json({ error: "No default game version set" }, 500);
      }

      const uuid = crypto.randomUUID();

      await c.env.DB
        .prepare(
          `INSERT INTO vehicles (
             uuid, slug, name, manufacturer_id, focus, classification, description,
             pledge_url, image_url, image_url_small, image_url_medium, image_url_large,
             game_version_id, is_pledgeable, is_npc_only, is_paint_variant, removed, class_name
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 0, 0, NULL)`,
        )
        .bind(
          uuid,
          slug,
          body.name,
          body.manufacturer_id,
          body.focus ?? null,
          body.classification ?? null,
          body.description ?? null,
          body.pledge_url ?? null,
          body.image_url ?? null,
          body.image_url ?? null,
          body.image_url ?? null,
          body.image_url ?? null,
          version.id,
        )
        .run();

      const inserted = await c.env.DB
        .prepare("SELECT id, uuid, slug, name FROM vehicles WHERE slug = ?")
        .bind(slug)
        .first();

      return c.json({ ok: true, vehicle: inserted }, 201);
    },
  );

  /**
   * POST /api/admin/invites
   *
   * Generates a single-use invite token and returns the signup URL.
   * Returns { token, url }
   */
  routes.post("/invites", async (c) => {
    const token = crypto.randomUUID();
    const baseUrl = c.env.BETTER_AUTH_URL;
    await c.env.DB
      .prepare("INSERT INTO invite_tokens (token) VALUES (?)")
      .bind(token).run();
    return c.json({ token, url: `${baseUrl}/register?invite=${token}` });
  });

  /**
   * GET /api/admin/invites
   *
   * Lists all invite tokens ordered by creation date descending.
   * Returns [{ token, created_at, used_at }]
   */
  routes.get("/invites", async (c) => {
    const rows = await c.env.DB
      .prepare("SELECT token, created_at, used_at FROM invite_tokens ORDER BY created_at DESC")
      .all<{ token: string; created_at: string; used_at: string | null }>();
    return c.json(rows.results ?? []);
  });

  /**
   * POST /api/admin/cache/purge
   *
   * Purge KV cache. Optional body: { prefix: string } to purge by prefix.
   * Without prefix, purges all cached keys.
   * Returns { deleted: number }
   */
  routes.post("/cache/purge", async (c) => {
    let prefix: string | undefined;
    try {
      const body = await c.req.json();
      if (body?.prefix && typeof body.prefix === "string") {
        prefix = body.prefix.slice(0, 200);
      }
    } catch {
      // Empty body is fine — purge all
    }
    const kv = c.env.SC_BRIDGE_CACHE;
    const result = await purgeByPrefix(kv, prefix);
    return c.json(result);
  });

  /**
   * POST /api/admin/uex/sync
   *
   * Manually trigger UEX price sync. Optional body: { type: "commodities" | "items" | "all" }
   * Returns { ok, commodities, items, errors }
   */
  routes.post("/uex/sync", async (c) => {
    const { syncUexPrices } = await import("../lib/uex");
    const body = await c.req.json().catch(() => ({})) as { type?: string };
    const type = (body.type === "commodities" || body.type === "items") ? body.type : "all";
    const result = await syncUexPrices(c.env.DB, type, c.env.SC_BRIDGE_CACHE);
    console.log(`[admin] UEX sync: ${result.commodities} commodities, ${result.items} items, ${result.errors.length} errors`);
    return c.json({ ok: true, ...result });
  });

  /**
   * POST /api/admin/rsi/ship-status
   *
   * Fetch the public RSI ship-matrix (/ship-matrix/index) and update each
   * vehicle's production_status_id + is_pledgeable flag. Lightweight — single
   * HTTP request against a public endpoint, no auth required, no rate limiting.
   * Returns { ok: true, message } immediately; the sync runs synchronously
   * inside the request because it's small (~250 ships).
   */
  routes.post("/rsi/ship-status", async (c) => {
    const { triggerShipProductionStatusSync } = await import("../sync/pipeline");
    const result = await triggerShipProductionStatusSync(c.env);
    return c.json({ ok: true, message: result });
  });

  /**
   * PUT /api/admin/localization/global-ini
   *
   * Upload base global.ini for a game version. Stored in KV for the
   * localization builder download endpoint.
   * Body: raw text/plain content of global.ini
   * Query: ?version_code=4.6.0-live.11319298
   */
  routes.put("/localization/global-ini",
    validate("query", z.object({
      version_code: z.string().min(1).max(100),
    })),
    async (c) => {
    const { version_code } = c.req.valid("query");
    const kv = c.env.LOCALIZATION_KV;

    // Verify the version exists
    const ver = await c.env.DB
      .prepare("SELECT id FROM game_versions WHERE code = ?")
      .bind(version_code)
      .first<{ id: number }>();
    if (!ver) {
      return c.json({ error: `Game version '${version_code}' not found` }, 404);
    }

    const body = await c.req.text();
    if (!body || body.length < 1000) {
      return c.json({ error: "Body too small to be a valid global.ini" }, 400);
    }

    const key = `localization:global-ini:${version_code}`;
    await kv.put(key, body);

    const lines = body.split("\n").length;
    const sizeKB = Math.round(body.length / 1024);

    return c.json({
      ok: true,
      message: `Stored global.ini for ${version_code}`,
      lines,
      sizeKB,
    });
  });

  // ── Localization overlay packs ──────────────────────────────────────

  /**
   * PUT /api/admin/localization/overlay-pack
   *
   * Upload or update an overlay pack. Metadata stored in D1, content in KV.
   * Body: raw text/plain INI content (key=value lines)
   */
  routes.put("/localization/overlay-pack",
    validate("query", z.object({
      name: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
      label: z.string().min(1).max(200),
      description: z.string().max(500).optional(),
      icon: z.string().max(50).optional(),
      version_code: z.string().min(1).max(100),
      sort_order: z.coerce.number().int().optional(),
    })),
    async (c) => {
      const { name, label, description, icon, version_code, sort_order } = c.req.valid("query");
      const db = c.env.DB;
      const kv = c.env.LOCALIZATION_KV;

      // Verify the version exists
      const ver = await db
        .prepare("SELECT id FROM game_versions WHERE code = ?")
        .bind(version_code)
        .first<{ id: number }>();
      if (!ver) {
        return c.json({ error: `Game version '${version_code}' not found` }, 404);
      }

      const body = await c.req.text();
      if (!body || body.length < 10) {
        return c.json({ error: "Body too small to be a valid overlay pack" }, 400);
      }

      // Count keys
      const keyCount = body.split("\n").filter((l: string) => l.includes("=")).length;

      // Upsert metadata
      await db
        .prepare(
          `INSERT INTO localization_overlay_packs (name, label, description, icon, sort_order, version_code, key_count, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(name) DO UPDATE SET
             label = excluded.label,
             description = COALESCE(excluded.description, localization_overlay_packs.description),
             icon = COALESCE(excluded.icon, localization_overlay_packs.icon),
             sort_order = COALESCE(excluded.sort_order, localization_overlay_packs.sort_order),
             version_code = excluded.version_code,
             key_count = excluded.key_count,
             updated_at = excluded.updated_at`,
        )
        .bind(name, label, description ?? null, icon ?? null, sort_order ?? 0, version_code, keyCount)
        .run();

      // Store content in KV
      const kvKey = `localization:pack:${name}:${version_code}`;
      await kv.put(kvKey, body);

      const sizeKB = Math.round(body.length / 1024);

      return c.json({
        ok: true,
        message: `Stored overlay pack '${name}' for ${version_code}`,
        keyCount,
        sizeKB,
      });
    },
  );

  /** GET /api/admin/localization/overlay-packs — list all packs (admin view) */
  routes.get("/localization/overlay-packs", async (c) => {
    const db = c.env.DB;
    const rows = await db
      .prepare("SELECT * FROM localization_overlay_packs ORDER BY sort_order")
      .all();
    return c.json({ packs: rows.results });
  });

  /** PATCH /api/admin/localization/overlay-pack/:name — edit active state and/or metadata */
  routes.patch(
    "/localization/overlay-pack/:name",
    validate("param", z.object({ name: z.string().regex(/^[a-z0-9-]+$/) })),
    validate("json", z.object({
      is_active: z.boolean().optional(),
      label: z.string().min(1).max(200).optional(),
      description: z.string().max(500).nullable().optional(),
      sort_order: z.coerce.number().int().optional(),
    })),
    async (c) => {
      const db = c.env.DB;
      const { name } = c.req.valid("param");
      const body = c.req.valid("json");

      const sets: string[] = [];
      const values: unknown[] = [];
      if (body.is_active !== undefined) { sets.push("is_active = ?"); values.push(body.is_active ? 1 : 0); }
      if (body.label !== undefined) { sets.push("label = ?"); values.push(body.label); }
      if (body.description !== undefined) { sets.push("description = ?"); values.push(body.description); }
      if (body.sort_order !== undefined) { sets.push("sort_order = ?"); values.push(body.sort_order); }
      if (sets.length === 0) return c.json({ error: "No fields to update" }, 400);
      sets.push("updated_at = datetime('now')");

      const res = await db
        .prepare(`UPDATE localization_overlay_packs SET ${sets.join(", ")} WHERE name = ?`)
        .bind(...values, name)
        .run();
      if (!res.meta.changes) return c.json({ error: "Pack not found" }, 404);
      return c.json({ ok: true });
    },
  );

  /** POST /api/admin/localization/ingest — run the community base-ini auto-ingest now */
  routes.post("/localization/ingest", async (c) => {
    const result = await runLocalizationIngest(c.env);
    return c.json(result);
  });

  /** GET /api/admin/localization/pack-requests — review user pack requests */
  routes.get("/localization/pack-requests", async (c) => {
    const db = c.env.DB;
    const rows = await db
      .prepare("SELECT * FROM pack_requests ORDER BY created_at DESC LIMIT 200")
      .all();
    return c.json({ requests: rows.results });
  });

  /** DELETE /api/admin/localization/overlay-pack/:name — remove pack + KV content */
  routes.delete(
    "/localization/overlay-pack/:name",
    validate("param", z.object({ name: z.string().regex(/^[a-z0-9-]+$/) })),
    async (c) => {
      const db = c.env.DB;
      const kv = c.env.LOCALIZATION_KV;
      const { name } = c.req.valid("param");
      const row = await db
        .prepare("SELECT version_code FROM localization_overlay_packs WHERE name = ?")
        .bind(name)
        .first<{ version_code: string }>();
      if (!row) return c.json({ error: "Pack not found" }, 404);
      await kv.delete(`localization:pack:${name}:${row.version_code}`);
      await db.prepare("DELETE FROM localization_overlay_packs WHERE name = ?").bind(name).run();
      return c.json({ ok: true });
    },
  );

  // ── Rating audit (super_admin) ──────────────────────────────────────

  // GET /api/admin/ratings/user/:userId — all ratings for a user (not anonymized)
  routes.get("/ratings/user/:userId", async (c) => {
    const userId = c.req.param("userId");
    const db = c.env.DB;

    const { results: ratings } = await db
      .prepare(
        `SELECT pr.id, pr.rater_user_id, pr.ratee_user_id, pr.org_op_id,
          pr.score, pr.ip_address, pr.created_at,
          rc.key as category, rc.label as category_label,
          rater.name as rater_name, ratee.name as ratee_name,
          o.name as op_name
        FROM player_ratings pr
        JOIN rating_categories rc ON rc.id = pr.rating_category_id
        JOIN user rater ON rater.id = pr.rater_user_id
        JOIN user ratee ON ratee.id = pr.ratee_user_id
        LEFT JOIN org_ops o ON o.id = pr.org_op_id
        WHERE pr.ratee_user_id = ?
        ORDER BY pr.created_at DESC`,
      )
      .bind(userId)
      .all();

    const { results: reviews } = await db
      .prepare(
        `SELECT prv.id, prv.rater_user_id, prv.ratee_user_id, prv.org_op_id,
          prv.comment, prv.ip_address, prv.created_at,
          rater.name as rater_name
        FROM player_reviews prv
        JOIN user rater ON rater.id = prv.rater_user_id
        WHERE prv.ratee_user_id = ?
        ORDER BY prv.created_at DESC`,
      )
      .bind(userId)
      .all();

    return c.json({ ratings, reviews });
  });

  // GET /api/admin/ratings/audit — audit log
  routes.get("/ratings/audit", async (c) => {
    const db = c.env.DB;
    const page = parseInt(c.req.query("page") || "1", 10) || 1;
    const perPage = 50;
    const offset = (page - 1) * perPage;

    const { results } = await db
      .prepare(
        `SELECT ral.*, u.name as actor_name
        FROM rating_audit_log ral
        JOIN user u ON u.id = ral.actor_user_id
        ORDER BY ral.created_at DESC
        LIMIT ? OFFSET ?`,
      )
      .bind(perPage, offset)
      .all();

    return c.json({ audit_log: results, page });
  });

  // DELETE /api/admin/ratings/:ratingId — remove abusive rating
  routes.delete("/ratings/:ratingId", async (c) => {
    const ratingId = parseInt(c.req.param("ratingId"), 10);
    const db = c.env.DB;
    const user = c.get("user");
    const ip = c.req.header("CF-Connecting-IP") ?? null;

    const rating = await db
      .prepare("SELECT id, ratee_user_id, rating_category_id FROM player_ratings WHERE id = ?")
      .bind(ratingId)
      .first<{ id: number; ratee_user_id: string; rating_category_id: number }>();
    if (!rating) return c.json({ error: "Rating not found" }, 404);

    await db.batch([
      db.prepare("DELETE FROM player_ratings WHERE id = ?").bind(ratingId),
      db.prepare(
        "INSERT INTO rating_audit_log (action, actor_user_id, target_rating_id, detail, ip_address) VALUES ('remove', ?, ?, 'Admin removed rating', ?)",
      ).bind(user!.id, ratingId, ip),
    ]);

    // Recalculate median for affected category
    const countResult = await db
      .prepare("SELECT COUNT(*) as cnt FROM player_ratings WHERE ratee_user_id = ? AND rating_category_id = ?")
      .bind(rating.ratee_user_id, rating.rating_category_id)
      .first<{ cnt: number }>();
    const count = countResult?.cnt ?? 0;

    if (count === 0) {
      await db
        .prepare("DELETE FROM player_reputation WHERE user_id = ? AND rating_category_id = ?")
        .bind(rating.ratee_user_id, rating.rating_category_id)
        .run();
    } else {
      const offset = Math.floor(count / 2);
      const medianResult = await db
        .prepare("SELECT score FROM player_ratings WHERE ratee_user_id = ? AND rating_category_id = ? ORDER BY score LIMIT 1 OFFSET ?")
        .bind(rating.ratee_user_id, rating.rating_category_id, offset)
        .first<{ score: number }>();

      await db
        .prepare(
          `INSERT INTO player_reputation (user_id, rating_category_id, median_score, rating_count, updated_at)
           VALUES (?, ?, ?, ?, datetime('now'))
           ON CONFLICT(user_id, rating_category_id) DO UPDATE SET
             median_score = excluded.median_score,
             rating_count = excluded.rating_count,
             updated_at = excluded.updated_at`,
        )
        .bind(rating.ratee_user_id, rating.rating_category_id, medianResult?.score ?? 0, count)
        .run();
    }

    return c.json({ ok: true });
  });

  // ── PTU data management ────────────────────────────────────────────

  /**
   * DELETE /api/admin/versions/ptu
   *
   * Purge all game data for a PTU/EPTU channel. The game_versions row is kept
   * alive but with build_number set to NULL, so the EXISTS check in
   * getGameVersions naturally hides it from the dropdown until new data arrives.
   *
   * Body: { channel?: "PTU" | "EPTU" } (defaults to "PTU")
   */
  routes.delete("/versions/ptu",
    validate("json", z.object({
      channel: z.enum(["PTU", "EPTU"]).default("PTU"),
    }).default({ channel: "PTU" })),
    async (c) => {
    const { channel } = c.req.valid("json");
    const db = c.env.DB;

    const version = await db
      .prepare("SELECT id FROM game_versions WHERE channel = ?")
      .bind(channel)
      .first<{ id: number }>();

    if (!version) {
      return c.json({ error: `No ${channel} version row found` }, 404);
    }

    const versionId = version.id;

    // PTU data lives in ptu_* shadow tables. Purge = DROP all of them.
    const { VERSIONED_TABLES } = await import("../lib/ptu");

    // Child tables without game_version_id that shadow ptu_* parents,
    // plus tables added after migration 0215 (not in VERSIONED_TABLES).
    const ptuChildTables = [
      "ptu_crafting_slot_modifiers",
      "ptu_crafting_blueprint_slots",
      "ptu_mining_location_deposits",
      "ptu_salvageable_ship_components",
      "ptu_paint_vehicles",
      "ptu_npc_factions",
      // 4.8 new types (added in migration 0219)
      "ptu_crafting_quality_quantization",
      "ptu_transport_carriage_announcements",
      "ptu_transport_destination_categories",
      "ptu_unified_shake_params",
    ];

    const dropStatements: D1PreparedStatement[] = [
      // Drop child shadow tables first
      ...ptuChildTables.map(t => db.prepare(`DROP TABLE IF EXISTS ${t}`)),
      // Drop all versioned shadow tables
      ...VERSIONED_TABLES.map(t => db.prepare(`DROP TABLE IF EXISTS ptu_${t}`)),
    ];

    // Clear build_number so the row is hidden from dropdown
    dropStatements.push(
      db.prepare("UPDATE game_versions SET build_number = NULL WHERE id = ?").bind(versionId)
    );

    try {
      // D1 batch limit is 100 statements
      for (let i = 0; i < dropStatements.length; i += 100) {
        await db.batch(dropStatements.slice(i, i + 100));
      }
    } catch (err) {
      console.error("[admin/ptu-purge] batch failed:", err);
      return c.json({ error: `Purge failed: ${String(err)}` }, 500);
    }

    // Purge KV cache
    const kv = c.env.SC_BRIDGE_CACHE;
    await purgeByPrefix(kv);

    return c.json({ ok: true, tables_purged: VERSIONED_TABLES.length + ptuChildTables.length, channel });
  });

  /**
   * PUT /api/admin/versions/ptu/build
   *
   * Update the build number (and optionally the code) for a PTU/EPTU version.
   * Used after loading new PTU data to record which build the data is from.
   */
  routes.put("/versions/ptu/build",
    validate("json", z.object({
      channel: z.enum(["PTU", "EPTU"]),
      build_number: z.string().min(1).max(50),
      code: z.string().min(1).max(100).optional(),
    })),
    async (c) => {
    const { channel, build_number, code } = c.req.valid("json");
    const db = c.env.DB;

    // Find or create the canonical row for this channel
    let version = await db
      .prepare("SELECT id, code FROM game_versions WHERE channel = ?")
      .bind(channel)
      .first<{ id: number; code: string }>();

    if (!version && code) {
      // Create the PTU row if it doesn't exist yet
      const uuid = `${code}-${build_number}`;
      await db
        .prepare("INSERT INTO game_versions (uuid, code, channel, is_default, build_number) VALUES (?, ?, ?, 0, ?)")
        .bind(uuid, code, channel, build_number)
        .run();
      version = await db
        .prepare("SELECT id, code FROM game_versions WHERE channel = ?")
        .bind(channel)
        .first<{ id: number; code: string }>();
    }

    if (!version) {
      return c.json({ error: `No ${channel} version row found. Provide 'code' to create one.` }, 404);
    }

    const updates: D1PreparedStatement[] = [
      db.prepare("UPDATE game_versions SET build_number = ? WHERE id = ?").bind(build_number, version.id),
    ];

    if (code && code !== version.code) {
      updates.push(
        db.prepare("UPDATE game_versions SET code = ? WHERE id = ?").bind(code, version.id)
      );
    }

    await db.batch(updates);

    // Purge KV cache
    const kv = c.env.SC_BRIDGE_CACHE;
    await purgeByPrefix(kv);

    return c.json({ ok: true, code: code || version.code, build_number, channel });
  });

  // ── Image captures (CDN review) ──────────────────────────────────

  /**
   * GET /api/admin/image-captures?kind=Ship&promoted=0&page=1&show_all=0
   *
   * List captured image URLs for review.
   *
   * By default, hides captures where we already have a canonical
   * CF Images URL elsewhere (linked vehicle, matched paint, or a
   * pledge_item_media entry by lowercase title) — these don't need
   * promotion. Pass `?show_all=1` to override the filter.
   */
  routes.get("/image-captures", async (c) => {
    const db = c.env.DB;
    const kind = c.req.query("kind");
    const promoted = c.req.query("promoted");
    const showAll = c.req.query("show_all") === "1";
    const page = parseInt(c.req.query("page") || "1", 10) || 1;
    const perPage = 50;
    const offset = (page - 1) * perPage;

    let where = "1=1";
    const params: (string | number)[] = [];
    if (kind) { where += " AND kind = ?"; params.push(kind); }
    if (promoted !== undefined && promoted !== "") { where += " AND promoted = ?"; params.push(parseInt(promoted, 10)); }

    // Default: hide captures we already have a CDN image for.
    // (1) Linked vehicle has imagedelivery URL
    // (2) Matching paint by title_norm has imagedelivery URL
    // (3) title_norm matches a pledge_item_media entry
    //
    // title_norm is the canonical form produced by normaliseTitle()
    // — handles unicode dashes, mixed whitespace, case, and the
    // Paint/Skin → Livery rename.
    const alreadyHaveClause = !showAll
      ? `AND NOT EXISTS (
           SELECT 1 FROM vehicles v2
           WHERE v2.id = ic.vehicle_id
             AND v2.image_url LIKE 'https://imagedelivery.net%'
         )
         AND NOT EXISTS (
           SELECT 1 FROM paints p2
           WHERE p2.title_norm = ic.title_norm
             AND ic.title_norm != ''
             AND p2.image_url LIKE 'https://imagedelivery.net%'
         )
         AND NOT EXISTS (
           SELECT 1 FROM pledge_item_media pim
           WHERE pim.title_norm = ic.title_norm
             AND ic.title_norm != ''
         )
         /* Manual admin override — when an admin picks a canonical
            row from any reference table via the "Pick <kind>" picker,
            (manual_match_kind, manual_match_id) is set. We trust the
            PATCH endpoint to have validated the row exists, so a
            non-null kind+id pair means the capture is covered. */
         AND NOT (
           ic.manual_match_kind IS NOT NULL
           AND ic.manual_match_id IS NOT NULL
         )
         /* Ship-name divergence resolver: pledge titles like
            "Ares - Aspire Paint" don't title_norm-match
            "Ares Star Fighter Aspire Livery" because the pledge
            uses a short ship name. Resolve by:
              - extracting variant (everything after " - ", minus
                trailing " Paint"/" Livery")
              - extracting ship (everything before " - ")
              - JOIN paints + paint_vehicles + vehicles
              - paint.name contains variant + vehicle.name contains ship
                + paint has imagedelivery URL
            Only fires for kind='Skin' captures with " - " in title. */
         AND NOT (
           ic.kind = 'Skin'
           AND ic.title LIKE '% - %'
           AND EXISTS (
             SELECT 1 FROM paints p3
             JOIN paint_vehicles pv ON pv.paint_id = p3.id
             JOIN vehicles vp ON vp.id = pv.vehicle_id
             WHERE p3.image_url LIKE 'https://imagedelivery.net%'
               AND LOWER(p3.name) LIKE '%' || LOWER(TRIM(REPLACE(REPLACE(SUBSTR(ic.title, INSTR(ic.title, ' - ') + 3), ' Paint', ''), ' Livery', ''))) || '%'
               AND LOWER(vp.name) LIKE '%' || LOWER(TRIM(SUBSTR(ic.title, 1, INSTR(ic.title, ' - ') - 1))) || '%'
           )
         )`
      : "";

    const countRow = await db
      .prepare(`SELECT COUNT(*) as total FROM image_captures ic WHERE ${where} ${alreadyHaveClause}`)
      .bind(...params)
      .first<{ total: number }>();

    const { results } = await db
      .prepare(`SELECT ic.*,
        v.image_url as current_vehicle_image,
        /* Resolved paint match. Priority cascade:
             1. Manual admin override (manual_paint_id)
             2. title_norm equality
             3. ship + variant cross-table SQL match
           First non-null wins. Used by the captures panel to show a
           "Matched: <paint name>" badge or "Unmatched [Pick paint]"
           button. */
        /* Polymorphic resolved match. Cascade:
             1. manual_match_kind/id (any kind)
             2. paint title_norm equality (Skin only)
             3. paint ship+variant SQL (Skin only)
           matched_kind tells the UI which reference table the row
           lives in so it can render appropriately. */
        CASE
          WHEN ic.manual_match_kind IS NOT NULL AND ic.manual_match_id IS NOT NULL
            THEN ic.manual_match_kind
          WHEN ic.kind = 'Skin' AND EXISTS (
            SELECT 1 FROM paints p2
            WHERE p2.title_norm = ic.title_norm AND ic.title_norm != ''
          ) THEN 'paint'
          WHEN ic.kind = 'Skin' AND ic.title LIKE '% - %' AND EXISTS (
            SELECT 1 FROM paints p3
            JOIN paint_vehicles pv ON pv.paint_id = p3.id
            JOIN vehicles vp ON vp.id = pv.vehicle_id
            WHERE p3.image_url LIKE 'https://imagedelivery.net%'
              AND LOWER(p3.name) LIKE '%' || LOWER(TRIM(REPLACE(REPLACE(SUBSTR(ic.title, INSTR(ic.title, ' - ') + 3), ' Paint', ''), ' Livery', ''))) || '%'
              AND LOWER(vp.name) LIKE '%' || LOWER(TRIM(SUBSTR(ic.title, 1, INSTR(ic.title, ' - ') - 1))) || '%'
          ) THEN 'paint'
          ELSE NULL
        END AS matched_kind,
        CASE
          WHEN ic.manual_match_kind IS NOT NULL AND ic.manual_match_id IS NOT NULL
            THEN ic.manual_match_id
          WHEN ic.kind = 'Skin' THEN COALESCE(
            (SELECT id FROM paints WHERE title_norm = ic.title_norm AND ic.title_norm != '' LIMIT 1),
            (SELECT p3.id FROM paints p3
               JOIN paint_vehicles pv ON pv.paint_id = p3.id
               JOIN vehicles vp ON vp.id = pv.vehicle_id
               WHERE ic.title LIKE '% - %'
                 AND p3.image_url LIKE 'https://imagedelivery.net%'
                 AND LOWER(p3.name) LIKE '%' || LOWER(TRIM(REPLACE(REPLACE(SUBSTR(ic.title, INSTR(ic.title, ' - ') + 3), ' Paint', ''), ' Livery', ''))) || '%'
                 AND LOWER(vp.name) LIKE '%' || LOWER(TRIM(SUBSTR(ic.title, 1, INSTR(ic.title, ' - ') - 1))) || '%'
               LIMIT 1)
          )
          ELSE NULL
        END AS matched_id,
        /* Per-kind name lookup. Adding a new MATCH_KINDS entry above
           also requires a WHEN clause here. */
        CASE
          WHEN ic.manual_match_kind = 'paint' THEN (SELECT name FROM paints WHERE id = ic.manual_match_id)
          WHEN ic.manual_match_kind = 'fps_weapon' THEN (SELECT name FROM fps_weapons WHERE id = ic.manual_match_id)
          WHEN ic.manual_match_kind = 'fps_armour' THEN (SELECT name FROM fps_armour WHERE id = ic.manual_match_id)
          WHEN ic.manual_match_kind = 'fps_helmet' THEN (SELECT name FROM fps_helmets WHERE id = ic.manual_match_id)
          WHEN ic.manual_match_kind = 'vehicle_component' THEN (SELECT name FROM vehicle_components WHERE id = ic.manual_match_id)
          WHEN ic.kind = 'Skin' THEN COALESCE(
            (SELECT name FROM paints WHERE title_norm = ic.title_norm AND ic.title_norm != '' LIMIT 1),
            (SELECT p3.name FROM paints p3
               JOIN paint_vehicles pv ON pv.paint_id = p3.id
               JOIN vehicles vp ON vp.id = pv.vehicle_id
               WHERE ic.title LIKE '% - %'
                 AND p3.image_url LIKE 'https://imagedelivery.net%'
                 AND LOWER(p3.name) LIKE '%' || LOWER(TRIM(REPLACE(REPLACE(SUBSTR(ic.title, INSTR(ic.title, ' - ') + 3), ' Paint', ''), ' Livery', ''))) || '%'
                 AND LOWER(vp.name) LIKE '%' || LOWER(TRIM(SUBSTR(ic.title, 1, INSTR(ic.title, ' - ') - 1))) || '%'
               LIMIT 1)
          )
          ELSE NULL
        END AS matched_name,
        /* Backwards-compat fields used by the old paint-specific UI
           bits — point to the same paint row when matched_kind='paint'. */
        CASE WHEN (
          (ic.manual_match_kind = 'paint' AND EXISTS (SELECT 1 FROM paints WHERE id = ic.manual_match_id))
          OR (ic.kind = 'Skin' AND EXISTS (SELECT 1 FROM paints WHERE title_norm = ic.title_norm AND ic.title_norm != ''))
        ) THEN COALESCE(
          CASE WHEN ic.manual_match_kind = 'paint' THEN ic.manual_match_id ELSE NULL END,
          (SELECT id FROM paints WHERE title_norm = ic.title_norm AND ic.title_norm != '' LIMIT 1)
        ) END AS matched_paint_id,
        (SELECT name FROM paints WHERE id = (
          CASE WHEN ic.manual_match_kind = 'paint' THEN ic.manual_match_id ELSE
            (SELECT id FROM paints WHERE title_norm = ic.title_norm AND ic.title_norm != '' LIMIT 1)
          END
        )) AS matched_paint_name,
        (SELECT p.image_url FROM paints p
           WHERE p.title_norm = ic.title_norm LIMIT 1) as matched_paint_image,
        (SELECT lm.id FROM loot_map lm WHERE LOWER(lm.name) = LOWER(ic.title) LIMIT 1) as matched_loot_id,
        (SELECT vc.id FROM vehicle_components vc WHERE LOWER(vc.name) = LOWER(ic.title) LIMIT 1) as matched_component_id,
        (SELECT pim.id FROM pledge_item_media pim WHERE pim.title_norm = ic.title_norm LIMIT 1) as matched_item_media_id
      FROM image_captures ic LEFT JOIN vehicles v ON v.id = ic.vehicle_id WHERE ${where} ${alreadyHaveClause} ORDER BY ic.seen_count DESC, ic.last_seen DESC LIMIT ? OFFSET ?`)
      .bind(...params, perPage, offset)
      .all();

    // Get distinct kinds for filter
    const { results: kinds } = await db
      .prepare("SELECT kind, COUNT(*) as cnt FROM image_captures WHERE promoted != -1 GROUP BY kind ORDER BY cnt DESC")
      .all();

    return c.json({ captures: results, total: countRow?.total ?? 0, page, perPage, kinds });
  });

  /**
   * POST /api/admin/image-captures/:id/promote
   * Upload the captured image to CF Images and link it to the vehicle.
   * For Ship captures: resolves slug → vehicle, uploads to CF Images, sets cf_images_id + delivery URLs.
   */
  routes.post("/image-captures/:id/promote", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const db = c.env.DB;

    const cap = await db
      .prepare("SELECT id, url, kind, vehicle_id, vehicle_slug FROM image_captures WHERE id = ?")
      .bind(id)
      .first<{ id: number; url: string; kind: string; vehicle_id: number | null; vehicle_slug: string | null }>();
    if (!cap) return c.json({ error: "Capture not found" }, 404);

    // For Ship captures, upload to CF Images and link to vehicle
    if (cap.kind === "Ship" && cap.vehicle_slug) {
      const token = c.env.CLOUDFLARE_IMAGES_TOKEN;
      const accountHash = c.env.CF_ACCOUNT_HASH;
      const accountId = c.env.CF_ACCOUNT_ID;

      if (!token || !accountHash || !accountId) {
        return c.json({ error: "CF Images credentials not configured" }, 500);
      }

      // Resolve vehicle_id from slug if not already linked
      let vehicleId = cap.vehicle_id;
      if (!vehicleId) {
        const v = await db
          .prepare("SELECT id FROM vehicles WHERE slug = ?")
          .bind(cap.vehicle_slug)
          .first<{ id: number }>();
        if (!v) return c.json({ error: `Vehicle not found: ${cap.vehicle_slug}` }, 404);
        vehicleId = v.id;
      }

      // Ensure vehicle_images row exists
      await db
        .prepare("INSERT OR IGNORE INTO vehicle_images (vehicle_id, updated_at) VALUES (?, datetime('now'))")
        .bind(vehicleId)
        .run();

      // Upload to CF Images
      const cfImagesId = await uploadToCFImages(accountId, token, cap.url, {
        slug: cap.vehicle_slug,
        vehicle_id: String(vehicleId),
        source: "image_capture_promote",
      });

      // Set CF Images delivery URLs on vehicle + vehicle_images
      await setVehicleCFImagesID(db, vehicleId, cfImagesId, accountHash);

      // Mark promoted and link vehicle_id
      await db.batch([
        db.prepare("UPDATE image_captures SET promoted = 1, vehicle_id = ? WHERE id = ?").bind(vehicleId, id),
      ]);

      const deliveryUrl = `https://imagedelivery.net/${accountHash}/${cfImagesId}/medium`;
      return c.json({ ok: true, cf_images_id: cfImagesId, image_url: deliveryUrl });
    }

    // Non-ship captures: just flag as promoted for now
    await db.prepare("UPDATE image_captures SET promoted = 1 WHERE id = ?").bind(id).run();
    return c.json({ ok: true });
  });

  /**
   * Reference-table catalog for the polymorphic match endpoints.
   *
   * Adding a new kind here gives admins:
   *   - search via /api/admin/match-search?kind=X&q=...
   *   - match via PATCH /api/admin/image-captures/:id/match
   *   - the Pick X button in the captures panel
   *
   * `cdnFilter` is included so paint search prioritises rows with
   * imagedelivery.net URLs (the only kind with image_url today).
   */
  const MATCH_KINDS: Record<string, { table: string; cdnColumn: string | null }> = {
    paint: { table: "paints", cdnColumn: "image_url" },
    fps_weapon: { table: "fps_weapons", cdnColumn: null },
    fps_armour: { table: "fps_armour", cdnColumn: null },
    fps_helmet: { table: "fps_helmets", cdnColumn: null },
    vehicle_component: { table: "vehicle_components", cdnColumn: null },
  };

  /**
   * GET /api/admin/match-search?kind=<kind>&q=<term>
   *
   * Generalised reference-table search. `kind` selects the table;
   * `q` matches against name / class_name / slug. Returns up to 50
   * rows with id / name / class_name / slug / has_image where
   * available. Used by the captures panel "Pick <kind>" picker
   * across all supported kinds.
   */
  routes.get("/match-search", async (c) => {
    const kind = (c.req.query("kind") || "").trim();
    const q = (c.req.query("q") || "").trim();
    if (!q) return c.json({ error: "q is required" }, 400);
    const def = MATCH_KINDS[kind];
    if (!def) return c.json({ error: `Unknown kind: ${kind}` }, 400);

    const like = `%${q.toLowerCase()}%`;
    const cdnExpr = def.cdnColumn
      ? `${def.cdnColumn} IS NOT NULL AND ${def.cdnColumn} LIKE 'https://imagedelivery.net%'`
      : `0`;
    const { results } = await c.env.DB
      .prepare(
        `SELECT id, name, class_name, slug,
                ${cdnExpr} AS has_image
           FROM ${def.table}
          WHERE LOWER(name) LIKE ?
             OR LOWER(class_name) LIKE ?
             OR LOWER(slug) LIKE ?
          ORDER BY has_image DESC, name ASC
          LIMIT 50`,
      )
      .bind(like, like, like)
      .all<{ has_image: number }>();
    return c.json({
      results: results.map((r) => ({ ...r, has_image: r.has_image === 1 })),
    });
  });

  /**
   * PATCH /api/admin/image-captures/:id/match
   * Body: { kind: string | null, id: number | null }
   *
   * Generalised manual match. kind=null+id=null clears. Otherwise
   * validates kind is supported and the row exists in the target
   * table before setting (manual_match_kind, manual_match_id).
   */
  routes.patch("/image-captures/:id/match",
    validate("json", z.object({
      kind: z.string().nullable(),
      id: z.number().int().positive().nullable(),
    })),
    async (c) => {
      const captureId = parseInt(c.req.param("id"), 10);
      const { kind, id } = c.req.valid("json");
      const db = c.env.DB;

      const cap = await db
        .prepare("SELECT id FROM image_captures WHERE id = ?")
        .bind(captureId)
        .first();
      if (!cap) return c.json({ error: "Capture not found" }, 404);

      const clearing = kind === null && id === null;
      if (!clearing) {
        if (kind === null || id === null) {
          return c.json({ error: "kind and id must both be set or both null" }, 400);
        }
        const def = MATCH_KINDS[kind];
        if (!def) return c.json({ error: `Unknown kind: ${kind}` }, 400);
        const exists = await db
          .prepare(`SELECT id FROM ${def.table} WHERE id = ?`)
          .bind(id)
          .first();
        if (!exists) return c.json({ error: `${kind} not found` }, 404);
      }

      await db
        .prepare(
          `UPDATE image_captures
              SET manual_match_kind = ?,
                  manual_match_id = ?
            WHERE id = ?`,
        )
        .bind(clearing ? null : kind, clearing ? null : id, captureId)
        .run();
      return c.json({ ok: true });
    },
  );

  /**
   * GET /api/admin/paints/search?q=<term>
   *
   * Master paint list search — used by the captures panel "Pick paint"
   * dialog when an admin is manually linking an unmatched capture to
   * its canonical paint row.
   *
   * Matches `q` against `name`, `class_name`, and `slug` (LIKE %q%).
   * Returns up to 50 rows ordered by image-availability (paints with
   * a CDN image first) then name.
   */
  routes.get("/paints/search", async (c) => {
    const q = (c.req.query("q") || "").trim();
    if (!q) return c.json({ error: "q is required" }, 400);

    const like = `%${q.toLowerCase()}%`;
    const { results } = await c.env.DB
      .prepare(
        `SELECT p.id, p.name, p.class_name, p.slug,
                p.image_url IS NOT NULL AND p.image_url LIKE 'https://imagedelivery.net%' AS has_image,
                (SELECT GROUP_CONCAT(v.name, ', ')
                   FROM paint_vehicles pv
                   JOIN vehicles v ON v.id = pv.vehicle_id
                  WHERE pv.paint_id = p.id) AS vehicle_names
           FROM paints p
          WHERE LOWER(p.name) LIKE ?
             OR LOWER(p.class_name) LIKE ?
             OR LOWER(p.slug) LIKE ?
          ORDER BY has_image DESC, p.name ASC
          LIMIT 50`,
      )
      .bind(like, like, like)
      .all<{ has_image: number }>();
    // Normalise SQLite's 0/1 boolean encoding to JSON booleans for the UI.
    const paints = results.map((p) => ({ ...p, has_image: p.has_image === 1 }));
    return c.json({ paints });
  });

  /**
   * PATCH /api/admin/image-captures/:id/paint-match
   * Body: { paint_id: number | null }
   *
   * Set or clear the manual paint override for a capture. When non-null,
   * the captures filter treats the row as already-covered and drops it
   * out of the default unseen view.
   *
   * paint_id=null clears the link (admin un-matched). 404s on unknown
   * paint_id so we don't end up with dangling references.
   */
  routes.patch("/image-captures/:id/paint-match",
    validate("json", z.object({
      paint_id: z.number().int().positive().nullable(),
    })),
    async (c) => {
      const id = parseInt(c.req.param("id"), 10);
      const { paint_id } = c.req.valid("json");
      const db = c.env.DB;

      const cap = await db
        .prepare("SELECT id FROM image_captures WHERE id = ?")
        .bind(id)
        .first();
      if (!cap) return c.json({ error: "Capture not found" }, 404);

      if (paint_id !== null) {
        const paint = await db
          .prepare("SELECT id FROM paints WHERE id = ?")
          .bind(paint_id)
          .first();
        if (!paint) return c.json({ error: "Paint not found" }, 404);
      }

      // Write to both legacy manual_paint_id (for any older code paths
      // still reading it) and the new polymorphic columns. Both get
      // cleared together when paint_id is null.
      await db
        .prepare(
          `UPDATE image_captures
              SET manual_paint_id = ?,
                  manual_match_kind = CASE WHEN ? IS NULL THEN NULL ELSE 'paint' END,
                  manual_match_id = ?
            WHERE id = ?`,
        )
        .bind(paint_id, paint_id, paint_id, id)
        .run();
      return c.json({ ok: true });
    },
  );

  /**
   * DELETE /api/admin/image-captures/:id
   * Decline an image — set promoted = -1 (permanently hidden, never shown again).
   */
  routes.delete("/image-captures/:id", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const db = c.env.DB;
    await db.prepare("UPDATE image_captures SET promoted = -1 WHERE id = ?").bind(id).run();
    return c.json({ ok: true });
  });

  // ── Pledge item media (cross-user fallback library) ───────────────
  //
  // pledge_item_media holds one canonical CF-hosted image per item
  // title. /api/hangar uses it as a fallback when the extension's
  // scrape didn't capture an image_url for that title.

  /**
   * GET /api/admin/item-media
   * Lists every entry with reference counts so admins can prioritise
   * which titles to seed with images. `gap` = how many user_pledge_items
   * rows with this title are missing image_url right now.
   */
  routes.get("/item-media", async (c) => {
    const db = c.env.DB;
    const { results } = await db
      .prepare(
        `SELECT
           pim.id, pim.title, pim.title_lower, pim.cf_image_id, pim.cf_image_url,
           pim.source_capture_id, pim.uploaded_by, pim.uploaded_at, pim.notes,
           (SELECT COUNT(*) FROM user_pledge_items upi
              WHERE LOWER(upi.title) = pim.title_lower) AS reference_count
         FROM pledge_item_media pim
         ORDER BY pim.uploaded_at DESC`,
      )
      .all();
    return c.json({ items: results });
  });

  /**
   * GET /api/admin/item-media/gap-titles
   * Top titles in user_pledge_items that have no image_url AND no
   * pledge_item_media entry yet. Sorted by row count desc — these are
   * the highest-impact items to seed.
   */
  routes.get("/item-media/gap-titles", async (c) => {
    const db = c.env.DB;
    const { results } = await db
      .prepare(
        `SELECT upi.title, COUNT(*) AS missing_count, upi.kind
         FROM user_pledge_items upi
         LEFT JOIN pledge_item_media pim ON pim.title_lower = LOWER(upi.title)
         WHERE (upi.image_url IS NULL OR upi.image_url = '')
           AND pim.id IS NULL
         GROUP BY upi.title, upi.kind
         ORDER BY missing_count DESC
         LIMIT 100`,
      )
      .all();
    return c.json({ titles: results });
  });

  /**
   * POST /api/admin/item-media
   * Body: { title, source_url, notes? }
   * CF-uploads the source URL and inserts (or replaces) the
   * pledge_item_media row keyed by lowercase title.
   */
  routes.post("/item-media",
    validate("json", z.object({
      title: z.string().trim().min(1).max(255),
      source_url: z.string().url(),
      notes: z.string().max(1000).optional(),
    })),
    async (c) => {
      const { title, source_url, notes } = c.req.valid("json");
      const token = c.env.CLOUDFLARE_IMAGES_TOKEN;
      const accountHash = c.env.CF_ACCOUNT_HASH;
      const accountId = c.env.CF_ACCOUNT_ID;
      if (!token || !accountHash || !accountId) {
        return c.json({ error: "CF Images credentials not configured" }, 500);
      }

      const cfImagesId = await uploadToCFImages(accountId, token, source_url, {
        title,
        source: "item_media_admin_upload",
      });
      const cfImageUrl = `https://imagedelivery.net/${accountHash}/${cfImagesId}/public`;
      const userId = c.get("user")?.id ?? null;
      const titleLower = title.toLowerCase();
      const titleNorm = normaliseTitle(title);

      // Upsert by title_lower so re-uploading the same title replaces
      // (admin can swap a bad image for a better one).
      await c.env.DB
        .prepare(
          `INSERT INTO pledge_item_media (title, title_lower, title_norm, cf_image_id, cf_image_url, uploaded_by, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(title_lower) DO UPDATE SET
             title = excluded.title,
             title_norm = excluded.title_norm,
             cf_image_id = excluded.cf_image_id,
             cf_image_url = excluded.cf_image_url,
             uploaded_by = excluded.uploaded_by,
             uploaded_at = datetime('now'),
             notes = excluded.notes`,
        )
        .bind(title, titleLower, titleNorm, cfImagesId, cfImageUrl, userId, notes ?? null)
        .run();

      return c.json({ ok: true, cf_image_id: cfImagesId, cf_image_url: cfImageUrl });
    },
  );

  /**
   * POST /api/admin/image-captures/:id/promote-to-item-media
   * Convenience: take an existing image_captures row and promote its
   * URL into pledge_item_media for the same title. Skips re-upload
   * when the capture URL is already on imagedelivery.net.
   */
  routes.post("/image-captures/:id/promote-to-item-media", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const db = c.env.DB;
    const cap = await db
      .prepare("SELECT id, url, title FROM image_captures WHERE id = ?")
      .bind(id)
      .first<{ id: number; url: string; title: string | null }>();
    if (!cap) return c.json({ error: "Capture not found" }, 404);
    if (!cap.title || cap.title.trim() === "") {
      return c.json({ error: "Capture has no title — cannot key item media" }, 400);
    }

    const token = c.env.CLOUDFLARE_IMAGES_TOKEN;
    const accountHash = c.env.CF_ACCOUNT_HASH;
    const accountId = c.env.CF_ACCOUNT_ID;
    if (!token || !accountHash || !accountId) {
      return c.json({ error: "CF Images credentials not configured" }, 500);
    }

    const cfImagesId = await uploadToCFImages(accountId, token, cap.url, {
      title: cap.title,
      source: "item_media_promoted_capture",
      capture_id: String(cap.id),
    });
    const cfImageUrl = `https://imagedelivery.net/${accountHash}/${cfImagesId}/public`;
    const userId = c.get("user")?.id ?? null;
    const titleLower = cap.title.toLowerCase();
    const titleNorm = normaliseTitle(cap.title);

    await db.batch([
      db
        .prepare(
          `INSERT INTO pledge_item_media (title, title_lower, title_norm, cf_image_id, cf_image_url, source_capture_id, uploaded_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(title_lower) DO UPDATE SET
             title = excluded.title,
             title_norm = excluded.title_norm,
             cf_image_id = excluded.cf_image_id,
             cf_image_url = excluded.cf_image_url,
             source_capture_id = excluded.source_capture_id,
             uploaded_by = excluded.uploaded_by,
             uploaded_at = datetime('now')`,
        )
        .bind(cap.title, titleLower, titleNorm, cfImagesId, cfImageUrl, cap.id, userId),
      db.prepare("UPDATE image_captures SET promoted = 1 WHERE id = ?").bind(id),
    ]);

    return c.json({ ok: true, cf_image_id: cfImagesId, cf_image_url: cfImageUrl });
  });

  /**
   * DELETE /api/admin/item-media/:id
   * Removes the lookup entry. CF Images object stays — orphans get
   * cleaned up by a separate sweeper, not this endpoint.
   */
  routes.delete("/item-media/:id",
    validate("param", z.object({ id: z.coerce.number().int().positive() })),
    async (c) => {
      const { id } = c.req.valid("param");
      await c.env.DB.prepare("DELETE FROM pledge_item_media WHERE id = ?").bind(id).run();
      return c.json({ ok: true });
    },
  );

  return routes;
}
