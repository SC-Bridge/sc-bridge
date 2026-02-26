/**
 * CDN crawl data sync — imports pre-crawled RSI CDN image data
 *
 * Accepts the output of cdn-sync (ships.json / paints.json) and updates
 * vehicle and paint image URLs in D1. Runs inline (not background) so the
 * caller receives a match report immediately.
 *
 * Ship matching:  CDN `name` field → existing findVehicleSlug + shipNameMap
 * Paint matching: CDN kebab-case slug → de-hyphenate → normalizePaintName →
 *                 findPaintMatch; fallback: paintShipAliases prefix expansion
 */

import {
  getAllVehicleNameSlugs,
  getAllPaintNameClasses,
  buildUpdateVehicleImagesStatement,
  buildUpdatePaintImagesStatement,
  insertSyncHistory,
  updateSyncHistory,
} from "../db/queries";
import { chunkArray } from "../lib/utils";
import { SYNC_SOURCE } from "../lib/constants";
import {
  findVehicleSlug,
  normalizePaintName,
  findPaintMatch,
  paintShipAliases,
  type PaintInfo,
} from "./rsi";
import { logEvent } from "../lib/logger";

// --- CDN export types ---

interface CDNImage {
  url: string;
  hash: string;
  filename: string;
  width: number;
  height: number;
}

interface CDNShip {
  name: string;
  slug: string;
  variant: string;
  page_url: string;
  images: CDNImage[];
}

interface CDNPaint {
  name: string;
  page_url: string;
  images: CDNImage[];
}

export interface CDNShipsExport {
  ships: CDNShip[];
}

export interface CDNPaintsExport {
  paints: CDNPaint[];
}

export interface CDNSyncResult {
  matched: number;
  skipped: number;
  skippedPack?: number;
  total: number;
}

// --- Ship image sync ---

export async function syncCDNShipImages(
  db: D1Database,
  data: CDNShipsExport,
): Promise<CDNSyncResult> {
  const syncID = await insertSyncHistory(db, SYNC_SOURCE.RSI_API, "cdn_ships", "running");

  try {
    const vehicles = await getAllVehicleNameSlugs(db);
    const nameToSlug = new Map<string, string>();
    for (const v of vehicles) {
      nameToSlug.set(v.name.toLowerCase(), v.slug);
    }

    const stmts: D1PreparedStatement[] = [];
    let matched = 0;
    let skipped = 0;

    for (const ship of data.ships) {
      if (!ship.images || ship.images.length === 0) {
        skipped++;
        continue;
      }

      const imageURL = ship.images[0].url;
      const slug = findVehicleSlug(ship.name, nameToSlug);
      if (!slug) {
        console.log(`[cdn] No slug for ship: ${ship.name}`);
        skipped++;
        continue;
      }

      stmts.push(
        ...buildUpdateVehicleImagesStatement(db, slug, imageURL, imageURL, imageURL, imageURL),
      );
      matched++;
    }

    for (const chunk of chunkArray(stmts, 500)) {
      await db.batch(chunk);
    }

    await updateSyncHistory(db, syncID, "success", matched, "");
    console.log(
      `[cdn] Ship sync complete: ${matched} matched, ${skipped} skipped (${data.ships.length} total)`,
    );
    logEvent("sync_cdn_ships", { fetched: data.ships.length, matched, skipped });

    return { matched, skipped, total: data.ships.length };
  } catch (err) {
    await updateSyncHistory(db, syncID, "error", 0, String(err));
    throw err;
  }
}

// --- Paint matching helpers ---

// Sorted alias entries longest-first to match the most specific prefix first
const sortedAliasEntries = Object.entries(paintShipAliases).sort(
  (a, b) => b[0].length - a[0].length,
);

function normalizeCDNPaintName(cdnName: string): string {
  // CDN names are kebab-case slugs — replace hyphens with spaces before normalizing
  const spaced = cdnName.replace(/-/g, " ");
  return normalizePaintName(spaced);
}

function expandCDNPaintPrefix(norm: string): string {
  for (const [alias, expanded] of sortedAliasEntries) {
    if (norm.startsWith(alias + " ")) {
      return expanded.toLowerCase() + " " + norm.slice(alias.length + 1);
    }
    if (norm === alias) {
      return expanded.toLowerCase();
    }
  }
  return norm;
}

// --- Paint image sync ---

