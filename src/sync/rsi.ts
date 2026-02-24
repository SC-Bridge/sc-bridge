/**
 * RSI GraphQL API sync — ported from internal/rsi/
 *
 * Fetches ship and paint images from the RSI public store GraphQL API.
 * No authentication required — all browse queries are public.
 *
 * Key features:
 * - Batched GraphQL requests (RSI expects JSON array)
 * - Rate limiting with 429 retry
 * - Ship variant inheritance (unmatched variants get base vehicle images)
 * - Paint name expansion (abbreviated RSI ship names → full DB names)
 * - Media ID extraction for CDN URL size variants
 */

import {
  getAllVehicleNameSlugs,
  getAllPaintNameClasses,
  buildUpdateVehicleImagesStatement,
  buildUpdatePaintImagesStatement,
  insertSyncHistory,
  updateSyncHistory,
} from "../db/queries";
import { delay, chunkArray } from "../lib/utils";
import { SYNC_SOURCE } from "../lib/constants";
import { logEvent } from "../lib/logger";

// --- Constants ---
const PAGE_LIMIT = 100;
const MAX_RETRIES = 3;
const USER_AGENT = "Fleet-Manager/1.0 (Star Citizen fleet tracker)";
const GRAPHQL_PATH = "/graphql";

// --- GraphQL Types ---

interface BrowseResource {
  id: string;
  name: string;
  title: string;
  url: string;
  media: {
    thumbnail: {
      storeSmall: string;
    };
  };
  nativePrice: {
    amount: number;
  };
  isPackage: boolean;
}

interface BrowseListing {
  resources: BrowseResource[];
  count: number;
  totalCount: number;
}

interface BrowseResponse {
  store: {
    listing: BrowseListing;
  };
}

interface GraphQLResponse {
  data?: BrowseResponse;
  errors?: Array<{ message: string }>;
}

interface ImageSet {
  imageURL: string;
  small: string;
  medium: string;
  large: string;
}

interface PaintInfo {
  norm: string;
  className: string;
  hasImage: boolean;
}

// --- GraphQL Query ---

const browseQuery = `query GetBrowseItems($query: SearchQuery) {
	store(browse: true) {
		listing: search(query: $query) {
			resources {
				id
				name
				title
				url
				media {
					thumbnail {
						storeSmall
						__typename
					}
					__typename
				}
				nativePrice {
					amount
					__typename
				}
				... on TySku {
					isPackage
					__typename
				}
				__typename
			}
			count
			totalCount
			__typename
		}
		__typename
	}
}`;

// --- Ship name mapping (RSI name → DB name, both lowercased) ---

const shipNameMap: Record<string, string> = {
  "600i explorer": "600i",
  "600i touring": "600i",
  "a2 hercules": "a2 hercules starlifter",
  "c2 hercules": "c2 hercules starlifter",
  "m2 hercules": "m2 hercules starlifter",
  "ares inferno": "ares star fighter inferno",
  "ares ion": "ares star fighter ion",
  mercury: "mercury star runner",
  m50: "m50 interceptor",
  "85x": "85x limited",
  scythe: "vanduul scythe",
  stinger: "esperia stinger",
  merchantman: "banu merchantman",
  "dragonfly black": "dragonfly",
  "c8r pisces": "c8r pisces rescue",
  "anvil ballista dunestalker": "ballista dunestalker",
  "anvil ballista snowblind": "ballista snowblind",
  "argo mole carbon edition": "mole carbon",
  "argo mole talus edition": "mole talus",
  "caterpillar best in show edition 2949": "caterpillar 2949 best in show edition",
  "cutlass black best in show edition 2949": "cutlass black 2949 best in show edition",
  "hammerhead best in show edition 2949": "hammerhead 2949 best in show edition",
  "reclaimer best in show edition 2949": "reclaimer 2949 best in show edition",
  "gladius pirate edition": "gladius pirate",
  "caterpillar pirate edition": "caterpillar pirate",
  "f7c-m super hornet heartseeker mk i": "f7c-m hornet heartseeker mk i",
  "f7c-m super hornet heartseeker mk ii": "f7c-m hornet heartseeker mk ii",
  "f7c-m super hornet mk i": "f7c-m super hornet mk i",
  "f7c-m super hornet mk ii": "f7c-m super hornet mk ii",
  "f8c lightning executive edition": "f8c lightning executive edition",
  "constellation phoenix emerald": "constellation phoenix emerald",
  "san\u2019tok.y\u0101i": "san\u2019tok.y\u0101i",
  "carrack expedition w/c8x": "carrack expedition w/c8x",
  "carrack w/c8x": "carrack w/c8x",
};

