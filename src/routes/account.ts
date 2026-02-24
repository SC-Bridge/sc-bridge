import { Hono } from "hono";
import type { Env, HonoEnv } from "../lib/types";
import { sendEmail } from "../lib/email";
import { escapeHtml } from "../lib/utils";
import { hashPassword } from "../lib/password";
import { logUserChange } from "../lib/change-history";
import { fetchRsiProfile } from "../lib/rsi";

/** Returns the list of social OAuth provider IDs that have CLIENT_ID configured */
function getConfiguredProviders(env: Env): string[] {
  const checks: [string, string | undefined][] = [
    ["google", env.GOOGLE_CLIENT_ID],
    ["github", env.GITHUB_OAUTH_CLIENT_ID],
    ["discord", env.DISCORD_CLIENT_ID],
    ["twitch", env.TWITCH_CLIENT_ID],
  ];
  return checks.filter(([, val]) => !!val).map(([id]) => id);
}

/**
 * /api/account/* — User account management (GDPR compliance)
 */
export function accountRoutes() {
  const routes = new Hono<HonoEnv>();

  // GET /api/account/providers — list linked auth providers for current user
  routes.get("/providers", async (c) => {
    const user = c.get("user")!;
    const db = c.env.DB;

    const accounts = await db
      .prepare("SELECT providerId FROM account WHERE userId = ?")
      .bind(user.id)
      .all();

    const providers = accounts.results.map(
      (a: Record<string, unknown>) => a.providerId as string,
    );

    return c.json({
      providers,
      hasPassword: providers.includes("credential"),
      availableProviders: getConfiguredProviders(c.env),
    });
  });

  // POST /api/account/unlink-provider — remove a linked OAuth provider
  routes.post("/unlink-provider", async (c) => {
    const user = c.get("user")!;
    const db = c.env.DB;

    const body = await c.req
      .json<{ providerId?: string }>()
      .catch(() => ({ providerId: undefined }));

    if (!body.providerId) {
      return c.json({ error: "providerId is required" }, 400);
    }

    if (body.providerId === "credential") {
      return c.json(
        { error: "Cannot unlink password credentials. Use Change Password instead." },
        400,
      );
    }

    // Count how many auth methods this user has
    const countResult = await db
      .prepare("SELECT COUNT(*) as cnt FROM account WHERE userId = ?")
      .bind(user.id)
      .first<{ cnt: number }>();

    if (!countResult || countResult.cnt < 2) {
      return c.json(
        { error: "Cannot unlink your only authentication method" },
        400,
      );
    }

    // Verify the provider actually exists for this user
    const existing = await db
      .prepare(
        "SELECT id FROM account WHERE userId = ? AND providerId = ?",
      )
      .bind(user.id, body.providerId)
      .first();

    if (!existing) {
      return c.json({ error: "Provider not linked to your account" }, 404);
    }

    await db
      .prepare("DELETE FROM account WHERE userId = ? AND providerId = ?")
      .bind(user.id, body.providerId)
      .run();

    await logUserChange(db, user.id, "provider_unlinked", {
      providerId: body.providerId,
      oldValue: body.providerId,
      ipAddress: c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for"),
    });

    return c.json({ status: true });
  });

  // POST /api/account/set-password — OAuth-only users: set initial password
  routes.post("/set-password", async (c) => {
    const user = c.get("user")!;
    const db = c.env.DB;

    const body = await c.req
      .json<{ newPassword?: string }>()
      .catch(() => ({ newPassword: undefined }));

    if (!body.newPassword || body.newPassword.length < 8) {
      return c.json(
        { error: "Password must be at least 8 characters" },
        400,
      );
    }
    if (body.newPassword.length > 128) {
      return c.json({ error: "Password is too long" }, 400);
    }

    // Check if user already has a credential (password) account
    const existing = await db
      .prepare(
        "SELECT id FROM account WHERE userId = ? AND providerId = 'credential'",
      )
      .bind(user.id)
      .first();

    if (existing) {
      return c.json(
        { error: "You already have a password. Use Change Password instead." },
        400,
      );
    }

    const hashed = await hashPassword(body.newPassword);

    await db
      .prepare(
        "INSERT INTO account (id, userId, accountId, providerId, password, createdAt, updatedAt) VALUES (?, ?, ?, 'credential', ?, datetime('now'), datetime('now'))",
      )
      .bind(crypto.randomUUID(), user.id, user.id, hashed)
      .run();

    await logUserChange(db, user.id, "password_set", {
      providerId: "credential",
      newValue: "[set]",
      ipAddress: c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for"),
    });

    return c.json({ status: true });
  });

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

  // GET /api/account/rsi-profile — return cached RSI profile for current user
  routes.get("/rsi-profile", async (c) => {
    const user = c.get("user")!;
    const row = await c.env.DB
      .prepare("SELECT * FROM user_rsi_profile WHERE user_id = ?")
      .bind(user.id)
      .first();
    if (!row) return c.json({ profile: null });
    const r = row as Record<string, unknown>;
    return c.json({
      profile: {
        handle: r.handle,
        display_name: r.display_name,
        citizen_record: r.citizen_record,
        enlisted_at: r.enlisted_at,
        avatar_url: r.avatar_url,
        main_org_slug: r.main_org_slug,
        orgs: r.orgs_json ? JSON.parse(r.orgs_json as string) : [],
        fetched_at: r.fetched_at,
      },
    });
  });

  // POST /api/account/rsi-sync — fetch + cache RSI citizen profile
  // Rate-limited: one sync per 10 minutes per user.
  routes.post("/rsi-sync", async (c) => {
    const user = c.get("user")!;
    const db = c.env.DB;

    const body = await c.req.json<{ handle?: string }>().catch(() => ({ handle: undefined }));
    if (!body.handle?.trim()) {
      return c.json({ error: "handle is required" }, 400);
    }
    const handle = body.handle.trim();

    // Rate-limit: reject if last sync was < 10 minutes ago
    const existing = await db
      .prepare("SELECT fetched_at FROM user_rsi_profile WHERE user_id = ?")
      .bind(user.id)
      .first<{ fetched_at: string }>();

    if (existing?.fetched_at) {
      const lastSync = new Date(existing.fetched_at + "Z").getTime();
      const elapsed = Date.now() - lastSync;
      if (elapsed < 10 * 60 * 1000) {
        const waitSec = Math.ceil((10 * 60 * 1000 - elapsed) / 1000);
        return c.json({ error: `Rate limit: please wait ${waitSec}s before syncing again` }, 429);
      }
    }

    try {
      const profile = await fetchRsiProfile(handle);

      await db
        .prepare(`INSERT INTO user_rsi_profile
            (user_id, handle, display_name, citizen_record, enlisted_at, avatar_url, main_org_slug, orgs_json, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(user_id) DO UPDATE SET
              handle        = excluded.handle,
              display_name  = excluded.display_name,
              citizen_record = excluded.citizen_record,
              enlisted_at   = excluded.enlisted_at,
              avatar_url    = excluded.avatar_url,
              main_org_slug = excluded.main_org_slug,
              orgs_json     = excluded.orgs_json,
              fetched_at    = excluded.fetched_at`)
        .bind(
          user.id,
          profile.handle,
          profile.display_name,
          profile.citizen_record,
          profile.enlisted_at,
          profile.avatar_url,
          profile.main_org_slug,
          JSON.stringify(profile.orgs),
        )
        .run();

      return c.json({ profile: { ...profile, fetched_at: new Date().toISOString() } });
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : "Failed to fetch RSI profile" },
        502,
      );
    }
  });

  // DELETE /api/account — Self-service account deletion
  routes.delete("/", async (c) => {
    const user = c.get("user")!;
    const body = await c.req.json<{ confirmation?: string }>().catch(() => ({ confirmation: undefined }));

    if (body.confirmation !== "DELETE") {
      return c.json({ error: "You must send { \"confirmation\": \"DELETE\" } to confirm account deletion" }, 400);
    }

    const db = c.env.DB;

    // Log deletion before wiping data — row is kept as tombstone so this survives
    await logUserChange(db, user.id, "account_deleted", {
      metadata: { email: user.email },
      ipAddress: c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for"),
    });

    // Atomic deletion: all app data + all auth credentials in a single batch
    // user_change_history rows are kept (tombstone audit trail) but PII fields are scrubbed
    // user row itself is soft-deleted below (anonymised, not hard-deleted)
    await db.batch([
      // App tables
      db.prepare("DELETE FROM ai_analyses WHERE user_id = ?").bind(user.id),
      db.prepare("DELETE FROM user_settings WHERE user_id = ?").bind(user.id),
      db.prepare("DELETE FROM user_llm_configs WHERE user_id = ?").bind(user.id),
      db.prepare("DELETE FROM user_paints WHERE user_id = ?").bind(user.id),
      db.prepare("DELETE FROM user_fleet WHERE user_id = ?").bind(user.id),
      db.prepare("DELETE FROM user_rsi_profile WHERE user_id = ?").bind(user.id),
      // Scrub PII from change history — keep rows (event log) but wipe values
      db.prepare(
        `UPDATE user_change_history SET
           old_value = CASE WHEN old_value IS NOT NULL THEN '<Account Deleted>' ELSE NULL END,
           new_value = CASE WHEN new_value IS NOT NULL THEN '<Account Deleted>' ELSE NULL END,
           metadata  = CASE WHEN metadata  IS NOT NULL THEN '<Account Deleted>' ELSE NULL END
         WHERE user_id = ?`,
      ).bind(user.id),
      // Better Auth tables (FK order: dependents first)
      db.prepare("DELETE FROM passkey WHERE userId = ?").bind(user.id),
      db.prepare("DELETE FROM twoFactor WHERE userId = ?").bind(user.id),
      db.prepare("DELETE FROM verification WHERE identifier = ?").bind(user.email),
      db.prepare("DELETE FROM session WHERE userId = ?").bind(user.id),
      db.prepare("DELETE FROM account WHERE userId = ?").bind(user.id),
    ]);

    // Anonymise + soft-delete the user row — scrubs PII while preserving tombstone
    await db
      .prepare(
        `UPDATE user SET
           name       = 'Deleted User',
           email      = 'deleted-' || id || '@deleted.invalid',
           image      = NULL,
           status     = 'deleted',
           deleted_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(user.id)
      .run();

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
    <tr><td style="color:#aaa;">Email</td><td>${escapeHtml(String(account.email || "—"))}</td></tr>
    <tr><td style="color:#aaa;">Name</td><td>${escapeHtml(String(account.name || "—"))}</td></tr>
    <tr><td style="color:#aaa;">Role</td><td>${escapeHtml(String(account.role || "user"))}</td></tr>
    <tr><td style="color:#aaa;">Created</td><td>${escapeHtml(String(account.createdAt || "—"))}</td></tr>
  </table>

  <h2>Fleet (${fleet.length} ships)</h2>
  ${
    fleet.length > 0
      ? `<table>
    <tr><th>Ship</th><th>Pledge</th><th>Insurance</th></tr>
    ${fleet
      .map(
        (f) =>
          `<tr><td>${escapeHtml(String(f.vehicle_name))}${f.custom_name ? ` (${escapeHtml(String(f.custom_name))})` : ""}</td><td>${escapeHtml(String(f.pledge_name || "—"))}</td><td>${escapeHtml(String(f.insurance_label || "—"))}</td></tr>`,
      )
      .join("")}
  </table>`
      : "<p style='color:#666;'>No fleet data</p>"
  }

  <h2>Paints (${paints.length})</h2>
  ${
    paints.length > 0
      ? `<p style="font-size:13px;">${paints.map((p) => escapeHtml(String(p.paint_name || `Paint #${p.paint_id}`))).join(", ")}</p>`
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
    <p>For questions, contact support@scbridge.app</p>
  </div>
</div>
</body>
</html>`;
}