export async function syncCDNPaintImages(
  db: D1Database,
  data: CDNPaintsExport,
): Promise<CDNSyncResult> {
  const syncID = await insertSyncHistory(db, SYNC_SOURCE.RSI_API, "cdn_paints", "running");

  try {
    const dbPaints = await getAllPaintNameClasses(db);
    const exactLookup = new Map<string, PaintInfo>();
    const allDBPaints: PaintInfo[] = [];
    for (const p of dbPaints) {
      const info: PaintInfo = {
        norm: normalizePaintName(p.name),
        className: p.class_name,
        hasImage: p.has_image,
      };
      exactLookup.set(info.norm, info);
      allDBPaints.push(info);
    }

    const stmts: D1PreparedStatement[] = [];
    let matched = 0;
    let skipped = 0;
    let skippedPack = 0;

    for (const paint of data.paints) {
      if (!paint.images || paint.images.length === 0) {
        skipped++;
        continue;
      }

      // Skip multi-paint bundles
      const lower = paint.name.toLowerCase();
      if (lower.includes("pack") || lower.includes("collection")) {
        skippedPack++;
        continue;
      }

      const imageURL = paint.images[0].url;
      const norm = normalizeCDNPaintName(paint.name);

      // Try direct match; if that fails, expand ship-name alias prefix and retry
      let info = findPaintMatch(norm, exactLookup, allDBPaints);
      if (!info) {
        const expanded = expandCDNPaintPrefix(norm);
        if (expanded !== norm) {
          info = findPaintMatch(expanded, exactLookup, allDBPaints);
        }
      }

      if (!info) {
        console.log(`[cdn] No match for paint: ${paint.name} (norm: ${norm})`);
        skipped++;
        continue;
      }

      stmts.push(
        buildUpdatePaintImagesStatement(db, info.className, imageURL, imageURL, imageURL, imageURL),
      );
      matched++;
    }

    for (const chunk of chunkArray(stmts, 500)) {
      await db.batch(chunk);
    }

    await updateSyncHistory(db, syncID, "success", matched, "");
    console.log(
      `[cdn] Paint sync complete: ${matched} matched, ${skipped} skipped, ${skippedPack} packs (${data.paints.length} total)`,
    );
    logEvent("sync_cdn_paints", {
      fetched: data.paints.length,
      matched,
      skipped,
      packs: skippedPack,
    });

    return { matched, skipped, skippedPack, total: data.paints.length };
  } catch (err) {
    await updateSyncHistory(db, syncID, "error", 0, String(err));
    throw err;
  }
}

// --- User-selected image apply ---

export interface NamedImage {
  name: string;
  imageURL: string;
}

export interface ApplyResult {
  ships: CDNSyncResult;
  paints: CDNSyncResult;
}

/**
 * Apply user-selected (name, imageURL) pairs directly to D1.
 * Called by the CDN image picker admin UI after the user has reviewed
 * all available images and chosen one per ship/paint.
 */
export async function applyImageSelections(
  db: D1Database,
  ships: NamedImage[],
  paints: NamedImage[],
): Promise<ApplyResult> {
  // --- Ships ---
  const vehicles = await getAllVehicleNameSlugs(db);
  const nameToSlug = new Map<string, string>();
  for (const v of vehicles) {
    nameToSlug.set(v.name.toLowerCase(), v.slug);
  }

  const shipStmts: D1PreparedStatement[] = [];
  let shipMatched = 0;
  let shipSkipped = 0;
  for (const { name, imageURL } of ships) {
    const slug = findVehicleSlug(name, nameToSlug);
    if (!slug) {
      console.log(`[cdn:apply] No slug for ship: ${name}`);
      shipSkipped++;
      continue;
    }
    shipStmts.push(
      ...buildUpdateVehicleImagesStatement(db, slug, imageURL, imageURL, imageURL, imageURL),
    );
    shipMatched++;
  }
  for (const chunk of chunkArray(shipStmts, 500)) {
    await db.batch(chunk);
  }

  // --- Paints ---
  const dbPaints = await getAllPaintNameClasses(db);
  const exactLookup = new Map<string, PaintInfo>();
  const allDBPaints: PaintInfo[] = [];
  for (const p of dbPaints) {
    const info: PaintInfo = {
      norm: normalizePaintName(p.name),
      className: p.class_name,
      hasImage: p.has_image,
    };
    exactLookup.set(info.norm, info);
    allDBPaints.push(info);
  }

  const paintStmts: D1PreparedStatement[] = [];
  let paintMatched = 0;
  let paintSkipped = 0;
  for (const { name, imageURL } of paints) {
    const norm = normalizeCDNPaintName(name);
    let info = findPaintMatch(norm, exactLookup, allDBPaints);
    if (!info) {
      const expanded = expandCDNPaintPrefix(norm);
      if (expanded !== norm) {
        info = findPaintMatch(expanded, exactLookup, allDBPaints);
      }
    }
    if (!info) {
      console.log(`[cdn:apply] No match for paint: ${name}`);
      paintSkipped++;
      continue;
    }
    paintStmts.push(
      buildUpdatePaintImagesStatement(db, info.className, imageURL, imageURL, imageURL, imageURL),
    );
    paintMatched++;
  }
  for (const chunk of chunkArray(paintStmts, 500)) {
    await db.batch(chunk);
  }

  logEvent("sync_cdn_apply", {
    ships_matched: shipMatched,
    ships_skipped: shipSkipped,
    paints_matched: paintMatched,
    paints_skipped: paintSkipped,
  });

  return {
    ships: { matched: shipMatched, skipped: shipSkipped, total: ships.length },
    paints: { matched: paintMatched, skipped: paintSkipped, total: paints.length },
  };
}