// --- Paint ship aliases (abbreviated RSI ship name → full DB ship name) ---

const paintShipAliases: Record<string, string> = {
  ares: "Ares Star Fighter",
  hercules: "Hercules Starlifter",
  mercury: "Mercury Star Runner",
  f8c: "F8C Lightning",
  "f7 hornet mk i": "Hornet",
  "f7 hornet mk ii": "Hornet Mk II",
  "f7a hornet mk ii": "Hornet",
  "nova tank": "Nova",
  "san\u0027tok.y\u0101i": "San'tok.yai",
};

// --- GraphQL client ---

async function queryGraphQL(
  baseURL: string,
  query: string,
  variables: unknown,
  rateLimitMs: number,
  attempt = 0,
): Promise<BrowseResponse> {
  await delay(rateLimitMs);

  const batch = [{ query, variables }];

  const resp = await fetch(baseURL + GRAPHQL_PATH, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(batch),
  });

  if (resp.status === 429) {
    if (attempt >= MAX_RETRIES) {
      throw new Error(`Rate limited (429) after ${MAX_RETRIES} retries`);
    }
    const retryAfter = parseInt(resp.headers.get("Retry-After") ?? "5", 10);
    await delay(retryAfter * 1000);
    return queryGraphQL(baseURL, query, variables, rateLimitMs, attempt + 1);
  }

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`RSI GraphQL error (HTTP ${resp.status}): ${body.slice(0, 200)}`);
  }

  const responses = (await resp.json()) as GraphQLResponse[];
  if (!responses || responses.length === 0) {
    throw new Error("Empty GraphQL response");
  }

  if (responses[0].errors && responses[0].errors.length > 0) {
    throw new Error(`GraphQL error: ${responses[0].errors[0].message}`);
  }

  if (!responses[0].data) {
    throw new Error("No data in GraphQL response");
  }

  return responses[0].data;
}

// --- Image URL helpers ---

const mediaIDRegex = /media\.robertsspaceindustries\.com\/([^/]+)\//;

function buildImageURLs(url: string): ImageSet {
  const matches = url.match(mediaIDRegex);
  if (matches && matches[1]) {
    const base = "https://media.robertsspaceindustries.com/" + matches[1];
    // Preserve the file extension from the original URL — RSI uses .jpg for most
    // ships but .png for some (e.g. 85X Limited). Defaulting to .jpg causes 404s.
    const ext = url.match(/\.(png)$/i) ? ".png" : ".jpg";
    return {
      imageURL: base + "/store_large" + ext,
      small: base + "/store_small" + ext,
      medium: base + "/store_large" + ext,
      large: base + "/store_hub_large" + ext,
    };
  }

  // New CDN format — use as-is for all sizes
  return { imageURL: url, small: url, medium: url, large: url };
}

// --- Vehicle slug matching ---

