/**
 * Fleetyards production status sync.
 *
 * Fetches ship production statuses from the Fleetyards API and updates
 * vehicles that differ. Runs nightly via cron.
 *
 * Fleetyards statuses: "flight-ready", "in-concept", "in-production"
 * Our statuses: flight_ready (1), in_production (2), in_concept (3)
 */

import { logEvent } from "../lib/logger";

const FLEETYARDS_API = "https://api.fleetyards.net/v1/models";
const PER_PAGE = 200;

/** Map Fleetyards status string → our production_status_id */
const STATUS_MAP: Record<string, number> = {
  "flight-ready": 1,
  "in-production": 2,
  "in-concept": 3,
};

/** Slugs where we override Fleetyards (they're wrong) */
const OVERRIDES: Record<string, number> = {
  javelin: 1, // Javelin IS flight ready — Fleetyards says in-concept
};

interface FleetyardsShip {
  slug: string;
  name: string;
  productionStatus: string;
  loaners?: Array<{ slug: string; name: string }>;
}

interface VehicleRow {
  id: number;
  slug: string;
  name: string;
}

/**
 * Fleetyards slug → our slug. Closes the systematic naming gaps the slug/name
 * fallbacks miss: mfr-prefix divergence (mrai→misc, xnaa→xian) and variant
 * naming (mk-i→gs, ursa→ursa-rover, c2-hercules→starlifter-c2, etc.).
 */
const LOANER_ALIAS: Record<string, string> = {
  "anvl-f7c-m-super-hornet-mk-i": "anvl-hornet-f7cm",
  "argo-csv-sm": "argo-csv-cargo",
  "argo-mpuv-cargo": "argo-mpuv",
  "argo-mpuv-personnel": "argo-mpuv-transport",
  "argo-mpuv-tractor": "argo-mpuv-1t",
  "crus-a1-spirit": "crus-spirit-a1",
  "crus-c2-hercules": "crus-starlifter-c2",
  "drak-dragonfly-black": "drak-dragonfly",
  "drak-dragonfly-yellowjacket": "drak-dragonfly-yellow",
  "misc-reliant-kore": "misc-reliant",
  "mrai-fury": "misc-fury",
  "mrai-fury-lx": "misc-fury-lx",
  "mrai-fury-mx": "misc-fury-miru",
  "orig-600i-explorer": "orig-600i",
  "rsi-aurora-mk-i-ln": "rsi-aurora-gs-ln",
  "rsi-aurora-mk-i-mr": "rsi-aurora-gs-mr",
  "rsi-ursa": "rsi-ursa-rover",
  "rsi-zeus-mk-ii-es": "rsi-zeus-es",
  "rsi-zeus-mk-ii-mr": "rsi-zeus-mr",
  "xnaa-nox": "xian-nox",
  "xnaa-nox-kue": "xian-nox-kue",
};

const normKey = (s: string): string => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

