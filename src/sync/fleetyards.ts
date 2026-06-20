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
}

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
    const data = (await res.json()) as FleetyardsShip[];
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
