import { Hono } from "hono";
import type { HonoEnv } from "../lib/types";
import { getGameVersions } from "../db/queries";

/**
 * /api/patches — Public list of available game versions
 */
export function patchRoutes() {
  const app = new Hono<HonoEnv>();

  // GET /api/patches — list all game versions (public)
  app.get("/", async (c) => {
    const versions = await getGameVersions(c.env.DB);
    return c.json(versions);
  });

  return app;
}