function findVehicleSlug(rsiName: string, nameToSlug: Map<string, string>): string {
  const lower = rsiName.toLowerCase();

  // 1. Check shipNameMap first — explicit overrides take priority over DB name matches.
  //    This ensures entries like "600i touring" → "600i" work even when the DB has
  //    a vehicle named "600i Touring" that would otherwise be matched in step 2.
  const mapped = shipNameMap[lower];
  if (mapped) {
    const slug = nameToSlug.get(mapped);
    if (slug) return slug;
  }

  // 2. Direct name match
  const direct = nameToSlug.get(lower);
  if (direct) return direct;

  // 3. Try removing manufacturer prefix
  const spaceIdx = lower.indexOf(" ");
  if (spaceIdx > 0) {
    const withoutPrefix = lower.substring(spaceIdx + 1);
    const slug = nameToSlug.get(withoutPrefix);
    if (slug) return slug;

    // 4. Apply shipNameMap to the prefix-stripped name
    //    e.g. "Origin 600i Touring" → strip "Origin" → "600i Touring" → map → "600i"
    const reMapped = shipNameMap[withoutPrefix];
    if (reMapped) {
      const slug2 = nameToSlug.get(reMapped);
      if (slug2) return slug2;
    }
  }

  return "";
}

// --- Variant inheritance ---

function findBaseVehicleImages(
  vehicleName: string,
  rsiNameImages: Map<string, ImageSet>,
): ImageSet | null {
  const words = vehicleName.toLowerCase().split(/\s+/);

  // Try progressively shorter prefixes
  for (let length = words.length - 1; length >= 1; length--) {
    const prefix = words.slice(0, length).join(" ");
    const img = rsiNameImages.get(prefix);
    if (img) return img;
  }

  return null;
}

// --- Paint name helpers ---

const yearRegex = /\b\d{4}\b/g;

function normalizePaintName(name: string): string {
  let n = name.toLowerCase().trim();
  n = n.replace(/ paint$/, "");
  n = n.replace(/ livery$/, "");
  n = n.replace(/ skin$/, "");
  // Normalize unicode diacritics and curly apostrophes
  n = n
    .replace(/\u0101/g, "a") // ā → a
    .replace(/\u0113/g, "e") // ē → e
    .replace(/\u012b/g, "i") // ī → i
    .replace(/\u014d/g, "o") // ō → o
    .replace(/\u016b/g, "u") // ū → u
    .replace(/\u2019/g, "'") // ' → '
    .replace(/\u2018/g, "'") // ' → '
    .replace(/\u02bc/g, "'"); // ʼ → '
  // Fix known misspellings
  n = n.replace(/bushwacker/g, "bushwhacker");
  return n;
}

function buildPaintFullName(itemName: string): string {
  const parts = itemName.split(" - ");
  if (parts.length < 2) return "";
  const ship = parts[0].trim();
  const paint = parts.slice(1).join(" - ").trim();
  return ship + " " + paint;
}

function expandRSIPaintName(name: string): string {
  const parts = name.split(" - ");
  if (parts.length < 2) return name;

  const ship = parts[0].trim();
  const paint = parts.slice(1).join(" - ").trim();
  const lower = ship.toLowerCase();

  const expanded = paintShipAliases[lower];
  if (expanded) {
    return expanded + " - " + paint;
  }

  return name;
}

function stripYears(s: string): string {
  const result = s.replace(yearRegex, "");
  return result.split(/\s+/).filter(Boolean).join(" ");
}

function findPaintMatch(
  norm: string,
  exactLookup: Map<string, PaintInfo>,
  allDBPaints: PaintInfo[],
): PaintInfo | null {
  // 1. Exact match
  const exact = exactLookup.get(norm);
  if (exact) return exact;

  // 2. Prefix: RSI name is prefix of DB name
  for (const info of allDBPaints) {
    if (info.norm.startsWith(norm)) return info;
  }

  // 3. Year-stripped match
  const normNoYear = stripYears(norm);
  for (const info of allDBPaints) {
    if (stripYears(info.norm) === normNoYear) return info;
  }

  return null;
}

// --- Ship image sync ---

