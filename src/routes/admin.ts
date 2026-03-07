import { Hono } from "hono";
import { z } from "zod";
import type { HonoEnv } from "../lib/types";
import { uploadToCFImages } from "../lib/cfImages";
import { getVehiclesNeedingCFUpload, setVehicleCFImagesID } from "../db/queries";
import { concurrentMap } from "../lib/utils";
import { validate } from "../lib/validation";
import { VEHICLE_VERSION_JOIN } from "../lib/constants";

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
      .prepare(`SELECT v.id FROM vehicles v ${VEHICLE_VERSION_JOIN} WHERE v.slug = ?`)
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

    return c.json({ code: version.code, channel: version.channel, is_default: 1 });
  });

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

  return routes;
}
