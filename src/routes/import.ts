import { Hono } from "hono";
import type { HonoEnv, HangarXplorEntry } from "../lib/types";
import { slugFromShipCode, slugFromName, compactSlug } from "../lib/slug";
import { loadInsuranceTypes } from "../db/queries";
import { logEvent } from "../lib/logger";
import { logUserChange } from "../lib/change-history";

/**
 * /api/import/* — HangarXplor import
 *
 * Preloads vehicle slug map to avoid per-entry DB queries.
 * Uses db.batch() for transactional delete+insert (all-or-nothing).
 */
export function importRoutes() {
  const routes = new Hono<HonoEnv>();

  // POST /api/import/hangarxplor — import HangarXplor JSON export
  routes.post("/hangarxplor", async (c) => {
    const db = c.env.DB;
    const userID = c.get("user")!.id;

    const entries: HangarXplorEntry[] = await c.req.json();
    if (!Array.isArray(entries)) {
      return c.json({ error: "Expected JSON array" }, 400);
    }

    // Preload all vehicle slugs+names into memory (avoids per-entry queries)
    const vehicleMap = await preloadVehicleMap(db);
    const insuranceMap = await loadInsuranceTypes(db);

    // Build all insert statements first, then batch with the delete
    const insertStmts: D1PreparedStatement[] = [];
    let stubStmts: D1PreparedStatement[] = [];
    const stubSlugs: string[] = [];

    for (const entry of entries) {
      const displayName = entry.name;

      // Generate slug candidates
      const codeSlug = slugFromShipCode(entry.ship_code);
      const nameSlug = slugFromName(displayName);
      const lookupSlug = entry.lookup ? slugFromName(entry.lookup) : "";
      const compactCode = compactSlug(codeSlug);
      const compactName = compactSlug(nameSlug);

      // Find matching vehicle in preloaded map
      const candidates = [codeSlug, nameSlug, lookupSlug, compactCode, compactName];
      let matchedSlug = findVehicleSlugLocal(vehicleMap, candidates, displayName);
      if (!matchedSlug) {
        matchedSlug = codeSlug;
        // Need to create a stub — queue for batch insert
        if (!vehicleMap.slugToID.has(matchedSlug)) {
          stubStmts.push(
            db
              .prepare(
                `INSERT INTO vehicles (slug, name, updated_at) VALUES (?, ?, datetime('now'))
                ON CONFLICT(slug) DO UPDATE SET name=excluded.name, updated_at=excluded.updated_at`,
              )
              .bind(matchedSlug, displayName),
          );
          stubSlugs.push(matchedSlug);
        }
      }

      // Detect custom name
      let customName = "";
      if (entry.ship_name) {
        const snLower = entry.ship_name.toLowerCase();
        const codeLower = entry.ship_code.toLowerCase();
        const nameLower = displayName.toLowerCase();
        let isCustom = true;
        if (codeLower.includes(slugFromName(entry.ship_name).toLowerCase())) {
          isCustom = false;
        }
        if (nameLower.includes(snLower) || snLower.includes(nameLower)) {
          isCustom = false;
        }
        if (isCustom) {
          customName = entry.ship_name;
        }
      }

      // Determine insurance type
      let insuranceTypeID: number | null = null;
      if (entry.lti) {
        insuranceTypeID = insuranceMap.get("lti") ?? null;
      } else {
        const insLower = (entry.insurance ?? "").toLowerCase();
        if (insLower.includes("120")) {
          insuranceTypeID = insuranceMap.get("120_month") ?? null;
        } else if (insLower.includes("72")) {
          insuranceTypeID = insuranceMap.get("72_month") ?? null;
        } else if (insLower.includes("6 month") || insLower.includes("6-month")) {
          insuranceTypeID = insuranceMap.get("6_month") ?? null;
        } else if (insLower.includes("3 month") || insLower.includes("3-month")) {
          insuranceTypeID = insuranceMap.get("3_month") ?? null;
        } else if (insLower.includes("standard")) {
          insuranceTypeID = insuranceMap.get("standard") ?? null;
        } else {
          insuranceTypeID = insuranceMap.get("unknown") ?? null;
        }
      }

      // Queue insert (vehicleID resolved after stubs are created)
      insertStmts.push(
        db
          .prepare(
            `INSERT INTO user_fleet (user_id, vehicle_id, insurance_type_id, warbond, is_loaner,
              pledge_id, pledge_name, pledge_cost, pledge_date, custom_name, imported_at)
            VALUES (?, (SELECT id FROM vehicles WHERE slug = ?), ?, ?, ?,
              ?, ?, ?, ?, ?, datetime('now'))`,
          )
          .bind(
            userID,
            matchedSlug,
            insuranceTypeID,
            entry.warbond ? 1 : 0,
            0,
            entry.pledge_id || null,
            entry.pledge_name || null,
            entry.pledge_cost || null,
            entry.pledge_date || null,
            customName || null,
          ),
      );
    }

    // Execute: stubs first (if any), then delete+insert as a batch
    if (stubStmts.length > 0) {
      // Batch stub vehicle creation (max 100 per batch for D1)
      for (let i = 0; i < stubStmts.length; i += 100) {
        await db.batch(stubStmts.slice(i, i + 100));
      }
      console.log(`[import] Created ${stubStmts.length} stub vehicles: ${stubSlugs.join(", ")}`);
    }

    // Insert-then-swap: insert all new entries first, then delete old ones.
    // This avoids data loss if a batch fails partway through — old entries remain
    // until all new entries are confirmed. IDs are AUTOINCREMENT so new entries
    // always have higher IDs than existing ones.
    const maxRow = await db
      .prepare("SELECT MAX(id) as max_id FROM user_fleet WHERE user_id = ?")
      .bind(userID)
      .first<{ max_id: number | null }>();
    const maxExistingId = maxRow?.max_id ?? 0;

    // Insert new entries in D1-safe chunks (max 1000 statements per batch)
    for (let i = 0; i < insertStmts.length; i += 1000) {
      await db.batch(insertStmts.slice(i, i + 1000));
    }

    // All inserts succeeded — delete old entries
    await db
      .prepare("DELETE FROM user_fleet WHERE user_id = ? AND id <= ?")
      .bind(userID, maxExistingId)
      .run();
    const imported = insertStmts.length;

    console.log(`[import] HangarXplor import complete: ${imported}/${entries.length}`);
    logEvent("fleet_import", {
      entries: entries.length,
      imported,
      stubs_created: stubStmts.length,
      stub_slugs: stubSlugs,
    });
    await logUserChange(db, userID, "fleet_imported", {
      metadata: { vehicle_count: imported, total_entries: entries.length },
      ipAddress: c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for"),
    });
    return c.json({
      imported,
      total: entries.length,
      message: "Import complete",
    });
  });

  return routes;
}

