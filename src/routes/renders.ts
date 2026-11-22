import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../lib/types";
import { getRendersForItem } from "../db/queries";
import { cachedJson, cacheSlug } from "../lib/cache";
import { RenderKindSchema } from "../lib/renders";
import { validate } from "../lib/validation";

const RenderParams = z.object({
  kind: RenderKindSchema,
  itemKey: z.string().min(1).max(200),
});

/**
 * /api/renders/* — published game renders (public, no auth)
 */
export function renderRoutes() {
  const routes = new Hono<{ Bindings: Env }>();

  // GET /api/renders/:kind/:itemKey — every render variant of one item
  routes.get("/:kind/:itemKey", validate("param", RenderParams), async (c) => {
    const { kind, itemKey } = c.req.valid("param");
    const db = c.env.DB;
    return cachedJson(c, `renders:item:${cacheSlug(kind)}:${cacheSlug(itemKey)}`, async () => ({
      variants: await getRendersForItem(db, itemKey),
    }));
  });

  return routes;
}