async function fetchAllShips(): Promise<FleetyardsShip[]> {
  const all: FleetyardsShip[] = [];
  let page = 1;

  while (true) {
    const res = await fetch(`${FLEETYARDS_API}?per_page=${PER_PAGE}&page=${page}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`Fleetyards API returned ${res.status}`);
    }
    // API returns { items: [...], meta: {...} } (changed from a bare array).
    const body = (await res.json()) as { items?: FleetyardsShip[] } | FleetyardsShip[];
    const data = Array.isArray(body) ? body : (body.items ?? []);
    if (!data.length) break;
    all.push(...data);
    if (data.length < PER_PAGE) break;
    page++;
  }

  return all;
}

export async function syncProductionStatuses(db: D1Database): Promise<{ checked: number; updated: number }> {
  console.log("[fleetyards] Fetching production statuses...");
  const fyShips = await fetchAllShips();
  console.log(`[fleetyards] Fetched ${fyShips.length} ships`);

  // Build slug → target status_id map
  const targetMap = new Map<string, number>();
  for (const ship of fyShips) {
    const statusId = STATUS_MAP[ship.productionStatus];
    if (statusId) {
      targetMap.set(ship.slug, statusId);
    }
  }

  // Apply overrides
  for (const [slug, statusId] of Object.entries(OVERRIDES)) {
    targetMap.set(slug, statusId);
  }

  // Fetch our vehicles with current status
  const result = await db
    .prepare(
      `SELECT v.slug, v.production_status_id
       FROM vehicles v
       WHERE v.is_deleted = 0`,
    )
    .all<{ slug: string; production_status_id: number | null }>();

  // Find mismatches and batch update
  const updates: D1PreparedStatement[] = [];
  for (const row of result.results) {
    const target = targetMap.get(row.slug);
    if (!target) {
      // Try matching without variant suffix (wikelo, BIS editions)
      const base = row.slug
        .replace(/-wikelo-.*$/, "")
        .replace(/-2949-.*$/, "")
        .replace(/-2950-.*$/, "")
        .replace(/-2951-.*$/, "");
      let baseTarget = targetMap.get(base);
      // 4.8 new-ship fallback: our slug is class-name-derived (orig-m80,
      // misc-starlite, drak-pitbull). Fleetyards may not include mfr prefix.
      // Try stripping leading mfr-code segment (everything up to first '-').
      if (!baseTarget) {
        const hyphen = base.indexOf("-");
        if (hyphen > 0) {
          baseTarget = targetMap.get(base.slice(hyphen + 1));
        }
      }
      if (baseTarget && row.production_status_id !== baseTarget) {
        updates.push(
          db
            .prepare("UPDATE vehicles SET production_status_id = ? WHERE slug = ?")
            .bind(baseTarget, row.slug),
        );
      }
      continue;
    }

    if (row.production_status_id !== target) {
      updates.push(
        db
          .prepare("UPDATE vehicles SET production_status_id = ? WHERE slug = ?")
          .bind(target, row.slug),
      );
    }
  }

  // Execute in batches
  if (updates.length > 0) {
    for (let i = 0; i < updates.length; i += 50) {
      await db.batch(updates.slice(i, i + 50));
    }
  }

  console.log(`[fleetyards] Checked ${result.results.length}, updated ${updates.length}`);
  logEvent("fleetyards_sync", {
    checked: result.results.length,
    updated: updates.length,
    fleetyards_count: fyShips.length,
  });

  return { checked: result.results.length, updated: updates.length };
}

/**
 * Resolve a Fleetyards slug/name to our vehicle id. Tries the alias target AND
 * the original slug, each with variant/mfr-strip + normalized-slug fallbacks,
 * then a normalized-name fallback. Returns null if unresolved. Exported for
 * testing.
 */
export function resolveVehicleId(
  slug: string,
  name: string,
  slugToId: Map<string, number>,
  normSlugToId: Map<string, number>,
  normNameToId: Map<string, number>,
): number | null {
  const candidates = LOANER_ALIAS[slug] ? [LOANER_ALIAS[slug], slug] : [slug];
  for (const cand of candidates) {
    const exact = slugToId.get(cand);
    if (exact != null) return exact;
    const base = cand
      .replace(/-wikelo-.*$/, "")
      .replace(/-2949-.*$/, "")
      .replace(/-2950-.*$/, "")
      .replace(/-2951-.*$/, "");
    const baseId = slugToId.get(base);
    if (baseId != null) return baseId;
    const hyphen = base.indexOf("-");
    if (hyphen > 0) {
      const noMfr = slugToId.get(base.slice(hyphen + 1));
      if (noMfr != null) return noMfr;
    }
    const ns = normSlugToId.get(normKey(cand));
    if (ns != null) return ns;
  }
  const nn = normNameToId.get(normKey(name));
  return nn != null ? nn : null;
}

/**
 * Build the deduped (vehicle_id, loaner_id) matrix from the Fleetyards ship
 * list + our vehicles. One row per distinct ship→loaner edge (a loaner granted
 * by two ships yields two rows — different vehicle_id; the per-user endpoint
 * collapses to one loaner). Pure — exported for testing.
 */
export function buildLoanerPairs(
  ships: FleetyardsShip[],
  vehicles: VehicleRow[],
): Array<[number, number]> {
  const slugToId = new Map<string, number>();
  const normSlugToId = new Map<string, number>();
  const normNameToId = new Map<string, number>();
  for (const v of vehicles) {
    slugToId.set(v.slug, v.id);
    if (!normSlugToId.has(normKey(v.slug))) normSlugToId.set(normKey(v.slug), v.id);
    if (!normNameToId.has(normKey(v.name))) normNameToId.set(normKey(v.name), v.id);
  }
  const seen = new Set<string>();
  const pairs: Array<[number, number]> = [];
  for (const ship of ships) {
    if (!ship.loaners?.length) continue;
    const vid = resolveVehicleId(ship.slug, ship.name, slugToId, normSlugToId, normNameToId);
    if (vid == null) continue;
    for (const loaner of ship.loaners) {
      const lid = resolveVehicleId(loaner.slug, loaner.name, slugToId, normSlugToId, normNameToId);
      if (lid == null || lid === vid) continue;
      const key = `${vid}:${lid}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push([vid, lid]);
    }
  }
  return pairs;
}

/**
 * Populate the global vehicle_loaners matrix from Fleetyards (CIG's loaner ship
 * matrix mirror). Runs nightly alongside the production-status sync. Wipes and
 * reloads — but only if at least one pair resolved, so a bad/empty fetch can't
 * blow away the existing matrix.
 */
export async function syncLoaners(db: D1Database): Promise<{ ships: number; pairs: number }> {
  console.log("[fleetyards] Fetching loaner matrix...");
  const fyShips = await fetchAllShips();
  const vehicles = (
    await db.prepare("SELECT id, slug, name FROM vehicles WHERE is_deleted = 0").all<VehicleRow>()
  ).results;
  const pairs = buildLoanerPairs(fyShips, vehicles);

  if (pairs.length === 0) {
    console.warn("[fleetyards] 0 loaner pairs resolved — skipping wipe to protect the matrix");
    logEvent("fleetyards_loaner_sync", { pairs: 0, ships: fyShips.length, skipped: true });
    return { ships: fyShips.length, pairs: 0 };
  }

  await db.prepare("DELETE FROM vehicle_loaners").run();
  const inserts = pairs.map(([v, l]) =>
    db.prepare("INSERT OR IGNORE INTO vehicle_loaners (vehicle_id, loaner_id) VALUES (?, ?)").bind(v, l),
  );
  for (let i = 0; i < inserts.length; i += 50) {
    await db.batch(inserts.slice(i, i + 50));
  }

  console.log(`[fleetyards] Loaner matrix: ${pairs.length} pairs from ${fyShips.length} ships`);
  logEvent("fleetyards_loaner_sync", { pairs: pairs.length, ships: fyShips.length });
  return { ships: fyShips.length, pairs: pairs.length };
}
