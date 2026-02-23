import { Hono } from "hono";
import type { HonoEnv } from "../lib/types";
import { sendEmail } from "../lib/email";

/**
 * /api/account/* — User account management (GDPR compliance)
 */
export function accountRoutes() {
  const routes = new Hono<HonoEnv>();

  // GET /api/account/export — Download all user data as JSON
  routes.get("/export", async (c) => {
    const user = c.get("user")!;
    const db = c.env.DB;

    const data = await collectUserData(db, user);

    return new Response(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="scbridge-data-export-${new Date().toISOString().split("T")[0]}.json"`,
      },
    });
  });

  // POST /api/account/export-email — Email data export to user
  routes.post("/export-email", async (c) => {
    const user = c.get("user")!;
    const db = c.env.DB;

    const data = await collectUserData(db, user);
    const html = buildExportEmailHtml(data);

    await sendEmail(
      c.env,
      user.email,
      "SC Bridge — Your Data Export",
      html,
    );

    return c.json({ message: "Export emailed to your registered address" });
  });

  // DELETE /api/account — Self-service account deletion
  routes.delete("/", async (c) => {
    const user = c.get("user")!;
    const body = await c.req.json<{ confirmation?: string }>().catch(() => ({}));

    if (body.confirmation !== "DELETE") {
      return c.json({ error: "You must send { \"confirmation\": \"DELETE\" } to confirm account deletion" }, 400);
    }

    const db = c.env.DB;

    // 1. Delete from app tables (no FK constraints, order doesn't matter)
    await db.prepare("DELETE FROM ai_analyses WHERE user_id = ?").bind(user.id).run();
    await db.prepare("DELETE FROM user_settings WHERE user_id = ?").bind(user.id).run();
    await db.prepare("DELETE FROM user_llm_configs WHERE user_id = ?").bind(user.id).run();
    await db.prepare("DELETE FROM user_paints WHERE user_id = ?").bind(user.id).run();
    await db.prepare("DELETE FROM user_fleet WHERE user_id = ?").bind(user.id).run();

    // 2. Delete from Better Auth tables in FK order
    await db.prepare("DELETE FROM passkey WHERE userId = ?").bind(user.id).run().catch(() => {});
    await db.prepare("DELETE FROM two_factor WHERE userId = ?").bind(user.id).run().catch(() => {});
    await db.prepare("DELETE FROM verification WHERE identifier = ?").bind(user.email).run().catch(() => {});
    await db.prepare("DELETE FROM session WHERE userId = ?").bind(user.id).run();
    await db.prepare("DELETE FROM account WHERE userId = ?").bind(user.id).run();
    await db.prepare("DELETE FROM user WHERE id = ?").bind(user.id).run();

    return c.json({ message: "Account deleted" });
  });

  return routes;
}

async function collectUserData(
  db: D1Database,
  user: { id: string; name: string; email: string; role?: string | null },
) {
  const fleet = await db
    .prepare(
      `SELECT uf.id, uf.vehicle_id, uf.insurance_type_id, uf.warbond, uf.is_loaner,
        uf.pledge_id, uf.pledge_name, uf.pledge_cost, uf.pledge_date, uf.custom_name,
        uf.equipped_paint_id, uf.imported_at,
        v.name as vehicle_name, v.slug as vehicle_slug,
        m.name as manufacturer_name,
        it.label as insurance_label, it.duration_months, it.is_lifetime
      FROM user_fleet uf
      JOIN vehicles v ON v.id = uf.vehicle_id
      LEFT JOIN manufacturers m ON m.id = v.manufacturer_id
      LEFT JOIN insurance_types it ON it.id = uf.insurance_type_id
      WHERE uf.user_id = ?
      ORDER BY v.name`,
    )
    .bind(user.id)
    .all();

  const paints = await db
    .prepare(
      `SELECT up.id, up.paint_id, p.name as paint_name
      FROM user_paints up
      LEFT JOIN paints p ON p.id = up.paint_id
      WHERE up.user_id = ?`,
    )
    .bind(user.id)
    .all();

  const llmConfigs = await db
    .prepare(
      `SELECT id, provider, model, created_at, updated_at
      FROM user_llm_configs WHERE user_id = ?`,
    )
    .bind(user.id)
    .all();

  const settings = await db
    .prepare("SELECT id, key, value FROM user_settings WHERE user_id = ?")
    .bind(user.id)
    .all();

  const analyses = await db
    .prepare(
      `SELECT id, created_at, provider, model, vehicle_count, analysis
      FROM ai_analyses WHERE user_id = ? ORDER BY created_at DESC`,
    )
    .bind(user.id)
    .all();

  // Get Better Auth user record for account metadata
  const authUser = await db
    .prepare("SELECT id, email, name, role, createdAt FROM user WHERE id = ?")
    .bind(user.id)
    .first();

  return {
    exported_at: new Date().toISOString(),
    account: authUser || { id: user.id, email: user.email, name: user.name, role: user.role },
    fleet: fleet.results,
    paints: paints.results,
    llm_configs: llmConfigs.results.map((cfg: Record<string, unknown>) => ({
      ...cfg,
      api_key: "[stored — manage in app]",
    })),
    settings: settings.results,
    analyses: analyses.results,
  };
}

function buildExportEmailHtml(data: Record<string, unknown>): string {
  const account = data.account as Record<string, unknown>;
  const fleet = data.fleet as Record<string, unknown>[];
  const paints = data.paints as Record<string, unknown>[];
  const analyses = data.analyses as Record<string, unknown>[];

  return `
<!DOCTYPE html>
<html>
<head><style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #e0e0e0; background: #1a1a2e; margin: 0; padding: 20px; }
  .container { max-width: 600px; margin: 0 auto; background: #16213e; border-radius: 8px; padding: 30px; }
  h1 { color: #00d4ff; font-size: 20px; margin-top: 0; }
  h2 { color: #00d4ff; font-size: 16px; border-bottom: 1px solid #2a2a4a; padding-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
  th { text-align: left; padding: 6px 8px; background: #1a1a2e; color: #aaa; font-size: 11px; text-transform: uppercase; }
  td { padding: 6px 8px; border-bottom: 1px solid #2a2a4a; }
  .footer { font-size: 12px; color: #666; margin-top: 20px; padding-top: 16px; border-top: 1px solid #2a2a4a; }
</style></head>
<body>
<div class="container">
  <h1>SC Bridge — Data Export</h1>
  <p style="color:#aaa;font-size:13px;">Exported on ${data.exported_at}</p>

  <h2>Account</h2>
  <table>
    <tr><td style="color:#aaa;">Email</td><td>${account.email || "—"}</td></tr>
    <tr><td style="color:#aaa;">Name</td><td>${account.name || "—"}</td></tr>
    <tr><td style="color:#aaa;">Role</td><td>${account.role || "user"}</td></tr>
    <tr><td style="color:#aaa;">Created</td><td>${account.createdAt || "—"}</td></tr>
  </table>

  <h2>Fleet (${fleet.length} ships)</h2>
  ${
    fleet.length > 0
      ? `<table>
    <tr><th>Ship</th><th>Pledge</th><th>Insurance</th></tr>
    ${fleet
      .map(
        (f) =>
          `<tr><td>${f.vehicle_name}${f.custom_name ? ` (${f.custom_name})` : ""}</td><td>${f.pledge_name || "—"}</td><td>${f.insurance_label || "—"}</td></tr>`,
      )
      .join("")}
  </table>`
      : "<p style='color:#666;'>No fleet data</p>"
  }

  <h2>Paints (${paints.length})</h2>
  ${
    paints.length > 0
      ? `<p style="font-size:13px;">${paints.map((p) => p.paint_name || `Paint #${p.paint_id}`).join(", ")}</p>`
      : "<p style='color:#666;'>No paints</p>"
  }

  <h2>AI Analyses (${analyses.length})</h2>
  ${
    analyses.length > 0
      ? `<p style="font-size:13px;">${analyses.length} analysis report(s) — download the full JSON export for details.</p>`
      : "<p style='color:#666;'>No analyses</p>"
  }

  <div class="footer">
    <p>This is your complete SC Bridge data export per GDPR right of access.</p>
    <p>For questions, contact ops@scbridge.app</p>
  </div>
</div>
</body>
</html>`;
}
