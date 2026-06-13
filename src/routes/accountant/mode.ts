import { Hono } from "hono";
import { z } from "zod";
import { getAuthUser, type HonoEnv } from "../../lib/types";
import { validate } from "../../lib/validation";
import { getActiveOrgId, memberRole } from "../../lib/accountant/scope";

/**
 * /api/accountant/mode — the Ledger Mode switch (design: accountant-m4-design.md §5.4).
 * Active context is the `activeLedgerOrgId` user setting: null = private, else a
 * corp the user is a member of. Reads/deliberate writes follow it; ingestion never
 * does (D8). effectiveTier = the corp's accountant_tier in corp mode, else the
 * user's personal accountantTier.
 */
async function effectiveTier(db: D1Database, userId: string, orgId: string | null): Promise<string> {
  if (orgId) {
    const o = await db
      .prepare("SELECT accountant_tier FROM organization WHERE id = ?")
      .bind(orgId)
      .first<{ accountant_tier: string }>();
    return o?.accountant_tier ?? "easy";
  }
  const r = await db
    .prepare("SELECT value FROM user_settings WHERE user_id = ? AND key = 'accountantTier'")
    .bind(userId)
    .first<{ value: string }>();
  return r?.value ?? "easy";
}

export function modeRoutes() {
  const routes = new Hono<HonoEnv>();

  // GET /api/accountant/mode — current context + the switcher's data.
  routes.get("/", async (c) => {
    const db = c.env.DB;
    const userId = getAuthUser(c).id;
    const orgId = await getActiveOrgId(db, userId);
    const orgs = await db
      .prepare(
        `SELECT o.id, o.slug, o.name, m.role
         FROM member m JOIN organization o ON o.id = m.organizationId
         WHERE m.userId = ? ORDER BY o.name`,
      )
      .bind(userId)
      .all<{ id: string; slug: string; name: string; role: string }>();
    return c.json({ orgId, effectiveTier: await effectiveTier(db, userId, orgId), orgs: orgs.results });
  });

  // PUT /api/accountant/mode — set the active context. null → private.
  routes.put("/", validate("json", z.object({ orgId: z.string().nullable() }).strict()), async (c) => {
    const db = c.env.DB;
    const userId = getAuthUser(c).id;
    const { orgId } = c.req.valid("json");

    if (orgId === null) {
      await db
        .prepare("DELETE FROM user_settings WHERE user_id = ? AND key = 'activeLedgerOrgId'")
        .bind(userId)
        .run();
      return c.json({ ok: true, orgId: null });
    }
    // Must be a member to switch into a corp context.
    if (!(await memberRole(db, orgId, userId))) {
      return c.json({ error: "Not a member of this organisation" }, 403);
    }
    await db
      .prepare(
        `INSERT INTO user_settings (user_id, key, value) VALUES (?, 'activeLedgerOrgId', ?)
         ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value`,
      )
      .bind(userId, orgId)
      .run();
    return c.json({ ok: true, orgId, effectiveTier: await effectiveTier(db, userId, orgId) });
  });

  return routes;
}