export async function syncShipImages(
  db: D1Database,
  baseURL: string,
  rateLimitMs: number,
): Promise<void> {
  const syncID = await insertSyncHistory(db, SYNC_SOURCE.RSI_API, "ships", "running");

  try {
    console.log("[rsi] Ship image sync starting");

    // Fetch all ships (paginated)
    const allShips: BrowseResource[] = [];
    for (let page = 1; ; page++) {
      const variables = {
        query: {
          page,
          limit: PAGE_LIMIT,
          ships: { all: true },
          sort: { field: "name", direction: "asc" },
        },
      };

      const data = await queryGraphQL(baseURL, browseQuery, variables, rateLimitMs);
      allShips.push(...data.store.listing.resources);

      console.log(
        `[rsi] Ships page ${page}: ${data.store.listing.count} items, ${allShips.length}/${data.store.listing.totalCount} total`,
      );

      if (data.store.listing.count === 0 || allShips.length >= data.store.listing.totalCount) {
        break;
      }
    }

    console.log(`[rsi] Fetched ${allShips.length} ships from RSI API`);

    // Load DB vehicles for matching
    const vehicles = await getAllVehicleNameSlugs(db);
    const nameToSlug = new Map<string, string>();
    for (const v of vehicles) {
      nameToSlug.set(v.name.toLowerCase(), v.slug);
    }

    // slug → images for direct matches
    const slugImages = new Map<string, ImageSet>();
    // RSI name (lowercased) → images for variant inheritance
    const rsiNameImages = new Map<string, ImageSet>();

    let skipped = 0;

    for (const ship of allShips) {
      const name = ship.name || ship.title;
      if (!name) continue;

      const imageURL = ship.media?.thumbnail?.storeSmall;
      if (!imageURL) continue;

      const images = buildImageURLs(imageURL);
      rsiNameImages.set(name.toLowerCase(), images);

      const slug = findVehicleSlug(name, nameToSlug);
      if (!slug) {
        skipped++;
        continue;
      }

      slugImages.set(slug, images);
    }

    // Collect all image update statements for batching
    const stmts: D1PreparedStatement[] = [];

    let matched = 0;
    for (const [slug, img] of slugImages) {
      stmts.push(buildUpdateVehicleImagesStatement(db, slug, img.imageURL, img.small, img.medium, img.large));
      matched++;
    }

    // Variant inheritance: for unmatched DB vehicles, try base vehicle image
    let inherited = 0;
    for (const v of vehicles) {
      if (slugImages.has(v.slug)) continue;

      // Pass 1: RSI name prefix match (e.g. "Dragonfly Black" prefix for "Dragonfly Star Kitten")
      const baseImg = findBaseVehicleImages(v.name, rsiNameImages);
      if (baseImg) {
        stmts.push(buildUpdateVehicleImagesStatement(db, v.slug, baseImg.imageURL, baseImg.small, baseImg.medium, baseImg.large));
        inherited++;
        continue;
      }

      // Pass 2: DB name prefix match against vehicles that already have matched images
      // e.g. "Ares Star Fighter Inferno Wikelo War Special" → prefix "ares star fighter inferno" → slug in slugImages
      const words = v.name.toLowerCase().split(/\s+/);
      for (let len = words.length - 1; len >= 1; len--) {
        const prefix = words.slice(0, len).join(" ");
        const baseSlug = nameToSlug.get(prefix);
        if (baseSlug && slugImages.has(baseSlug)) {
          const img = slugImages.get(baseSlug)!;
          stmts.push(buildUpdateVehicleImagesStatement(db, v.slug, img.imageURL, img.small, img.medium, img.large));
          inherited++;
          break;
        }
      }
    }

    // Execute all updates in batched chunks (D1 limit: 1000 statements per batch)
    for (const chunk of chunkArray(stmts, 500)) {
      await db.batch(chunk);
    }

    const total = matched + inherited;
    await updateSyncHistory(db, syncID, "success", total, "");
    console.log(
      `[rsi] Ship image sync complete: ${matched} matched, ${inherited} inherited, ${skipped} skipped (${allShips.length} RSI ships)`,
    );
    logEvent("sync_rsi_ships", {
      fetched: allShips.length,
      matched,
      inherited,
      skipped,
    });
  } catch (err) {
    await updateSyncHistory(db, syncID, "error", 0, String(err));
    throw err;
  }
}

