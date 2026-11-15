import { Hono } from "hono";
import { z } from "zod";
import { getAuthUser, type HonoEnv } from "../lib/types";
import { validate, IntIdParam } from "../lib/validation";
import {
  MAX_RSI_ACCOUNTS,
  canAddAccount,
  deleteRsiAccount,
  multiAccountEnabled,
} from "../lib/rsi-accounts";

/**
 * /api/rsi-accounts/* — list, rename, set primary and delete the RSI accounts
 * held by one SC Bridge sign-in.
 */
export function rsiAccountRoutes() {
  const routes = new Hono<HonoEnv>();

  // GET /api/rsi-accounts
  routes.get("/", async (c) => {
    const userID = getAuthUser(c).id;
    const { results } = await c.env.DB
      .prepare(
        `SELECT a.id, a.label, a.rsi_handle, a.display_name, a.is_primary, a.is_placeholder,
                a.verified_at, a.synced_at,
                (SELECT COUNT(*) FROM user_fleet uf WHERE uf.rsi_account_id = a.id) AS ship_count,
                (SELECT COUNT(*) FROM user_pledges up WHERE up.rsi_account_id = a.id) AS pledge_count
         FROM user_rsi_accounts a
         WHERE a.user_id = ?
         ORDER BY a.id`,
      )
      .bind(userID)
      .all<{
        id: number;
        label: string | null;
        rsi_handle: string | null;
        display_name: string | null;
        is_primary: number;
        is_placeholder: number;
        verified_at: string | null;
        synced_at: string | null;
        ship_count: number;
        pledge_count: number;
      }>();

    const accounts = results.map((a) => ({
      id: a.id,
      label: a.label,
      rsi_handle: a.rsi_handle,
      display_name: a.display_name,
      is_primary: !!a.is_primary,
      is_placeholder: !!a.is_placeholder,
      verified: a.verified_at !== null && !a.is_placeholder,
      synced_at: a.synced_at,
      ship_count: a.ship_count,
      pledge_count: a.pledge_count,
    }));

    return c.json({
      accounts,
      max: MAX_RSI_ACCOUNTS,
      can_add: canAddAccount({ enabled: multiAccountEnabled(c.env), accountCount: accounts.length }),
    });
  });

  // PATCH /api/rsi-accounts/:id
  routes.patch(
    "/:id",
    validate("param", IntIdParam),
    validate(
      "json",
      z.object({
        label: z.string().trim().max(40, { message: "Label must be 40 characters or fewer" }).optional(),
        is_primary: z.literal(true, { message: "is_primary can only be set to true" }).optional(),
      }),
    ),
    async (c) => {
      const db = c.env.DB;
      const userID = getAuthUser(c).id;
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      if (body.label === undefined && body.is_primary === undefined) {
        return c.json({ error: "Nothing to update" }, 400);
      }

      const owned = await db
        .prepare("SELECT id FROM user_rsi_accounts WHERE id = ? AND user_id = ?")
        .bind(id, userID)
        .first();
      if (!owned) return c.json({ error: "RSI account not found" }, 404);

      const statements: D1PreparedStatement[] = [];
      if (body.is_primary) {
        // Clear first: the partial unique index allows only one primary per user.
        statements.push(
          db.prepare("UPDATE user_rsi_accounts SET is_primary = 0 WHERE user_id = ? AND id != ?").bind(userID, id),
          db.prepare("UPDATE user_rsi_accounts SET is_primary = 1 WHERE id = ? AND user_id = ?").bind(id, userID),
        );
      }
      if (body.label !== undefined) {
        const label = body.label;
        statements.push(
          db
            .prepare("UPDATE user_rsi_accounts SET label = ? WHERE id = ? AND user_id = ?")
            .bind(label === "" ? null : label, id, userID),
        );
      }
      await db.batch(statements);

      return c.json({ ok: true });
    },
  );

  // DELETE /api/rsi-accounts/:id  (body {} — browsers need Content-Length)
  routes.delete("/:id", validate("param", IntIdParam), async (c) => {
    const userID = getAuthUser(c).id;
    const { id } = c.req.valid("param");
    try {
      await deleteRsiAccount(c.env.DB, userID, id);
    } catch (err) {
      if (err instanceof Error && err.message === "RSI account not found") {
        return c.json({ error: "RSI account not found" }, 404);
      }
      throw err;
    }
    return c.json({ ok: true });
  });

  return routes;
}
