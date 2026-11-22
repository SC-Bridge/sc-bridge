import { Hono } from "hono";
import { z } from "zod";
import type { HonoEnv, UserFleetEntry, Vehicle } from "../lib/types";
import { validate } from "../lib/validation";
import { analyzeFleet } from "./analysis";
import { scrapeRsiOrg } from "../lib/rsi-org-scraper";
import { opsRoutes } from "./ops";
import { renderCols, renderJoin, withRender, type RenderCols } from "../lib/renders";

/**
 * /api/orgs/* — Organisation endpoints
 *
 * Verify-then-create flow: RSI SID → charter key → verify → org created from scraped data.
 * Join codes: admin generates codes, users join without invitation emails.
 * Multi-org: users can belong to multiple orgs, set a primary.
 */
export function orgRoutes() {
  const routes = new Hono<HonoEnv>();

  // ── Verification (pre-creation) ────────────────────────────────────────

  // POST /api/orgs/verify/generate — start verification by generating a key
  routes.post("/verify/generate",
    validate("json", z.object({
      rsiSid: z.string().min(2).max(20).regex(/^[A-Za-z0-9_-]+$/, "Invalid RSI org SID"),
    })),
    async (c) => {
      const user = c.get("user");
      if (!user) return c.json({ error: "Unauthorized" }, 401);

      const db = c.env.DB;
      const { rsiSid } = c.req.valid("json");
      const sid = rsiSid.toUpperCase();

      // Check no existing org already has this SID
      const existing = await db
        .prepare("SELECT id FROM organization WHERE rsiSid = ?")
        .bind(sid)
        .first();
      if (existing) {
        return c.json({ error: "An org with this RSI SID already exists" }, 409);
      }

      // Check no other pending verification for this SID (only consider non-expired, < 24hr old)
      const pendingOther = await db
        .prepare("SELECT id FROM org_verification_pending WHERE rsi_sid = ? AND user_id != ? AND created_at > datetime('now', '-24 hours')")
        .bind(sid, user.id)
        .first();
      if (pendingOther) {
        return c.json({ error: "Another user is already verifying this org" }, 409);
      }

      // Clean up expired pending verifications for this SID before inserting
      await db
        .prepare("DELETE FROM org_verification_pending WHERE rsi_sid = ? AND created_at <= datetime('now', '-24 hours')")
        .bind(sid)
        .run();

      // Generate verification key
      const keyBytes = new Uint8Array(16);
      crypto.getRandomValues(keyBytes);
      const verificationKey = `scbridge-verify-${Array.from(keyBytes).map(b => b.toString(16).padStart(2, "0")).join("")}`;

      // Upsert pending verification — only allow same user to overwrite their own row
      await db
        .prepare(
          `INSERT INTO org_verification_pending (user_id, rsi_sid, verification_key)
           VALUES (?, ?, ?)
           ON CONFLICT(rsi_sid) DO UPDATE SET
             verification_key = excluded.verification_key,
             created_at = datetime('now')
           WHERE org_verification_pending.user_id = excluded.user_id`,
        )
        .bind(user.id, sid, verificationKey)
        .run();

      return c.json({
        ok: true,
        verification_key: verificationKey,
        rsiSid: sid,
        instructions: `Add this key anywhere in your RSI org charter at https://robertsspaceindustries.com/en/orgs/${sid}, then click Verify.`,
      });
    },
  );

  // POST /api/orgs/verify/check — check charter for key, create org on success
  routes.post("/verify/check", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const db = c.env.DB;

    // Find user's pending verification (must be < 24hr old)
    const pending = await db
      .prepare("SELECT id, rsi_sid, verification_key FROM org_verification_pending WHERE user_id = ? AND created_at > datetime('now', '-24 hours')")
      .bind(user.id)
      .first<{ id: number; rsi_sid: string; verification_key: string }>();

    if (!pending) {
      return c.json({ error: "No pending verification — generate a key first" }, 400);
    }

    // Scrape RSI org page
    let orgData;
    try {
      orgData = await scrapeRsiOrg(pending.rsi_sid);
    } catch (err) {
      console.error(`[orgs] RSI scrape failed for ${pending.rsi_sid}:`, (err as Error).message);
      return c.json({ error: "Failed to verify org — please try again later" }, 502);
    }

    // Check raw page HTML for verification key — more reliable than parsed charter
    // because the charter extraction regex may miss content in nested divs.
    if (!orgData.rawHtml.includes(pending.verification_key)) {
      return c.json({
        ok: false,
        verified: false,
        message: `Verification key not found in charter. Add "${pending.verification_key}" to your org charter at https://robertsspaceindustries.com/en/orgs/${pending.rsi_sid}, save it, then try again.`,
      });
    }

    // Verified — create the org directly in DB (Better Auth organization schema)
    const slug = pending.rsi_sid.toLowerCase();
    const orgId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Check slug uniqueness
    const slugExists = await db
      .prepare("SELECT id FROM organization WHERE slug = ?")
      .bind(slug)
      .first();
    if (slugExists) {
      return c.json({ error: `An org with slug "${slug}" already exists` }, 409);
    }

    // Create org, owner member, set primary, and clean up pending — all atomically via batch.
    // Prevents phantom orgs with no owner if any step fails.
    const memberId = crypto.randomUUID();
    await db.batch([
      db.prepare(
        `INSERT INTO organization (
          id, name, slug, logo, createdAt,
          rsiSid, rsiUrl,
          rsi_model, rsi_commitment, rsi_roleplay,
          rsi_primary_focus, rsi_secondary_focus,
          rsi_banner_url, rsi_member_count,
          rsi_history_html, rsi_manifesto_html, rsi_charter_html,
          last_synced_at, verified_at, verified_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?)`,
      ).bind(
        orgId, orgData.name, slug, orgData.logo, now,
        pending.rsi_sid,
        `https://robertsspaceindustries.com/en/orgs/${pending.rsi_sid}`,
        orgData.model, orgData.commitment, orgData.roleplay,
        orgData.primaryFocus, orgData.secondaryFocus,
        orgData.bannerUrl, orgData.memberCount,
        orgData.historyHtml, orgData.manifestoHtml, orgData.charterHtml,
        user.id,
      ),
      db.prepare(
        `INSERT INTO member (id, organizationId, userId, role, createdAt)
         VALUES (?, ?, ?, 'owner', ?)`,
      ).bind(memberId, orgId, user.id, now),
      db.prepare("UPDATE user SET primary_org_id = ? WHERE id = ? AND primary_org_id IS NULL")
        .bind(orgId, user.id),
      db.prepare("DELETE FROM org_verification_pending WHERE id = ?")
        .bind(pending.id),
    ]);

    return c.json({
      ok: true,
      verified: true,
      slug,
      message: "Org verified and created! You can now remove the key from your charter.",
    });
  });

  // GET /api/orgs/verify/status — check if user has a pending verification
  // NOTE: verification_key is NOT returned here — it's only returned from /verify/generate.
  // The frontend caches it client-side. Exposing it in a GET would leak the ownership proof token.
  routes.get("/verify/status", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const pending = await c.env.DB
      .prepare("SELECT rsi_sid, created_at FROM org_verification_pending WHERE user_id = ? AND created_at > datetime('now', '-24 hours')")
      .bind(user.id)
      .first<{ rsi_sid: string; created_at: string }>();

    if (!pending) {
      return c.json({ pending: false });
    }

    return c.json({
      pending: true,
      rsiSid: pending.rsi_sid,
      created_at: pending.created_at,
    });
  });

  // ── Primary org ────────────────────────────────────────────────────────

  // PUT /api/orgs/primary — set primary org
  routes.put("/primary",
    validate("json", z.object({
      organizationId: z.string().min(1),
    })),
    async (c) => {
      const user = c.get("user");
      if (!user) return c.json({ error: "Unauthorized" }, 401);

      const db = c.env.DB;
      const { organizationId } = c.req.valid("json");

      // Verify membership
      const membership = await db
        .prepare("SELECT id FROM member WHERE organizationId = ? AND userId = ?")
        .bind(organizationId, user.id)
        .first();
      if (!membership) {
        return c.json({ error: "You are not a member of this org" }, 403);
      }

      await db
        .prepare("UPDATE user SET primary_org_id = ? WHERE id = ?")
        .bind(organizationId, user.id)
        .run();

      return c.json({ ok: true });
    },
  );

  // ── List user's orgs ───────────────────────────────────────────────────

  // GET /api/orgs — list orgs the authenticated user belongs to
  routes.get("/", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const db = c.env.DB;

    const orgs = await db
      .prepare(
        `SELECT o.id, o.name, o.slug, o.logo, o.rsiSid, o.rsiUrl, o.verified_at,
          o.rsi_banner_url, o.rsi_model, o.rsi_member_count,
          mb.role,
          COUNT(DISTINCT m2.userId) as memberCount
        FROM organization o
        JOIN member mb ON mb.organizationId = o.id AND mb.userId = ?
        LEFT JOIN member m2 ON m2.organizationId = o.id
        GROUP BY o.id, o.name, o.slug, o.logo, o.rsiSid, o.rsiUrl, o.verified_at,
          o.rsi_banner_url, o.rsi_model, o.rsi_member_count, mb.role
        ORDER BY o.name`,
      )
      .bind(user.id)
      .all();

    // Get user's primary org id
    const userRow = await db
      .prepare("SELECT primary_org_id FROM user WHERE id = ?")
      .bind(user.id)
      .first<{ primary_org_id: string | null }>();

    return c.json({
      orgs: orgs.results,
      primaryOrgId: userRow?.primary_org_id ?? null,
    });
  });

  // ── Org profile ────────────────────────────────────────────────────────

  // GET /api/orgs/:slug — org profile (members only)
  routes.get("/:slug", async (c) => {
    const slug = c.req.param("slug");
    const db = c.env.DB;
    const user = c.get("user");

    if (!user) return c.json({ error: "Not found" }, 404);

    // F255: merged org lookup + membership check into one query so the
    // timing profile is identical whether the org doesn't exist or the
    // caller isn't a member. Previously a non-member on an existing org
    // ran two DB trips while a lookup on a non-existent org ran one,
    // creating a side-channel for enumerating org slugs.
    const row = await db
      .prepare(
        `SELECT o.id, o.name, o.slug, o.logo, o.description, o.rsiSid, o.rsiUrl,
          o.homepage, o.discord, o.twitch, o.youtube, o.createdAt,
          o.verified_at, o.rsi_model, o.rsi_commitment, o.rsi_roleplay,
          o.rsi_primary_focus, o.rsi_secondary_focus, o.rsi_banner_url, o.rsi_member_count,
          o.rsi_history_html, o.rsi_manifesto_html, o.rsi_charter_html, o.last_synced_at,
          m.role AS caller_role
        FROM organization o
        LEFT JOIN member m ON m.organizationId = o.id AND m.userId = ?
        WHERE o.slug = ?`,
      )
      .bind(user.id, slug)
      .first<Record<string, unknown> & { caller_role: string | null }>();

    if (!row || !row.caller_role) return c.json({ error: "Not found" }, 404);

    const memberCount = await db
      .prepare("SELECT COUNT(*) as count FROM member WHERE organizationId = ?")
      .bind(row.id)
      .first<{ count: number }>();

    const { caller_role, ...org } = row;
    return c.json({
      ...org,
      memberCount: memberCount?.count ?? 0,
      callerRole: caller_role,
    });
  });

  // PATCH /api/orgs/:slug — update org settings (owner/admin only)
  routes.patch("/:slug",
    validate("json", z.object({
      description: z.string().max(500).nullable().optional(),
      homepage: z.string().url().max(200).refine(v => /^https?:\/\//i.test(v), "Must be http/https URL").nullable().optional(),
      discord: z.string().url().max(200).refine(v => /^https?:\/\//i.test(v), "Must be http/https URL").nullable().optional(),
      twitch: z.string().url().max(200).refine(v => /^https?:\/\//i.test(v), "Must be http/https URL").nullable().optional(),
      youtube: z.string().url().max(200).refine(v => /^https?:\/\//i.test(v), "Must be http/https URL").nullable().optional(),
    }).strict()),
    async (c) => {
      const user = c.get("user");
      if (!user) return c.json({ error: "Unauthorized" }, 401);

      const slug = c.req.param("slug");
      const db = c.env.DB;

      const org = await db
        .prepare("SELECT id FROM organization WHERE slug = ?")
        .bind(slug)
        .first<{ id: string }>();
      if (!org) return c.json({ error: "Not found" }, 404);

      const membership = await db
        .prepare("SELECT role FROM member WHERE organizationId = ? AND userId = ?")
        .bind(org.id, user.id)
        .first<{ role: string }>();
      if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
        return c.json({ error: "Forbidden — owner or admin role required" }, 403);
      }

      const body = c.req.valid("json");
      // rsiSid and rsiUrl are now read-only (set by verification/sync)
      const ALLOWED_COLUMNS = new Set(["description", "homepage", "discord", "twitch", "youtube"]);
      const updates: string[] = [];
      const values: (string | null)[] = [];

      for (const [key, val] of Object.entries(body)) {
        if (val !== undefined && ALLOWED_COLUMNS.has(key)) {
          updates.push(`${key} = ?`);
          values.push(val);
        }
      }

      if (updates.length === 0) {
        return c.json({ error: "No fields to update" }, 400);
      }

      values.push(org.id);
      await db
        .prepare(`UPDATE organization SET ${updates.join(", ")} WHERE id = ?`)
        .bind(...values)
        .run();

      return c.json({ ok: true });
    },
  );

  // ── Sync from RSI ──────────────────────────────────────────────────────

  // POST /api/orgs/:slug/sync-rsi — refresh RSI data (owner only, 1hr cooldown)
  routes.post("/:slug/sync-rsi", async (c) => {
    const { slug } = c.req.param();
    const user = c.get("user");
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const db = c.env.DB;
    const org = await db
      .prepare("SELECT id, rsiSid, last_synced_at FROM organization WHERE slug = ?")
      .bind(slug)
      .first<{ id: string; rsiSid: string | null; last_synced_at: string | null }>();
    if (!org) return c.json({ error: "Not found" }, 404);

    const membership = await db
      .prepare("SELECT role FROM member WHERE organizationId = ? AND userId = ?")
      .bind(org.id, user.id)
      .first<{ role: string }>();
    if (!membership || membership.role !== "owner") {
      return c.json({ error: "Forbidden — owner role required" }, 403);
    }

    if (!org.rsiSid) {
      return c.json({ error: "Org has no RSI SID — cannot sync" }, 400);
    }

    // 1hr cooldown
    if (org.last_synced_at) {
      const lastSync = new Date(org.last_synced_at + "Z");
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      if (lastSync > oneHourAgo) {
        const nextSyncAt = new Date(lastSync.getTime() + 60 * 60 * 1000);
        return c.json({
          error: "Sync cooldown — try again later",
          nextSyncAt: nextSyncAt.toISOString(),
        }, 429);
      }
    }

    let orgData;
    try {
      orgData = await scrapeRsiOrg(org.rsiSid);
    } catch (err) {
      console.error(`[orgs] RSI sync failed for ${org.rsiSid}:`, (err as Error).message);
      return c.json({ error: "Failed to sync from RSI — please try again later" }, 502);
    }

    await db
      .prepare(
        `UPDATE organization SET
          name = ?,
          logo = COALESCE(?, logo),
          rsi_model = ?, rsi_commitment = ?, rsi_roleplay = ?,
          rsi_primary_focus = ?, rsi_secondary_focus = ?,
          rsi_banner_url = ?, rsi_member_count = ?,
          rsi_history_html = ?, rsi_manifesto_html = ?, rsi_charter_html = ?,
          last_synced_at = datetime('now')
        WHERE id = ?`,
      )
      .bind(
        orgData.name,
        orgData.logo,
        orgData.model, orgData.commitment, orgData.roleplay,
        orgData.primaryFocus, orgData.secondaryFocus,
        orgData.bannerUrl, orgData.memberCount,
        orgData.historyHtml, orgData.manifestoHtml, orgData.charterHtml,
        org.id,
      )
      .run();

    return c.json({ ok: true, message: "RSI data synced successfully" });
  });

  // ── Delete org ─────────────────────────────────────────────────────────

  // DELETE /api/orgs/:slug — delete org (owner only)
  routes.delete("/:slug", async (c) => {
    const { slug } = c.req.param();
    const user = c.get("user");
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const db = c.env.DB;
    const org = await db
      .prepare("SELECT id FROM organization WHERE slug = ?")
      .bind(slug)
      .first<{ id: string }>();
    if (!org) return c.json({ error: "Not found" }, 404);

    const membership = await db
      .prepare("SELECT role FROM member WHERE organizationId = ? AND userId = ?")
      .bind(org.id, user.id)
      .first<{ role: string }>();
    if (!membership || membership.role !== "owner") {
      return c.json({ error: "Forbidden — owner role required" }, 403);
    }

    // Get the RSI SID before deletion for pending verification cleanup
    const orgFull = await db
      .prepare("SELECT rsiSid FROM organization WHERE id = ?")
      .bind(org.id)
      .first<{ rsiSid: string | null }>();

    // Clean up atomically via batch — prevents race with concurrent join
    // Get all op IDs for this org first (for cascade cleanup)
    const { results: orgOps } = await db
      .prepare("SELECT id FROM org_ops WHERE org_id = ?")
      .bind(org.id)
      .all();
    const opIds = orgOps.map((r: Record<string, unknown>) => r.id as number);

    const stmts: D1PreparedStatement[] = [];
    // Cascade delete ops tables
    for (const opIdVal of opIds) {
      stmts.push(
        db.prepare("DELETE FROM org_op_payouts WHERE org_op_id = ?").bind(opIdVal),
        db.prepare("DELETE FROM org_op_earnings WHERE org_op_id = ?").bind(opIdVal),
        db.prepare("DELETE FROM org_op_capital WHERE org_op_id = ?").bind(opIdVal),
        db.prepare("DELETE FROM org_op_ships WHERE org_op_id = ?").bind(opIdVal),
        db.prepare("DELETE FROM org_op_participants WHERE org_op_id = ?").bind(opIdVal),
      );
    }
    stmts.push(
      db.prepare("DELETE FROM org_ops WHERE org_id = ?").bind(org.id),
      db.prepare("DELETE FROM org_join_codes WHERE organization_id = ?").bind(org.id),
      db.prepare("DELETE FROM invitation WHERE organizationId = ?").bind(org.id),
      db.prepare("DELETE FROM member WHERE organizationId = ?").bind(org.id),
      db.prepare("UPDATE user SET primary_org_id = NULL WHERE primary_org_id = ?").bind(org.id),
      db.prepare("DELETE FROM organization WHERE id = ?").bind(org.id),
    );
    // Also clean up any pending verification for this SID
    if (orgFull?.rsiSid) {
      stmts.push(
        db.prepare("DELETE FROM org_verification_pending WHERE rsi_sid = ?").bind(orgFull.rsiSid),
      );
    }
    await db.batch(stmts);

    return c.json({ ok: true });
  });

  // ── Fleet, members, analysis, stats (unchanged) ───────────────────────

  // GET /api/orgs/:slug/fleet — visibility-gated org fleet (members only)
  routes.get("/:slug/fleet", async (c) => {
    const slug = c.req.param("slug");
    const db = c.env.DB;
    const user = c.get("user");

    // Auth required — org fleet is members-only
    if (!user) return c.json({ error: "Not found" }, 404);

    const org = await db
      .prepare("SELECT id FROM organization WHERE slug = ?")
      .bind(slug)
      .first<{ id: string }>();
    if (!org) return c.json({ error: "Not found" }, 404);

    const membership = await db
      .prepare("SELECT role FROM member WHERE organizationId = ? AND userId = ?")
      .bind(org.id, user.id)
      .first<{ role: string }>();
    if (!membership) return c.json({ error: "Not found" }, 404);

    const callerRole = membership.role;

    // SAFETY: visibilityClause is built from callerRole which comes from the DB
    // (member.role column), not from user input. All branches produce static SQL
    // string literals, so this interpolation is not a SQL injection vector.
    let visibilityClause: string;
    if (callerRole === "owner" || callerRole === "admin") {
      visibilityClause = "uf.org_visibility IN ('public', 'org', 'officers')";
    } else if (callerRole === "member") {
      visibilityClause = "uf.org_visibility IN ('public', 'org')";
    } else {
      visibilityClause = "uf.org_visibility = 'public'";
    }

    const fleet = await db
      .prepare(
        `SELECT uf.id, uf.user_id, uf.vehicle_id, uf.custom_name,
          uf.org_visibility, uf.available_for_ops,
          COALESCE(rv.name, v.name) as vehicle_name,
          COALESCE(rv.slug, v.slug) as vehicle_slug,
          COALESCE(rv.focus, v.focus) as focus,
          COALESCE(rv.size_label, v.size_label) as size_label,
          COALESCE(rv.cargo, v.cargo) as cargo,
          COALESCE(rv.crew_min, v.crew_min) as crew_min,
          COALESCE(rv.crew_max, v.crew_max) as crew_max,
          COALESCE(rv.pledge_price, v.pledge_price) as pledge_price,
          COALESCE(rv.image_url, v.image_url) as image_url,
          COALESCE(rm.name, m.name) as manufacturer_name,
          COALESCE(rm.code, m.code) as manufacturer_code,
          COALESCE(rps.key, ps.key) as production_status,
          u.name as owner_name,
          CASE WHEN v.replaced_by_vehicle_id IS NOT NULL THEN v.name END as original_vehicle_name,
          ${renderCols("ir")}
        FROM user_fleet uf
        JOIN member mb ON mb.userId = uf.user_id AND mb.organizationId = ?
        JOIN vehicles v ON v.id = uf.vehicle_id
        LEFT JOIN vehicles rv ON rv.id = v.replaced_by_vehicle_id
        JOIN user u ON u.id = uf.user_id
        LEFT JOIN manufacturers m ON m.id = v.manufacturer_id
        LEFT JOIN manufacturers rm ON rm.id = rv.manufacturer_id
        LEFT JOIN production_statuses ps ON ps.id = v.production_status_id
        LEFT JOIN production_statuses rps ON rps.id = rv.production_status_id
        ${renderJoin("ir", "COALESCE(rv.class_name, v.class_name)")}
        WHERE ${visibilityClause}
        ORDER BY COALESCE(rv.name, v.name)`,
      )
      .bind(org.id)
      .all<RenderCols>();

    return c.json({ fleet: fleet.results.map(withRender), callerRole });
  });

  // GET /api/orgs/:slug/members — member list (org members only, non-members get 404)
  routes.get("/:slug/members", async (c) => {
    const slug = c.req.param("slug");
    const db = c.env.DB;
    const user = c.get("user");

    if (!user) return c.json({ error: "Not found" }, 404);

    const org = await db
      .prepare("SELECT id FROM organization WHERE slug = ?")
      .bind(slug)
      .first<{ id: string }>();
    if (!org) return c.json({ error: "Not found" }, 404);

    const membership = await db
      .prepare("SELECT role FROM member WHERE organizationId = ? AND userId = ?")
      .bind(org.id, user.id)
      .first<{ role: string }>();
    if (!membership) return c.json({ error: "Not found" }, 404);

    const members = await db
      .prepare(
        `SELECT mb.id, mb.userId, mb.organizationId, mb.role, mb.createdAt,
          u.name as userName, u.image as userImage
        FROM member mb
        JOIN user u ON u.id = mb.userId
        WHERE mb.organizationId = ?
        ORDER BY mb.createdAt`,
      )
      .bind(org.id)
      .all();

    return c.json({ members: members.results });
  });

  // GET /api/orgs/:slug/analysis — gap analysis on org fleet (org members only, non-members get 404)
  routes.get("/:slug/analysis", async (c) => {
    const slug = c.req.param("slug");
    const db = c.env.DB;
    const user = c.get("user");

    if (!user) return c.json({ error: "Not found" }, 404);

    const org = await db
      .prepare("SELECT id FROM organization WHERE slug = ?")
      .bind(slug)
      .first<{ id: string }>();
    if (!org) return c.json({ error: "Not found" }, 404);

    const membership = await db
      .prepare("SELECT role FROM member WHERE organizationId = ? AND userId = ?")
      .bind(org.id, user.id)
      .first<{ role: string }>();
    if (!membership) return c.json({ error: "Not found" }, 404);

    // SAFETY: see fleet endpoint above — callerRole from DB, static SQL literals only
    const callerRole = membership.role;
    let visibilityClause: string;
    if (callerRole === "owner" || callerRole === "admin") {
      visibilityClause = "uf.org_visibility IN ('public', 'org', 'officers')";
    } else {
      visibilityClause = "uf.org_visibility IN ('public', 'org')";
    }

    const fleetResult = await db
      .prepare(
        `SELECT uf.id, uf.vehicle_id, uf.warbond, uf.is_loaner,
          COALESCE(rv.name, v.name) as vehicle_name,
          COALESCE(rv.slug, v.slug) as vehicle_slug,
          COALESCE(rv.focus, v.focus) as focus,
          COALESCE(rv.size_label, v.size_label) as size_label,
          COALESCE(rv.cargo, v.cargo) as cargo,
          COALESCE(rv.crew_min, v.crew_min) as crew_min,
          COALESCE(rv.crew_max, v.crew_max) as crew_max,
          COALESCE(rv.speed_scm, v.speed_scm) as speed_scm,
          COALESCE(rv.classification, v.classification) as classification,
          COALESCE(rm.name, m.name) as manufacturer_name,
          COALESCE(rm.code, m.code) as manufacturer_code,
          it.label as insurance_label, it.duration_months, it.is_lifetime,
          COALESCE(rps.key, ps.key) as production_status
        FROM user_fleet uf
        JOIN member mb ON mb.userId = uf.user_id AND mb.organizationId = ?
        JOIN vehicles v ON v.id = uf.vehicle_id
        LEFT JOIN vehicles rv ON rv.id = v.replaced_by_vehicle_id
        LEFT JOIN manufacturers m ON m.id = v.manufacturer_id
        LEFT JOIN manufacturers rm ON rm.id = rv.manufacturer_id
        LEFT JOIN insurance_types it ON it.id = uf.insurance_type_id
        LEFT JOIN production_statuses ps ON ps.id = v.production_status_id
        LEFT JOIN production_statuses rps ON rps.id = rv.production_status_id
        WHERE ${visibilityClause}
        ORDER BY COALESCE(rv.name, v.name)`,
      )
      .bind(org.id)
      .all();

    const allVehiclesResult = await db
      .prepare(
        `SELECT v.id, v.slug, v.name, v.focus, v.size_label, v.classification,
          ps.key as production_status
        FROM vehicles v
        LEFT JOIN production_statuses ps ON ps.id = v.production_status_id
        WHERE v.removed = 0
        ORDER BY v.name`,
      )
      .all();

    const analysis = analyzeFleet(
      fleetResult.results as unknown as UserFleetEntry[],
      allVehiclesResult.results as unknown as Vehicle[],
    );
    return c.json(analysis);
  });

  // GET /api/orgs/:slug/stats — org fleet stats (members only)
  routes.get("/:slug/stats", async (c) => {
    const slug = c.req.param("slug");
    const db = c.env.DB;
    const user = c.get("user");

    if (!user) return c.json({ error: "Not found" }, 404);

    const org = await db
      .prepare("SELECT id FROM organization WHERE slug = ?")
      .bind(slug)
      .first<{ id: string }>();
    if (!org) return c.json({ error: "Not found" }, 404);

    const membership = await db
      .prepare("SELECT role FROM member WHERE organizationId = ? AND userId = ?")
      .bind(org.id, user.id)
      .first<{ role: string }>();
    if (!membership) return c.json({ error: "Not found" }, 404);

    // Apply same visibility rules as fleet endpoint
    const callerRole = membership.role;
    let statsVisibilityClause: string;
    if (callerRole === "owner" || callerRole === "admin") {
      statsVisibilityClause = "uf.org_visibility IN ('public', 'org', 'officers')";
    } else if (callerRole === "member") {
      statsVisibilityClause = "uf.org_visibility IN ('public', 'org')";
    } else {
      statsVisibilityClause = "uf.org_visibility = 'public'";
    }

    const stats = await db
      .prepare(
        `SELECT
          COUNT(uf.id) as total_ships,
          COALESCE(SUM(v.cargo), 0) as total_cargo,
          COALESCE(SUM(v.crew_min), 0) as min_crew,
          COALESCE(SUM(v.crew_max), 0) as max_crew,
          COUNT(DISTINCT uf.user_id) as contributing_members
        FROM user_fleet uf
        JOIN member mb ON mb.userId = uf.user_id AND mb.organizationId = ?
        JOIN vehicles v ON v.id = uf.vehicle_id
        WHERE ${statsVisibilityClause}`,
      )
      .bind(org.id)
      .first();

    return c.json({ stats });
  });

  // ── Ops sub-router (staging only) ───────────────────────────────────
  routes.use("/:slug/ops/*", async (c, next) => {
    if (c.env.ENVIRONMENT === "production") return c.json({ error: "Not found" }, 404);
    return next();
  });
  routes.route("/:slug/ops", opsRoutes());

  return routes;
}
