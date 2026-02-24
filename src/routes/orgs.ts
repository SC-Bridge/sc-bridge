import { Hono } from "hono";
import type { HonoEnv, UserFleetEntry, Vehicle } from "../lib/types";
import { analyzeFleet } from "./analysis";

/**
 * /api/orgs/* — Organisation endpoints
 *
 * Core org operations (create, invite, accept) are handled by Better Auth's
 * organization plugin at /api/auth/organization/*. These routes cover
 * fleet-specific and public-facing endpoints that Better Auth doesn't provide.
 */
export function orgRoutes() {
  const routes = new Hono<HonoEnv>();

  // GET /api/orgs — list orgs the authenticated user belongs to
  routes.get("/", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const db = c.env.DB;

    const orgs = await db
      .prepare(
        `SELECT o.id, o.name, o.slug, o.logo, o.rsiSid, o.rsiUrl, mb.role,
          COUNT(DISTINCT m2.userId) as memberCount
        FROM organization o
        JOIN member mb ON mb.organizationId = o.id AND mb.userId = ?
        LEFT JOIN member m2 ON m2.organizationId = o.id
        GROUP BY o.id, o.name, o.slug, o.logo, o.rsiSid, o.rsiUrl, mb.role
        ORDER BY o.name`,
      )
      .bind(user.id)
      .all();

    return c.json({ orgs: orgs.results });
  });

  // GET /api/orgs/:slug — public org profile
  routes.get("/:slug", async (c) => {
    const slug = c.req.param("slug");
    const db = c.env.DB;

    const org = await db
      .prepare("SELECT id, name, slug, logo, rsiSid, rsiUrl, homepage, discord, twitch, youtube, createdAt FROM organization WHERE slug = ?")
      .bind(slug)
      .first<{
        id: string; name: string; slug: string; logo: string | null;
        rsiSid: string | null; rsiUrl: string | null; homepage: string | null;
        discord: string | null; twitch: string | null; youtube: string | null;
        createdAt: string;
      }>();

    if (!org) return c.json({ error: "Not found" }, 404);

    const memberCount = await db
      .prepare("SELECT COUNT(*) as count FROM member WHERE organizationId = ?")
      .bind(org.id)
      .first<{ count: number }>();

    return c.json({
      ...org,
      memberCount: memberCount?.count ?? 0,
    });
  });

  // GET /api/orgs/:slug/fleet — visibility-gated org fleet
  routes.get("/:slug/fleet", async (c) => {
    const slug = c.req.param("slug");
    const db = c.env.DB;
    const user = c.get("user");

    const org = await db
      .prepare("SELECT id FROM organization WHERE slug = ?")
      .bind(slug)
      .first<{ id: string }>();
    if (!org) return c.json({ error: "Not found" }, 404);

    let callerRole: string | null = null;
    if (user) {
      const membership = await db
        .prepare("SELECT role FROM member WHERE organizationId = ? AND userId = ?")
        .bind(org.id, user.id)
        .first<{ role: string }>();
      callerRole = membership?.role ?? null;
    }

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
          v.name as vehicle_name, v.slug as vehicle_slug, v.focus, v.size_label, v.cargo,
          v.crew_min, v.crew_max, v.pledge_price, v.image_url,
          m.name as manufacturer_name, m.code as manufacturer_code,
          ps.key as production_status,
          u.name as owner_name
        FROM user_fleet uf
        JOIN member mb ON mb.userId = uf.user_id AND mb.organizationId = ?
        JOIN vehicles v ON v.id = uf.vehicle_id
        JOIN user u ON u.id = uf.user_id
        LEFT JOIN manufacturers m ON m.id = v.manufacturer_id
        LEFT JOIN production_statuses ps ON ps.id = v.production_status_id
        WHERE ${visibilityClause}
        ORDER BY v.name`,
      )
      .bind(org.id)
      .all();

    return c.json({ fleet: fleet.results, callerRole });
  });

  // GET /api/orgs/:slug/members — member list (org members only)
  routes.get("/:slug/members", async (c) => {
    const slug = c.req.param("slug");
    const db = c.env.DB;
    const user = c.get("user");

    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const org = await db
      .prepare("SELECT id FROM organization WHERE slug = ?")
      .bind(slug)
      .first<{ id: string }>();
    if (!org) return c.json({ error: "Not found" }, 404);

    const membership = await db
      .prepare("SELECT role FROM member WHERE organizationId = ? AND userId = ?")
      .bind(org.id, user.id)
      .first<{ role: string }>();
    if (!membership) return c.json({ error: "Forbidden" }, 403);

    const members = await db
      .prepare(
        `SELECT mb.id, mb.userId, mb.organizationId, mb.role, mb.createdAt,
          u.name as userName, u.email as userEmail, u.image as userImage
        FROM member mb
        JOIN user u ON u.id = mb.userId
        WHERE mb.organizationId = ?
        ORDER BY mb.createdAt`,
      )
      .bind(org.id)
      .all();

    return c.json({ members: members.results });
  });

  // GET /api/orgs/:slug/analysis — gap analysis on org fleet (org members only)
  routes.get("/:slug/analysis", async (c) => {
    const slug = c.req.param("slug");
    const db = c.env.DB;
    const user = c.get("user");

    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const org = await db
      .prepare("SELECT id FROM organization WHERE slug = ?")
      .bind(slug)
      .first<{ id: string }>();
    if (!org) return c.json({ error: "Not found" }, 404);

    const membership = await db
      .prepare("SELECT role FROM member WHERE organizationId = ? AND userId = ?")
      .bind(org.id, user.id)
      .first<{ role: string }>();
    if (!membership) return c.json({ error: "Forbidden" }, 403);

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
          uf.pledge_name, uf.pledge_cost, uf.pledge_date, uf.custom_name,
          v.name as vehicle_name, v.slug as vehicle_slug, v.focus, v.size_label, v.cargo,
          v.crew_min, v.crew_max, v.pledge_price, v.speed_scm, v.classification,
          m.name as manufacturer_name, m.code as manufacturer_code,
          it.label as insurance_label, it.duration_months, it.is_lifetime,
          ps.key as production_status
        FROM user_fleet uf
        JOIN member mb ON mb.userId = uf.user_id AND mb.organizationId = ?
        JOIN vehicles v ON v.id = uf.vehicle_id
        LEFT JOIN manufacturers m ON m.id = v.manufacturer_id
        LEFT JOIN insurance_types it ON it.id = uf.insurance_type_id
        LEFT JOIN production_statuses ps ON ps.id = v.production_status_id
        WHERE ${visibilityClause}
        ORDER BY v.name`,
      )
      .bind(org.id)
      .all();

    const allVehiclesResult = await db
      .prepare(
        `SELECT v.id, v.slug, v.name, v.focus, v.size_label, v.classification,
          ps.key as production_status
        FROM vehicles v
        LEFT JOIN production_statuses ps ON ps.id = v.production_status_id
        ORDER BY v.name`,
      )
      .all();

    const analysis = analyzeFleet(
      fleetResult.results as unknown as UserFleetEntry[],
      allVehiclesResult.results as unknown as Vehicle[],
    );
    return c.json(analysis);
  });

  // GET /api/orgs/:slug/stats — public fleet stats
  routes.get("/:slug/stats", async (c) => {
    const slug = c.req.param("slug");
    const db = c.env.DB;

    const org = await db
      .prepare("SELECT id FROM organization WHERE slug = ?")
      .bind(slug)
      .first<{ id: string }>();
    if (!org) return c.json({ error: "Not found" }, 404);

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
        WHERE uf.org_visibility = 'public'`,
      )
      .bind(org.id)
      .first();

    return c.json({ stats });
  });

  return routes;
}
