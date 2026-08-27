import { Hono } from "hono";
import { z } from "zod";
import type { HonoEnv } from "../lib/types";
import { validate } from "../lib/validation";
import { cachedJson } from "../lib/cache";
import { loadPublicFleet, publicFleetCacheKey } from "../lib/publicFleet";

const HandleParam = z.object({
  handle: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/, "Invalid handle"),
});

export function publicFleetRoutes() {
  const routes = new Hono<HonoEnv>();

  routes.get("/:handle/fleet", validate("param", HandleParam), async (c) => {
    const { handle } = c.req.valid("param");
    return cachedJson(c, publicFleetCacheKey(handle), () => loadPublicFleet(c.env.DB, handle));
  });

  return routes;
}