// --- Preloaded vehicle map for in-memory slug matching ---

interface VehicleMap {
  slugToID: Map<string, number>;
  nameToSlug: Map<string, string>;
  compactToSlug: Map<string, string>;
}

async function preloadVehicleMap(db: D1Database): Promise<VehicleMap> {
  const result = await db
    .prepare("SELECT id, slug, name FROM vehicles")
    .all();

  const slugToID = new Map<string, number>();
  const nameToSlug = new Map<string, string>();
  const compactToSlug = new Map<string, string>();

  for (const row of result.results) {
    const r = row as { id: number; slug: string; name: string };
    slugToID.set(r.slug, r.id);
    nameToSlug.set(r.name.toLowerCase(), r.slug);
    compactToSlug.set(compactSlug(r.slug), r.slug);
  }

  return { slugToID, nameToSlug, compactToSlug };
}

function findVehicleSlugLocal(
  map: VehicleMap,
  candidateSlugs: string[],
  displayName: string,
): string | null {
  // Try exact slug matches
  for (const slug of candidateSlugs) {
    if (!slug) continue;
    if (map.slugToID.has(slug)) return slug;
  }

  // Try name match
  if (displayName) {
    const found = map.nameToSlug.get(displayName.toLowerCase());
    if (found) return found;
  }

  // Try compact match
  for (const slug of candidateSlugs) {
    if (!slug) continue;
    const compact = compactSlug(slug);
    const found = map.compactToSlug.get(compact);
    if (found) return found;
  }

  // Try prefix match
  for (const slug of candidateSlugs) {
    if (!slug || slug.length < 3) continue;
    for (const [existingSlug] of map.slugToID) {
      if (existingSlug.startsWith(slug)) return existingSlug;
    }
  }

  return null;
}
