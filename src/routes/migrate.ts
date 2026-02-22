import { Hono } from "hono";
import type { HonoEnv } from "../lib/types";
import { createAuth } from "../lib/auth";

export function migrateRoutes() {
  const routes = new Hono<HonoEnv>();

  // POST /api/migrate — Run Better Auth database migrations
  routes.post("/", async (c) => {
    // Only allow if no users exist (initial setup) or if user is super_admin
    const user = c.get("user");
    const db = c.env.DB;

    const userCount = await db
      .prepare("SELECT COUNT(*) as count FROM user")
      .first<{ count: number }>()
      .catch(() => null);

    if (userCount && userCount.count > 0 && (!user || user.role !== "super_admin")) {
      return c.json({ error: "Forbidden — super_admin required" }, 403);
    }

    const auth = createAuth(c.env);
    const { toBeCreated, toBeAdded, runMigrations } = await (
      await import("better-auth/db")
    ).getMigrations(auth.options);

    if (toBeCreated.length === 0 && toBeAdded.length === 0) {
      return c.json({ message: "No migrations needed" });
    }

    await runMigrations();
    return c.json({
      tablesCreated: toBeCreated.map((t) => t.table),
      columnsAdded: toBeAdded.map((t) => t.table),
    });
  });

  return routes;
}
