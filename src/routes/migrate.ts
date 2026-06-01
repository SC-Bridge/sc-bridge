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
    // better-auth v1.6 moved the `getMigrations` export from `better-auth/db`
    // to a dedicated `better-auth/db/migration` subpath. Pre-v1.6 callers
    // imported from `better-auth/db`.
    const { getMigrations } = await import("better-auth/db/migration");
    const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(
      auth.options,
    );

    if (toBeCreated.length === 0 && toBeAdded.length === 0) {
      return c.json({ ok: true, message: "No migrations needed" });
    }

    await runMigrations();
    return c.json({
      tablesCreated: toBeCreated.map((t: { table: string }) => t.table),
      columnsAdded: toBeAdded.map((t: { table: string }) => t.table),
    });
  });

  return routes;
}
