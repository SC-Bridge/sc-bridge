/**
 * RSI GraphQL API sync — ported from internal/rsi/
 *
 * Fetches ship images from the RSI public store GraphQL API.
 * No authentication required — all browse queries are public.
 * Paint images are managed via manual upload — no automated sync.
 *
 * Key features:
 * - Batched GraphQL requests (RSI expects JSON array)
 * - Rate limiting with 429 retry
 * - Ship variant inheritance (unmatched variants get base vehicle images)
 * - Media ID extraction for CDN URL size variants
 */

import {
  getAllVehicleNameSlugs,
  buildUpdateVehicleImagesStatement,
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

export const shipNameMap: Record<string, string> = {
  "600i explorer": "600i", // RSI calls it Explorer; our DB slug is just "600i"
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
  "dragonfly black": "dragonfly",
  "c8r pisces": "c8r pisces rescue",
  "anvil ballista dunestalker": "ballista dunestalker",
  "anvil ballista snowblind": "ballista snowblind",
  "argo mole carbon edition": "mole carbon",
  "argo mole talus edition": "mole talus",
  "caterpillar best in show edition 2949": "caterpillar 2949 best in show edition",
  // DB has "Drake Cutlass 2949 Best In Show Edition" (no "Black" in middle)
  "cutlass black best in show edition 2949": "cutlass 2949 best in show edition",
  "hammerhead best in show edition 2949": "hammerhead 2949 best in show edition",
  "reclaimer best in show edition 2949": "reclaimer 2949 best in show edition",
  "valkyrie liberator edition": "valkyrie liberator",
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
  // UTV — RSI lists as just "UTV", DB has "Greycat UTV" (with manufacturer prefix)
  utv: "greycat utv",
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

export function findVehicleSlug(rsiName: string, nameToSlug: Map<string, string>): string {
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
      stmts.push(...buildUpdateVehicleImagesStatement(db, slug, img.imageURL, img.small, img.medium, img.large));
      matched++;
    }

    // Variant inheritance: for unmatched DB vehicles, try base vehicle image
    let inherited = 0;
    for (const v of vehicles) {
      if (slugImages.has(v.slug)) continue;

      // Pass 1: RSI name prefix match (e.g. "Dragonfly Black" prefix for "Dragonfly Star Kitten")
      const baseImg = findBaseVehicleImages(v.name, rsiNameImages);
      if (baseImg) {
        stmts.push(...buildUpdateVehicleImagesStatement(db, v.slug, baseImg.imageURL, baseImg.small, baseImg.medium, baseImg.large));
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
          stmts.push(...buildUpdateVehicleImagesStatement(db, v.slug, img.imageURL, img.small, img.medium, img.large));
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

// --- Ship matrix sync (production status) ---
//
// RSI publishes a public JSON endpoint at /ship-matrix/index listing every
// pledgeable ship with its current production_status ("flight-ready" or
// "in-concept"). This is the authoritative live source — it reflects store
// updates within hours, unlike p4k/DataCore which only changes on patch day.
//
// Our DB stores production_status as an FK to production_statuses which uses
// underscore keys (flight_ready, in_concept). The ship-matrix API uses hyphens.

interface ShipMatrixShip {
  id: number;
  name: string;
  production_status: string;
  chassis_id: number;
  // Additional fields used for backfilling concept ships without p4k data.
  // All can be null in the response; we only UPDATE when the DB column is NULL.
  cargocapacity: number | null;
  scm_speed: number | null;
  type: string | null; // combat / transport / industrial / exploration / multi / competition / support / ground
  size: string | null; // small / medium / large / capital / snub / vehicle
  // ── Extended 2026-04-15 — concept-ship gap closure ────────────
  // Physical + meta fields the ship-matrix publishes that were previously
  // unread by the poller. Values arrive as strings ("120") or numbers;
  // coerce via toNumber. See reference_fps_ammo_damage_thermal_drift.md
  // for plan docs/2026-04-15-scbridge-launch-cutover.md Phase 6.
  length: string | number | null;
  beam: string | number | null;
  height: string | number | null;
  mass: string | number | null;
  min_crew: string | number | null;
  max_crew: string | number | null;
  classification: string | null;
  focus: string | null;
  url: string | null;
  price: string | number | null;
  manufacturer: { code?: string; name?: string } | null;
}

interface ShipMatrixResponse {
  success: number;
  data: ShipMatrixShip[];
}

const SHIP_MATRIX_URL = "https://robertsspaceindustries.com/ship-matrix/index";

/**
 * Coerce string|number|null → number|null.
 * Ship-matrix returns numeric fields as strings ("120") or numbers or null.
 * Treats empty string as null. Returns null for unparseable.
 */
function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/** Map RSI's status values to our production_statuses.key values. */
function normalizeProductionStatus(rsi: string | null | undefined): string | null {
  if (!rsi) return null;
  const lower = rsi.toLowerCase().trim();
  if (lower === "flight-ready") return "flight_ready";
  if (lower === "in-concept") return "in_concept";
  if (lower === "in-production") return "in_production";
  return null;
}

/**
 * Manufacturer prefixes we strip from DB vehicle names before matching against
 * the ship-matrix API. Ordered longest-first so "Origin Jumpworks" matches
 * before "Origin". Everything is lowercased for comparison.
 */
const MANUFACTURER_PREFIXES = [
  // Multi-word manufacturers first (longest match wins)
  "origin jumpworks",
  "drake interplanetary",
  "anvil aerospace",
  "roberts space industries",
  "consolidated outland",
  "crusader industries",
  "argo astronautics",
  "kruger intergalactic",
  "greycat industrial",
  "banu souli",
  // Single-word manufacturers
  "origin",
  "anvil",
  "drake",
  "aegis",
  "misc",
  "mirai",
  "crusader",
  "argo",
  "tumbril",
  "esperia",
  "atls",
  "kruger",
  "greycat",
  "aopoa",
  "rsi",
  "c.o.",
  "banu",
  "gatac",
  "grey's",
];

/** Strip the leading manufacturer word(s) from a vehicle name. Returns the
 * stripped name (lowercased) + the original name lowercased. */
function stripManufacturerPrefix(name: string): string {
  const lower = name.toLowerCase().replace(/\s+/g, " ").trim();
  for (const prefix of MANUFACTURER_PREFIXES) {
    if (lower.startsWith(prefix + " ")) {
      return lower.substring(prefix.length + 1).trim();
    }
  }
  return lower;
}

/** D1 caps one statement at 100 bound parameters (SQLITE_MAX_VARIABLE_NUMBER). */
export const D1_MAX_BINDS = 100;

/**
 * is_pledgeable: 1 for ships matched in the ship-matrix, 0 for unmatched
 * vehicles that came from p4k (uuid set — real in-game variants / mission
 * props). NULL-uuid concept ships that didn't match are either mis-named or
 * removed from the store — they keep their existing value.
 *
 * One atomic batch: reset p4k vehicles to 0, then flag the matched ids in
 * chunks of D1_MAX_BINDS. The previous single `id IN (...)` statement bound
 * every matched id (~300) at once, exceeded D1's limit, and rolled back the
 * whole final batch of the nightly sync (production_status errored daily
 * with "too many SQL variables" from 2026-04-21).
 */
export async function applyPledgeableFlags(
  db: D1Database,
  matchedIds: number[],
): Promise<void> {
  if (matchedIds.length === 0) return;
  const statements: D1PreparedStatement[] = [
    db.prepare(
      `UPDATE vehicles SET is_pledgeable = 0
         WHERE removed = 0 AND is_deleted = 0
           AND uuid IS NOT NULL AND uuid != ''`,
    ),
  ];
  for (const ids of chunkArray(matchedIds, D1_MAX_BINDS)) {
    const placeholders = ids.map(() => "?").join(",");
    statements.push(
      db
        .prepare(`UPDATE vehicles SET is_pledgeable = 1 WHERE id IN (${placeholders})`)
        .bind(...ids),
    );
  }
  await db.batch(statements);
}

/**
 * Fetch the live ship-matrix and update vehicles.production_status_id.
 * Also maintains is_pledgeable: ships found in the matrix are pledgeable (1),
 * ships not found are non-pledgeable variants or mission props (0).
 *
 * Matching strategy:
 *   1. Apply shipNameMap to the RSI name (e.g. "600i Explorer" → "600i")
 *   2. Direct match against DB name (lowercased)
 *   3. Build a "prefix-stripped" index of DB names (e.g. "RSI Aurora Mk I MR" → "aurora mk i mr")
 *      and match against that
 */
export async function syncShipProductionStatus(db: D1Database): Promise<void> {
  const syncID = await insertSyncHistory(
    db,
    SYNC_SOURCE.RSI_API,
    "production_status",
    "running",
  );

  try {
    console.log("[rsi] Ship production status sync starting");

    // Fetch ship-matrix
    const resp = await fetch(SHIP_MATRIX_URL, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    });
    if (!resp.ok) {
      throw new Error(`Ship matrix fetch failed: HTTP ${resp.status}`);
    }
    const payload = (await resp.json()) as ShipMatrixResponse;
    if (payload.success !== 1 || !Array.isArray(payload.data)) {
      throw new Error("Ship matrix returned invalid payload");
    }
    const rsiShips = payload.data;
    console.log(`[rsi] Fetched ${rsiShips.length} ships from ship-matrix`);

    // Load all DB vehicles (latest game version) for matching.
    // We fetch current values for the columns we might backfill — only fill
    // NULLs, never overwrite p4k-sourced data.
    const { results: dbVehicles } = await db
      .prepare(
        `SELECT v.id, v.name, v.slug, v.cargo, v.vehicle_type,
                v.speed_scm, v.production_status_id, v.class_name,
                v.length, v.beam, v.height, v.mass,
                v.crew_min, v.crew_max, v.classification, v.focus,
                v.pledge_url, v.pledge_price, v.manufacturer_code,
                v.manufacturer_id, v.size, v.size_label
           FROM vehicles v
          WHERE v.removed = 0
            AND v.is_deleted = 0`,
      )
      .all<{
        id: number;
        name: string;
        slug: string;
        cargo: number | null;
        vehicle_type: string | null;
        speed_scm: number | null;
        production_status_id: number | null;
        class_name: string | null;
        length: number | null;
        beam: number | null;
        height: number | null;
        mass: number | null;
        crew_min: number | null;
        crew_max: number | null;
        classification: string | null;
        focus: string | null;
        pledge_url: string | null;
        pledge_price: number | null;
        manufacturer_code: string | null;
        manufacturer_id: number | null;
        size: number | null;
        size_label: string | null;
      }>();

    // Index rows by id for backfill lookups.
    const dbById = new Map<number, typeof dbVehicles[0]>();
    for (const v of dbVehicles) dbById.set(v.id, v);

    // Build lookup indexes.
    // 1. Direct name match (full lowercase name → id)
    const directNameToId = new Map<string, number>();
    // 2. Prefix-stripped name match (bare name → [ids])
    const strippedNameToIds = new Map<string, number[]>();
    // 3. Slug match (slug → id) for final fallback
    const slugToId = new Map<string, number>();

    for (const v of dbVehicles) {
      const fullLower = v.name.toLowerCase().replace(/\s+/g, " ").trim();
      directNameToId.set(fullLower, v.id);

      const stripped = stripManufacturerPrefix(v.name);
      if (stripped !== fullLower) {
        const existing = strippedNameToIds.get(stripped);
        if (existing) {
          existing.push(v.id);
        } else {
          strippedNameToIds.set(stripped, [v.id]);
        }
      }

      if (v.slug) slugToId.set(v.slug.toLowerCase(), v.id);
    }

    // Look up production_status IDs
    const { results: statusRows } = await db
      .prepare(`SELECT id, key FROM production_statuses`)
      .all<{ id: number; key: string }>();
    const statusKeyToId = new Map<string, number>();
    for (const s of statusRows) statusKeyToId.set(s.key, s.id);

    // Match ships and collect updates. RSI ship-matrix is the authoritative
    // source for production_status. It's also the ONLY source for cargo /
    // vehicle_type / speed_scm on RSI-only concept ships (Galaxy, Kraken,
    // Orion etc.) that exist in our DB via seed but have no p4k entity data.
    //
    // Backfill rule: only UPDATE when the DB column is NULL. p4k data wins
    // over RSI when both exist (p4k is authoritative for per-ship mechanics).
    const matchedIds = new Set<number>();
    const statusUpdates: Array<{ id: number; statusId: number }> = [];
    const cargoUpdates: Array<{ id: number; cargo: number }> = [];
    const vtypeUpdates: Array<{ id: number; vehicleType: string }> = [];
    const scmUpdates: Array<{ id: number; speedScm: number }> = [];
    // ── Extended 2026-04-15: physical + meta fields ─────────────
    const lengthUpdates: Array<{ id: number; length: number }> = [];
    const beamUpdates: Array<{ id: number; beam: number }> = [];
    const heightUpdates: Array<{ id: number; height: number }> = [];
    const massUpdates: Array<{ id: number; mass: number }> = [];
    const crewMinUpdates: Array<{ id: number; crewMin: number }> = [];
    const crewMaxUpdates: Array<{ id: number; crewMax: number }> = [];
    const classificationUpdates: Array<{ id: number; classification: string }> = [];
    const focusUpdates: Array<{ id: number; focus: string }> = [];
    const pledgeUrlUpdates: Array<{ id: number; url: string }> = [];
    const pledgePriceUpdates: Array<{ id: number; price: number }> = [];
    const mfrCodeUpdates: Array<{ id: number; code: string }> = [];
    // F234: RSI ship-matrix provides a size string (snub/small/medium/large/capital/vehicle)
    // for ships where the p4k extractor had no bounding-box dimensions (Javelin,
    // Hurricane, Paladin, MOTH, Syulen, etc.). Backfill size + size_label when
    // p4k came back null. Int `size` codes match the pipeline extractor:
    //   snub=1 small=2 medium=3 large=4 capital=5 vehicle=0 (ground)
    const sizeUpdates: Array<{ id: number; sizeInt: number; sizeLabel: string }> = [];
    const RSI_SIZE_TO_INT: Record<string, number> = {
      snub: 1, small: 2, medium: 3, large: 4, capital: 5, vehicle: 0,
    };
    let unmatched = 0;
    const unmatchedNames: string[] = [];

    for (const ship of rsiShips) {
      const shipName = (ship.name || "").trim();
      if (!shipName) continue;

      const normalizedStatus = normalizeProductionStatus(ship.production_status);
      const statusId = normalizedStatus ? statusKeyToId.get(normalizedStatus) : undefined;
      // We can still apply cargo / vehicle_type / speed_scm even when the
      // production status is missing — those are independent columns.
      if (!normalizedStatus) {
        console.log(
          `[rsi] Unknown status for ${shipName}: ${ship.production_status}`,
        );
      } else if (!statusId) {
        console.log(
          `[rsi] No production_statuses row for ${normalizedStatus} (${shipName})`,
        );
      }

      // Try each matching strategy in order
      const lower = shipName.toLowerCase().replace(/\s+/g, " ").trim();
      let dbId: number | undefined;

      // 1. shipNameMap override (handles "600i explorer" → "600i" etc.)
      const mapped = shipNameMap[lower];
      if (mapped) {
        dbId = directNameToId.get(mapped);
        if (!dbId) {
          const stripIds = strippedNameToIds.get(mapped);
          if (stripIds && stripIds.length === 1) dbId = stripIds[0];
        }
      }

      // 2. Direct full-name match (rare — RSI names usually don't have manufacturer prefix)
      if (!dbId) dbId = directNameToId.get(lower);

      // 3. Prefix-stripped match (most common path)
      if (!dbId) {
        const stripIds = strippedNameToIds.get(lower);
        if (stripIds && stripIds.length === 1) {
          dbId = stripIds[0];
        } else if (stripIds && stripIds.length > 1) {
          console.log(
            `[rsi] Ambiguous stripped-name match for ${shipName}: ${stripIds.length} candidates`,
          );
        }
      }

      if (!dbId) {
        unmatched++;
        if (unmatchedNames.length < 20) unmatchedNames.push(shipName);
        continue;
      }

      matchedIds.add(dbId);
      const dbRow = dbById.get(dbId);
      if (!dbRow) continue; // defensive — shouldn't happen

      // production_status (always update if we have a valid statusId — keep
      // the existing behavior where RSI wins because production status is an
      // RSI concern, not a p4k one).
      if (statusId) statusUpdates.push({ id: dbId, statusId });

      // cargo — only fill if DB is NULL. Accept 0 as a valid value.
      if (dbRow.cargo === null && typeof ship.cargocapacity === "number") {
        cargoUpdates.push({ id: dbId, cargo: ship.cargocapacity });
      }

      // vehicle_type — only fill if NULL. ship-matrix 'type' values map to
      // our convention: 'ground' → ground_vehicle, everything else → spaceship.
      // (We don't have a reliable gravlev distinction from ship-matrix alone;
      // gravlev vehicles mostly come from p4k with correct vehicle_type already.)
      if (dbRow.vehicle_type === null && ship.type) {
        const vt = ship.type.toLowerCase() === "ground" ? "ground_vehicle" : "spaceship";
        vtypeUpdates.push({ id: dbId, vehicleType: vt });
      }

      // speed_scm — only fill if NULL AND the RSI value is > 0. RSI publishes
      // 0 for many concepts without finalized flight mechanics; we'd rather
      // leave those NULL than misrepresent as stationary.
      if (
        dbRow.speed_scm === null &&
        typeof ship.scm_speed === "number" &&
        ship.scm_speed > 0
      ) {
        scmUpdates.push({ id: dbId, speedScm: ship.scm_speed });
      }

      // ── Physical + meta fields (2026-04-15 extension) ──────────
      // Only fill if DB is NULL — p4k data wins for Flight Ready ships.
      // Concept ships have no p4k entity so RSI is their only source.
      const length = toNumber(ship.length);
      if (dbRow.length === null && length !== null && length > 0) {
        lengthUpdates.push({ id: dbId, length });
      }
      const beam = toNumber(ship.beam);
      if (dbRow.beam === null && beam !== null && beam > 0) {
        beamUpdates.push({ id: dbId, beam });
      }
      const height = toNumber(ship.height);
      if (dbRow.height === null && height !== null && height > 0) {
        heightUpdates.push({ id: dbId, height });
      }
      const mass = toNumber(ship.mass);
      if (dbRow.mass === null && mass !== null && mass > 0) {
        massUpdates.push({ id: dbId, mass });
      }
      // F242: p4k extractor falls back to crew_min/crew_max=1 when component
      // data is thin. Capital + large ships should never really be crew=1;
      // prefer RSI ship-matrix over the suspicious 1-default.
      const crewMin = toNumber(ship.min_crew);
      if (crewMin !== null && (
        dbRow.crew_min === null ||
        (dbRow.crew_min === 1 && crewMin > 1)
      )) {
        crewMinUpdates.push({ id: dbId, crewMin });
      }
      const crewMax = toNumber(ship.max_crew);
      if (crewMax !== null && (
        dbRow.crew_max === null ||
        (dbRow.crew_max === 1 && crewMax > 1)
      )) {
        crewMaxUpdates.push({ id: dbId, crewMax });
      }
      if (dbRow.classification === null && ship.classification) {
        classificationUpdates.push({ id: dbId, classification: ship.classification });
      }
      if (dbRow.focus === null && ship.focus) {
        focusUpdates.push({ id: dbId, focus: ship.focus });
      }
      // pledge_url + pledge_price: always overwrite — RSI store is the
      // authoritative source (no p4k equivalent).
      if (ship.url) {
        pledgeUrlUpdates.push({ id: dbId, url: ship.url });
      }
      const price = toNumber(ship.price);
      if (price !== null && price >= 0) {
        pledgePriceUpdates.push({ id: dbId, price });
      }
      const mfrCode = ship.manufacturer?.code;
      if (dbRow.manufacturer_code === null && mfrCode) {
        mfrCodeUpdates.push({ id: dbId, code: mfrCode });
      }
      // F234: backfill size + size_label from RSI ship-matrix when p4k extractor
      // couldn't derive them from bounding-box dimensions.
      if (dbRow.size_label === null && ship.size) {
        const sizeStr = ship.size.toLowerCase();
        const sizeInt = RSI_SIZE_TO_INT[sizeStr];
        if (sizeInt !== undefined) {
          sizeUpdates.push({ id: dbId, sizeInt, sizeLabel: sizeStr });
        }
      }
    }

    console.log(
      `[rsi] Matched ${matchedIds.size}/${rsiShips.length} ship-matrix entries to DB ` +
        `(status=${statusUpdates.length} cargo=${cargoUpdates.length} ` +
        `vtype=${vtypeUpdates.length} scm=${scmUpdates.length} ` +
        `length=${lengthUpdates.length} beam=${beamUpdates.length} height=${heightUpdates.length} ` +
        `mass=${massUpdates.length} crew_min=${crewMinUpdates.length} crew_max=${crewMaxUpdates.length} ` +
        `classification=${classificationUpdates.length} focus=${focusUpdates.length} ` +
        `url=${pledgeUrlUpdates.length} price=${pledgePriceUpdates.length} ` +
        `mfr=${mfrCodeUpdates.length})`,
    );
    if (unmatched > 0) {
      console.log(`[rsi] Unmatched RSI ships (${unmatched}): ${unmatchedNames.join(", ")}`);
    }

    // Apply updates in batches. Also mark everything in the DB as pledgeable=1
    // if the column exists (migration may not be applied yet).
    const statements: D1PreparedStatement[] = [];
    for (const u of statusUpdates) {
      statements.push(
        db
          .prepare(`UPDATE vehicles SET production_status_id = ? WHERE id = ?`)
          .bind(u.statusId, u.id),
      );
    }
    for (const u of cargoUpdates) {
      statements.push(
        db.prepare(`UPDATE vehicles SET cargo = ? WHERE id = ?`).bind(u.cargo, u.id),
      );
    }
    for (const u of vtypeUpdates) {
      statements.push(
        db
          .prepare(`UPDATE vehicles SET vehicle_type = ? WHERE id = ?`)
          .bind(u.vehicleType, u.id),
      );
    }
    for (const u of scmUpdates) {
      statements.push(
        db
          .prepare(`UPDATE vehicles SET speed_scm = ? WHERE id = ?`)
          .bind(u.speedScm, u.id),
      );
    }

    // ── Physical + meta field updates (2026-04-15 extension) ────
    for (const u of lengthUpdates) {
      statements.push(db.prepare(`UPDATE vehicles SET length = ? WHERE id = ?`).bind(u.length, u.id));
    }
    for (const u of beamUpdates) {
      statements.push(db.prepare(`UPDATE vehicles SET beam = ? WHERE id = ?`).bind(u.beam, u.id));
    }
    for (const u of heightUpdates) {
      statements.push(db.prepare(`UPDATE vehicles SET height = ? WHERE id = ?`).bind(u.height, u.id));
    }
    for (const u of massUpdates) {
      statements.push(db.prepare(`UPDATE vehicles SET mass = ? WHERE id = ?`).bind(u.mass, u.id));
    }
    for (const u of crewMinUpdates) {
      statements.push(db.prepare(`UPDATE vehicles SET crew_min = ? WHERE id = ?`).bind(u.crewMin, u.id));
    }
    for (const u of crewMaxUpdates) {
      statements.push(db.prepare(`UPDATE vehicles SET crew_max = ? WHERE id = ?`).bind(u.crewMax, u.id));
    }
    for (const u of classificationUpdates) {
      statements.push(
        db.prepare(`UPDATE vehicles SET classification = ? WHERE id = ?`).bind(u.classification, u.id),
      );
    }
    for (const u of focusUpdates) {
      statements.push(db.prepare(`UPDATE vehicles SET focus = ? WHERE id = ?`).bind(u.focus, u.id));
    }
    for (const u of pledgeUrlUpdates) {
      statements.push(db.prepare(`UPDATE vehicles SET pledge_url = ? WHERE id = ?`).bind(u.url, u.id));
    }
    for (const u of pledgePriceUpdates) {
      statements.push(db.prepare(`UPDATE vehicles SET pledge_price = ? WHERE id = ?`).bind(u.price, u.id));
    }
    for (const u of sizeUpdates) {
      statements.push(
        db.prepare(`UPDATE vehicles SET size = ?, size_label = ? WHERE id = ?`)
          .bind(u.sizeInt, u.sizeLabel, u.id),
      );
    }
    for (const u of mfrCodeUpdates) {
      // Set manufacturer_code + resolve manufacturer_id FK in one pass.
      statements.push(
        db.prepare(`UPDATE vehicles SET manufacturer_code = ? WHERE id = ?`).bind(u.code, u.id),
      );
      statements.push(
        db
          .prepare(
            `UPDATE vehicles SET manufacturer_id = (SELECT id FROM manufacturers WHERE code = ? LIMIT 1) WHERE id = ? AND manufacturer_id IS NULL`,
          )
          .bind(u.code, u.id),
      );
    }

    // Execute in chunks (D1 batch has a statement limit)
    for (const chunk of chunkArray(statements, 50)) {
      await db.batch(chunk);
    }

    await applyPledgeableFlags(db, [...matchedIds]);

    const detail =
      `matched=${matchedIds.size} unmatched=${unmatched} ` +
      `status=${statusUpdates.length} cargo=${cargoUpdates.length} ` +
      `vtype=${vtypeUpdates.length} scm=${scmUpdates.length} ` +
      `fetched=${rsiShips.length}`;
    await updateSyncHistory(db, syncID, "success", matchedIds.size, detail);
    console.log(`[rsi] Ship production status sync complete: ${detail}`);
    logEvent("sync_rsi_production_status", {
      fetched: rsiShips.length,
      matched: matchedIds.size,
      status_updates: statusUpdates.length,
      cargo_updates: cargoUpdates.length,
      vtype_updates: vtypeUpdates.length,
      scm_updates: scmUpdates.length,
      unmatched,
    });
  } catch (err) {
    await updateSyncHistory(db, syncID, "error", 0, String(err));
    throw err;
  }
}

// --- Combined sync (ships only — paint images are manual upload) ---

export async function syncAll(
  db: D1Database,
  baseURL: string,
  rateLimitMs: number,
): Promise<void> {
  await syncShipImages(db, baseURL, rateLimitMs);
  await syncShipProductionStatus(db);
}
