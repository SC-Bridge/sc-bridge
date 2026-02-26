/**
 * FleetYards API client — image-only sync.
 * Ported from internal/fleetyards/client.go
 *
 * FleetYards is retained solely for store images (ships + paints).
 * All ship data (specs, dimensions, pricing) comes from SC Wiki.
 */

import {
  buildUpdateVehicleImagesStatement,
  buildUpdatePaintImagesStatement,
  getVehicleSlugsWithPaints,
  getPaintsByVehicleSlug,
  insertSyncHistory,
  updateSyncHistory,
} from "../db/queries";
import { delay, concurrentMap, chunkArray } from "../lib/utils";
import { SYNC_SOURCE } from "../lib/constants";
import { logEvent } from "../lib/logger";

// --- Types ---

interface ShipImages {
  slug: string;
  imageURL: string;
  small: string;
  medium: string;
  large: string;
}

interface PaintImages {
  name: string;
  slug: string;
  imageURL: string;
  small: string;
  medium: string;
  large: string;
}

interface APIShip {
  slug: string;
  media?: {
    storeImage?: {
      source: string;
      small: string;
      medium: string;
      large: string;
    };
  };
}

interface APIPaint {
  name: string;
  slug: string;
  media?: {
    storeImage?: {
      source: string;
      small: string;
      medium: string;
      large: string;
    };
  };
}

// --- HTTP helpers ---

const RATE_LIMIT_MS = 500;

async function fyFetch(url: string): Promise<unknown> {
  const resp = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "FleetManager/1.0",
    },
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`FleetYards HTTP ${resp.status}: ${body.slice(0, 200)}`);
  }

  return resp.json();
}

// --- Ship image sync ---

async function fetchAllShipImages(baseURL: string): Promise<ShipImages[]> {
  const allImages: ShipImages[] = [];
  let page = 1;
  const perPage = 50;

  for (;;) {
    const url = `${baseURL}/v1/models?page=${page}&perPage=${perPage}`;
    const data = (await fyFetch(url)) as APIShip[];

    if (data.length === 0) break;

    for (const ship of data) {
      const img = ship.media?.storeImage;
      if (!img) continue;
      if (!img.source && !img.small && !img.medium && !img.large) continue;

      allImages.push({
        slug: ship.slug,
        imageURL: img.source,
        small: img.small,
        medium: img.medium,
        large: img.large,
      });
    }

    console.log(`[fleetyards] Ship images page ${page}: ${data.length} ships, ${allImages.length} images total`);

    if (data.length < perPage) break;
    page++;
    await delay(RATE_LIMIT_MS);
  }

  return allImages;
}

export async function syncShipImages(db: D1Database, baseURL: string): Promise<void> {
  const syncID = await insertSyncHistory(db, SYNC_SOURCE.FLEETYARDS, "images", "running");

  try {
    const images = await fetchAllShipImages(baseURL);

    // Batch all image update statements
    const stmts = images.map((img) =>
      buildUpdateVehicleImagesStatement(db, img.slug, img.imageURL, img.small, img.medium, img.large),
    );

    for (const chunk of chunkArray(stmts, 500)) {
      await db.batch(chunk);
    }

    const count = stmts.length;
    await updateSyncHistory(db, syncID, "success", count, "");
    console.log(`[fleetyards] Ship image sync complete: ${count}/${images.length} updated`);
    logEvent("sync_vehicle_images", { total: images.length, updated: count });
  } catch (err) {
    await updateSyncHistory(db, syncID, "error", 0, String(err));
    throw err;
  }
}

// --- Paint image sync ---

async function fetchPaintImages(baseURL: string, vehicleSlug: string): Promise<PaintImages[]> {
  const url = `${baseURL}/v1/models/${vehicleSlug}/paints`;
  const data = (await fyFetch(url)) as APIPaint[];

  const paints: PaintImages[] = [];
  for (const p of data) {
    const img = p.media?.storeImage;
    if (!img) continue;
    if (!img.source && !img.small && !img.medium && !img.large) continue;

    paints.push({
      name: p.name,
      slug: p.slug,
      imageURL: img.source,
      small: img.small,
      medium: img.medium,
      large: img.large,
    });
  }

  return paints;
}

export async function syncPaintImages(db: D1Database, baseURL: string): Promise<void> {
  const slugs = await getVehicleSlugsWithPaints(db);
  if (slugs.length === 0) {
    console.log("[fleetyards] No vehicles with paints to fetch images for");
    return;
  }

  console.log(`[fleetyards] Fetching paint images for ${slugs.length} vehicles`);

  // Pre-load all DB paints per vehicle slug (one query per slug is unavoidable, but cheap)
  // Fetch all paint images concurrently (5 at a time instead of sequential with 500ms delay)
  interface PaintFetchResult {
    vehicleSlug: string;
    fyPaints: PaintImages[];
  }

  const fetchResults = await concurrentMap<string, PaintFetchResult | null>(slugs, 5, async (vehicleSlug) => {
    try {
      const fyPaints = await fetchPaintImages(baseURL, vehicleSlug);
      if (fyPaints.length === 0) return null;
      return { vehicleSlug, fyPaints };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("404")) {
        console.warn(`[fleetyards] Paint image fetch failed for ${vehicleSlug}:`, msg);
      }
      return null;
    }
  });

  // Match and collect all image update statements
  const stmts: D1PreparedStatement[] = [];

  for (const result of fetchResults) {
    if (!result) continue;

    const dbPaints = await getPaintsByVehicleSlug(db, result.vehicleSlug);

    for (const fyPaint of result.fyPaints) {
      const matched = matchPaintByName(fyPaint.name, dbPaints);
      if (!matched) continue;

      stmts.push(
        buildUpdatePaintImagesStatement(db, matched.class_name, fyPaint.imageURL, fyPaint.small, fyPaint.medium, fyPaint.large),
      );
    }
  }

  // Batch all paint image updates
  for (const chunk of chunkArray(stmts, 500)) {
    await db.batch(chunk);
  }

  console.log(`[fleetyards] Paint image sync complete: ${stmts.length} images updated`);
  logEvent("sync_paint_images", { count: stmts.length });
}

// --- Paint name matching ---

function matchPaintByName(
  fyName: string,
  dbPaints: Array<{ name: string; class_name: string }>,
): { name: string; class_name: string } | null {
  const fyNorm = normalizePaintName(fyName);

  for (const p of dbPaints) {
    const dbNorm = normalizePaintName(p.name);
    if (fyNorm === dbNorm) return p;
    if (dbNorm.includes(fyNorm) || fyNorm.includes(dbNorm)) return p;
  }

  return null;
}

function normalizePaintName(name: string): string {
  let n = name.toLowerCase().trim();
  n = n.replace(/ livery$/, "");
  n = n.replace(/ paint$/, "");
  n = n.replace(/ skin$/, "");
  return n;
}
