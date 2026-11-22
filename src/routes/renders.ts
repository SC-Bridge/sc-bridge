import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../lib/types";
import { getRendersForItem } from "../db/queries";
import { cachedJson, cacheSlug } from "../lib/cache";
import { RenderKindSchema } from "../lib/renders";
import { validate } from "../lib/validation";

// item_renders keys are lower-case class_names (armour sets: comma-joined).
// 400 characters keeps the KV cache key under its 512-byte limit.
const RenderParams = z.object({
  kind: RenderKindSchema,
  itemKey: z.string().regex(/^[a-z0-9_,.-]+$/).max(400),
});

/**
 * /api/renders/* — published game renders (public, no auth)
 */
export function renderRoutes() {
  const routes = new Hono<{ Bindings: Env }>();

  // GET /api/renders/:kind/:itemKey — every render variant of one item.
  // An item with no renders is a 404 and is not cached, so unknown keys never
  // write to KV.
  routes.get("/:kind/:itemKey", validate("param", RenderParams), async (c) => {
    const { kind, itemKey } = c.req.valid("param");
    const db = c.env.DB;
    return cachedJson(c, `renders:item:${cacheSlug(kind)}:${cacheSlug(itemKey)}`, async () => {
      const variants = await getRendersForItem(db, itemKey);
      return variants.length > 0 ? { variants } : null;
    });
  });

  return routes;
}
