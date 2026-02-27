import { Hono } from "hono";
import type { HonoEnv } from "../lib/types";
import { uploadToCFImages } from "../lib/cfImages";
import { getVehiclesNeedingCFUpload, setVehicleCFImagesID } from "../db/queries";

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
  routes.post("/images/bulk-upload", async (c) => {
    const token = c.env.CLOUDFLARE_IMAGES_TOKEN;
    const accountHash = c.env.CF_ACCOUNT_HASH;
    const accountId = c.env.CF_ACCOUNT_ID;

    if (!token || !accountHash || !accountId) {
      return c.json(
        { error: "CLOUDFLARE_IMAGES_TOKEN, CF_ACCOUNT_HASH, and CF_ACCOUNT_ID must be set" },
        500,
      );
    }

    const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 100);
    const offset = parseInt(c.req.query("offset") ?? "0", 10);

    const vehicles = await getVehiclesNeedingCFUpload(c.env.DB, limit, offset);

    let succeeded = 0;
    let failed = 0;
    const errors: { slug: string; error: string }[] = [];

    for (const v of vehicles) {
      try {
        const cfImagesId = await uploadToCFImages(accountId, token, v.best_image_url, {
          slug: v.slug,
          vehicle_id: String(v.vehicle_id),
        });
        await setVehicleCFImagesID(c.env.DB, v.vehicle_id, cfImagesId, accountHash);
        succeeded++;
      } catch (err) {
        failed++;
        errors.push({ slug: v.slug, error: String(err) });
        console.error(`[admin/images] CF upload failed for ${v.slug}:`, err);
      }
    }

    return c.json({
      processed: vehicles.length,
      succeeded,
      failed,
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
  routes.post("/images/upload", async (c) => {
    const token = c.env.CLOUDFLARE_IMAGES_TOKEN;
    const accountHash = c.env.CF_ACCOUNT_HASH;
    const accountId = c.env.CF_ACCOUNT_ID;

    if (!token || !accountHash || !accountId) {
      return c.json(
        { error: "CLOUDFLARE_IMAGES_TOKEN, CF_ACCOUNT_HASH, and CF_ACCOUNT_ID must be set" },
        500,
      );
    }

    const body = await c.req.json<{ slug?: string; imageUrl?: string }>();
    const { slug, imageUrl } = body;

    if (!slug || !imageUrl) {
      return c.json({ error: "slug and imageUrl are required" }, 400);
    }

    if (!imageUrl.startsWith("http")) {
      return c.json({ error: "imageUrl must be an absolute URL" }, 400);
    }

    const vehicleRow = await c.env.DB
      .prepare("SELECT id FROM vehicles WHERE slug = ?")
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

  return routes;
}
