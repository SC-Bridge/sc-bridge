/**
 * Fleetyards paint image sync → CF Images (THROWAWAY — delete after use)
 *
 * Fetches paint images from the Fleetyards public API, uploads them to
 * Cloudflare Images, and stores the delivery URLs in our DB.
 *
 * Replaces ALL matched paint images (existing and missing) with higher-quality
 * Fleetyards versions uploaded to our own CDN.
 */

import {
  getAllPaintNameClasses,
  buildUpdatePaintImagesStatement,
} from "../db/queries";
import {
  normalizePaintName,
  findPaintMatch,
  paintShipAliases,
  type PaintInfo,
} from "./rsi";
import { uploadToCFImages } from "../lib/cfImages";
import { delay, chunkArray } from "../lib/utils";

// --- Fleetyards API types ---

interface FleetyardsModelPaint {
  id: string;
  name: string;
  nameWithModel: string;
  slug: string;
  hasStoreImage: boolean;
  storeImage: string;
  storeImageSmall: string;
  storeImageMedium: string;
  storeImageLarge: string;
}

interface SyncResult {
  matched: number;
  uploaded: number;
  skippedExisting: number;
  failed: string[];
  unmatched: string[];
  remaining: number;
}

const FLEETYARDS_API = "https://api.fleetyards.net/v1";
const PER_PAGE = 100;
const USER_AGENT = "SCBridge/1.0 (Star Citizen fleet tracker)";

// --- Fleetyards ship name → our DB ship name aliases ---

/**
 * Maps Fleetyards ship names (lowercased) to our DB ship names.
 * Checked BEFORE the shared paintShipAliases from rsi.ts.
 */
const fleetyardsShipAliases: Record<string, string> = {
  // 100 Series — FY uses "100i", we use "100 Series"
  "100i": "100 Series",
  // 300 Series — FY uses individual models, we use "300 Series" for shared paints
  "300i": "300 Series",
  "315p": "300 Series",
  "325a": "300 Series",
  "350r": "300 Series",
  // 600i — FY splits by variant, we have "600i" as base
  "600i explorer": "600i",
  "600i executive-edition": "600i Executive Edition",
  // Hercules — FY omits "Starlifter"
  "a2 hercules": "A2 Hercules Starlifter",
  "c2 hercules": "C2 Hercules Starlifter",
  "m2 hercules": "M2 Hercules Starlifter",
  // Ares — FY omits "Star Fighter"
  "ares inferno": "Ares Star Fighter Inferno",
  "ares ion": "Ares Star Fighter Ion",
  // Dragonfly
  "dragonfly black": "Dragonfly",
  "dragonfly starkitten edition": "Dragonfly Star Kitten",
  // Hornets — FY adds "Super" to Heartseeker
  "f7c-m super hornet heartseeker mk i": "F7C-M Hornet Heartseeker Mk I",
  // Other naming differences
  "gladius pirate edition": "Gladius Pirate",
  "m50": "M50 Interceptor",
  "retaliator bomber": "Retaliator",
  "c8r pisces": "C8R Pisces Rescue",
  "stinger": "Esperia Stinger",
};

// --- Fleetyards name → DB name conversion ---

/**
 * Convert Fleetyards `nameWithModel` ("Cutlass Black - 2949 Best in Show")
 * into a normalized paint name matching our DB format ("cutlass black 2949 best in show").
 *
 * Steps:
 * 1. Split on " - " separator → ship part + paint part
 * 2. Expand ship names via fleetyardsShipAliases then paintShipAliases
 * 3. Rejoin as "Ship Paint" (no separator)
 * 4. Run through normalizePaintName() for final normalization
 */
function normalizeFleetyardsName(nameWithModel: string): string {
  const parts = nameWithModel.split(" - ");
  if (parts.length < 2) {
    return normalizePaintName(nameWithModel);
  }

  let ship = parts[0].trim();
  const paint = parts.slice(1).join(" - ").trim();

  // Check Fleetyards-specific aliases first, then shared aliases
  const fyAlias = fleetyardsShipAliases[ship.toLowerCase()];
  if (fyAlias) {
    ship = fyAlias;
  } else {
    const alias = paintShipAliases[ship.toLowerCase()];
    if (alias) {
      ship = alias;
    }
  }

  return normalizePaintName(ship + " " + paint);
}

// --- Fetch all pages from Fleetyards API ---