// --- Paint image sync ---

export async function syncPaintImages(
  db: D1Database,
  baseURL: string,
  rateLimitMs: number,
): Promise<void> {
  const syncID = await insertSyncHistory(db, SYNC_SOURCE.RSI_API, "paints", "running");

  try {
    console.log("[rsi] Paint image sync starting");

    // Fetch all paints (paginated)
    const allPaints: BrowseResource[] = [];
    for (let page = 1; ; page++) {
      const variables = {
        query: {
          page,
          limit: PAGE_LIMIT,
          skus: {
            filtersFromTags: {
              tagIdentifiers: ["weight", "desc"],
              facetIdentifiers: ["paints"],
            },
            products: [268],
          },
          sort: { field: "weight", direction: "desc" },
        },
      };

      const data = await queryGraphQL(baseURL, browseQuery, variables, rateLimitMs);
      allPaints.push(...data.store.listing.resources);

      console.log(
        `[rsi] Paints page ${page}: ${data.store.listing.count} items, ${allPaints.length}/${data.store.listing.totalCount} total`,
      );

      if (data.store.listing.count === 0 || allPaints.length >= data.store.listing.totalCount) {
        break;
      }
    }

    console.log(`[rsi] Fetched ${allPaints.length} paints from RSI API`);

    // Load DB paints for matching
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

    let matched = 0;
    let skippedNoImage = 0;
    let skippedNoMatch = 0;
    let skippedPackage = 0;
    const paintStmts: D1PreparedStatement[] = [];

    for (const paint of allPaints) {
      if (paint.isPackage) {
        skippedPackage++;
        continue;
      }

      const imageURL = paint.media?.thumbnail?.storeSmall;
      if (!imageURL) {
        skippedNoImage++;
        continue;
      }

      let name = paint.name || paint.title;
      if (!name) continue;

      // Expand abbreviated ship names before matching
      name = expandRSIPaintName(name);

      // Convert "Ship - Paint Name" → "Ship Paint Name" for DB matching
      let fullName = buildPaintFullName(name);
      if (!fullName) fullName = name;

      const norm = normalizePaintName(fullName);
      const info = findPaintMatch(norm, exactLookup, allDBPaints);
      if (!info) {
        skippedNoMatch++;
        continue;
      }

      const images = buildImageURLs(imageURL);
      paintStmts.push(buildUpdatePaintImagesStatement(db, info.className, images.imageURL, images.small, images.medium, images.large));
      matched++;
    }

    // Execute all paint image updates in batched chunks
    for (const chunk of chunkArray(paintStmts, 500)) {
      await db.batch(chunk);
    }

    await updateSyncHistory(db, syncID, "success", matched, "");
    console.log(
      `[rsi] Paint image sync complete: ${matched} matched, ${skippedNoImage} no image, ${skippedNoMatch} no match, ${skippedPackage} packages (${allPaints.length} RSI paints)`,
    );
    logEvent("sync_rsi_paints", {
      fetched: allPaints.length,
      matched,
      no_image: skippedNoImage,
      no_match: skippedNoMatch,
    });
  } catch (err) {
    await updateSyncHistory(db, syncID, "error", 0, String(err));
    throw err;
  }
}

// --- Combined sync ---

export async function syncAll(
  db: D1Database,
  baseURL: string,
  rateLimitMs: number,
): Promise<void> {
  try {
    await syncShipImages(db, baseURL, rateLimitMs);
  } catch (err) {
    console.error("[rsi] Ship image sync failed:", err);
  }

  try {
    await syncPaintImages(db, baseURL, rateLimitMs);
  } catch (err) {
    console.error("[rsi] Paint image sync failed:", err);
  }
}