async function fetchAllFleetyardsPaints(): Promise<FleetyardsModelPaint[]> {
  const allPaints: FleetyardsModelPaint[] = [];

  for (let page = 1; ; page++) {
    const url = `${FLEETYARDS_API}/model-paints?perPage=${PER_PAGE}&page=${page}`;

    const resp = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    });

    if (!resp.ok) {
      throw new Error(`Fleetyards API error (HTTP ${resp.status}): ${(await resp.text()).slice(0, 200)}`);
    }

    const items = (await resp.json()) as FleetyardsModelPaint[];
    allPaints.push(...items);

    console.log(`[fleetyards] Page ${page}: ${items.length} items (${allPaints.length} total)`);

    // If we got fewer than perPage, we've hit the last page
    if (items.length < PER_PAGE) break;

    // Small delay between page fetches to be polite
    await delay(200);
  }

  return allPaints;
}

// --- Main sync function ---

export async function syncFleetyardsPaintImages(
  db: D1Database,
  accountId: string,
  token: string,
  accountHash: string,
  uploadLimit = 100,
): Promise<SyncResult> {
  console.log("[fleetyards] Paint image sync starting");

  // 1. Fetch all Fleetyards paints
  const fyPaints = await fetchAllFleetyardsPaints();
  console.log(`[fleetyards] Fetched ${fyPaints.length} paints from Fleetyards API`);

  // 2. Load all DB paints
  const dbPaints = await getAllPaintNameClasses(db);
  console.log(`[fleetyards] ${dbPaints.length} DB paints total`);

  // Track which paints already have CF Images URLs (uploaded in a previous run)
  const hasCFImage = new Set<string>();
  const exactLookup = new Map<string, PaintInfo>();
  const allDBPaints: PaintInfo[] = [];
  for (const p of dbPaints) {
    const info: PaintInfo = {
      norm: normalizePaintName(p.name),
      className: p.class_name,
      hasImage: p.has_image,
    };
    if (p.image_url?.startsWith("https://imagedelivery.net/")) {
      hasCFImage.add(p.class_name);
    }
    exactLookup.set(info.norm, info);
    allDBPaints.push(info);
  }

  // 3. Match Fleetyards paints → DB paints, skip already-uploaded
  const toUpload: Array<{
    fyPaint: FleetyardsModelPaint;
    dbPaint: PaintInfo;
  }> = [];
  const unmatched: string[] = [];
  let skippedExisting = 0;

  for (const fy of fyPaints) {
    if (!fy.hasStoreImage || !fy.storeImage) continue;

    const norm = normalizeFleetyardsName(fy.nameWithModel);
    const match = findPaintMatch(norm, exactLookup, allDBPaints);

    if (match) {
      exactLookup.delete(match.norm);
      if (hasCFImage.has(match.className)) {
        skippedExisting++;
      } else {
        toUpload.push({ fyPaint: fy, dbPaint: match });
      }
    } else {
      unmatched.push(fy.nameWithModel);
    }
  }

  // Apply upload limit to stay under Workers subrequest cap
  const batch = toUpload.slice(0, uploadLimit);
  const remaining = toUpload.length - batch.length;

  console.log(
    `[fleetyards] ${toUpload.length} need upload, ${skippedExisting} already have CF Images, ${unmatched.length} unmatched. Processing ${batch.length} this run.`,
  );

  // 4. Upload to CF Images sequentially to control subrequest count
  const failed: string[] = [];
  const stmts: D1PreparedStatement[] = [];
  let hitLimit = false;

  for (const { fyPaint, dbPaint } of batch) {
    if (hitLimit) break;
    try {
      const cfId = await uploadToCFImages(accountId, token, fyPaint.storeImage, {
        paint_class: dbPaint.className,
        source: "fleetyards",
      });

      const base = `https://imagedelivery.net/${accountHash}/${cfId}`;
      stmts.push(
        buildUpdatePaintImagesStatement(
          db,
          dbPaint.className,
          `${base}/medium`,  // image_url
          `${base}/thumb`,   // small
          `${base}/medium`,  // medium
          `${base}/large`,   // large
        ),
      );
    } catch (err) {
      const msg = String(err);
      if (msg.includes("Too many subrequests")) {
        console.log(`[fleetyards] Hit subrequest limit after ${stmts.length} uploads`);
        hitLimit = true;
      } else {
        failed.push(`${dbPaint.className}: ${msg}`);
        console.error(`[fleetyards] CF upload failed for ${dbPaint.className}:`, err);
      }
    }
  }

  // 5. Batch update DB
  const uploaded = stmts.length;
  for (const chunk of chunkArray(stmts, 100)) {
    await db.batch(chunk);
  }

  console.log(
    `[fleetyards] Paint image sync complete: ${uploaded} uploaded, ${failed.length} failed, ${remaining} remaining`,
  );

  return {
    matched: batch.length,
    uploaded,
    skippedExisting,
    failed,
    unmatched: unmatched.slice(0, 50),
    remaining,
  };
}
