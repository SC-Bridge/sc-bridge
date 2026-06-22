/**
 * Shared fleet import helpers — used by both HangarXplor and hangar-sync imports.
 */

import { compactSlug, slugFromName } from "./slug";

// --- Preloaded vehicle map for in-memory slug matching ---

export interface VehicleMap {
  slugToID: Map<string, number>;
  nameToSlug: Map<string, string>;
  compactToSlug: Map<string, string>;
}

export async function preloadVehicleMap(db: D1Database): Promise<VehicleMap> {
  // Load active vehicles (non-removed)
  const result = await db
    .prepare(`SELECT v.id, v.slug, v.name FROM vehicles v
      WHERE v.removed = 0`)
    .all();

  const slugToID = new Map<string, number>();
  const nameToSlug = new Map<string, string>();
  const compactToSlug = new Map<string, string>();

  for (const row of result.results) {
    const r = row as { id: number; slug: string; name: string };
    slugToID.set(r.slug, r.id);
    nameToSlug.set(r.name.toLowerCase(), r.slug);
    // Also index with manufacturer stripped (4.7 names include mfr: "RSI Aurora Mk I SE")
    const stripped = stripManufacturer(r.name);
    if (stripped.toLowerCase() !== r.name.toLowerCase()) {
      nameToSlug.set(stripped.toLowerCase(), r.slug);
    }
    compactToSlug.set(compactSlug(r.slug), r.slug);
  }

  // Load removed vehicles with replacements — map old slug/name to replacement vehicle
  const removed = await db
    .prepare(`SELECT v.id, v.slug, v.name, rv.id as replacement_id, rv.slug as replacement_slug, rv.name as replacement_name
      FROM vehicles v
      JOIN vehicles rv ON rv.id = v.replaced_by_vehicle_id
      WHERE v.removed = 1 AND v.replaced_by_vehicle_id IS NOT NULL`)
    .all();

  for (const row of removed.results) {
    const r = row as { slug: string; name: string; replacement_id: number; replacement_slug: string };
    // Old slug/name resolve to the replacement vehicle
    if (!slugToID.has(r.slug)) {
      slugToID.set(r.slug, r.replacement_id);
    }
    const lowerName = r.name.toLowerCase();
    if (!nameToSlug.has(lowerName)) {
      nameToSlug.set(lowerName, r.replacement_slug);
    }
    const compact = compactSlug(r.slug);
    if (!compactToSlug.has(compact)) {
      compactToSlug.set(compact, r.replacement_slug);
    }
  }

  return { slugToID, nameToSlug, compactToSlug };
}

/** Strip "Mk I"/"Mk II" etc. from ship names for fallback matching (4.7 renames) */
function stripMkSuffix(name: string): string | null {
  const stripped = name.replace(/\s+Mk\s+[IVX]+/i, "").trim();
  return stripped !== name ? stripped : null;
}

/** Normalize arabic Mk numerals to roman: "Mk 1" → "Mk I", "Mk 2" → "Mk II" */
const ARABIC_TO_ROMAN: Record<string, string> = { "1": "I", "2": "II", "3": "III", "4": "IV", "5": "V" };
function normalizeMkNumeral(name: string): string | null {
  const replaced = name.replace(/\bMk\s+(\d)\b/i, (_, d) => `Mk ${ARABIC_TO_ROMAN[d] || d}`);
  return replaced !== name ? replaced : null;
}

export function findVehicleSlugLocal(
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

  // Try with "Mk I"/"Mk II" stripped (4.7 renames: "Aurora Mk I SE" → "Aurora SE")
  if (displayName) {
    const noMk = stripMkSuffix(displayName);
    if (noMk) {
      const found = map.nameToSlug.get(noMk.toLowerCase());
      if (found) return found;
      // Also try slug form
      const noMkSlug = slugFromName(noMk);
      if (map.slugToID.has(noMkSlug)) return noMkSlug;
      const noMkCompact = compactSlug(noMkSlug);
      const compactFound = map.compactToSlug.get(noMkCompact);
      if (compactFound) return compactFound;
    }
  }

  // Try punctuation-stripped name lookup — "A.T.L.S." → "atls", matches DB "Argo ATLS" via stripped name index.
  // Some pledge titles use periods that DB names don't.
  if (displayName) {
    const stripped = displayName.replace(/[^\w\s-]/g, "").replace(/\s+/g, " ").trim();
    if (stripped !== displayName && stripped) {
      const found = map.nameToSlug.get(stripped.toLowerCase());
      if (found) return found;
    }
  }

  // Try arabic→roman Mk normalization: "F7A Hornet Mk 1" → "F7A Hornet Mk I"
  if (displayName) {
    const normalized = normalizeMkNumeral(displayName);
    if (normalized) {
      const found = map.nameToSlug.get(normalized.toLowerCase());
      if (found) return found;
      const normSlug = slugFromName(normalized);
      if (map.slugToID.has(normSlug)) return normSlug;
    }
  }

  // Try dropping first word — handles manufacturer/race prefixes
  // e.g. "Vanduul Blade" → "Blade", "Crusader Hercules" → "Hercules"
  if (displayName) {
    const words = displayName.split(/\s+/);
    if (words.length >= 2) {
      const stripped = words.slice(1).join(" ");
      const found = map.nameToSlug.get(stripped.toLowerCase());
      if (found) return found;
      const strippedSlug = slugFromName(stripped);
      if (map.slugToID.has(strippedSlug)) return strippedSlug;
    }
  }

  // Try moving last word to front — handles model-prefix reordering
  // e.g. "Hercules Starlifter M2" → "M2 Hercules Starlifter"
  if (displayName) {
    const words = displayName.split(/\s+/);
    if (words.length >= 2) {
      const reordered = [words[words.length - 1], ...words.slice(0, -1)].join(" ");
      const found = map.nameToSlug.get(reordered.toLowerCase());
      if (found) return found;
      const reorderedSlug = slugFromName(reordered);
      if (map.slugToID.has(reorderedSlug)) return reorderedSlug;
      const reorderedCompact = compactSlug(reorderedSlug);
      const compactFound = map.compactToSlug.get(reorderedCompact);
      if (compactFound) return compactFound;
    }
  }

  // Try dropping LAST word — handles RSI sending extra suffix words the DB doesn't have:
  //   "Tumbril Nova Tank" → "Tumbril Nova" (DB has no "Tank")
  //   "Drake Dragonfly Black" → "Drake Dragonfly" (Black is base in DB)
  //   "Drake Dragonfly Star Kitten Edition" → "Drake Dragonfly Star Kitten" (no "Edition")
  //   "RSI Ursa Rover" → "RSI Ursa" (Rover was dropped from DB name)
  if (displayName) {
    const words = displayName.split(/\s+/);
    if (words.length >= 2) {
      const dropped = words.slice(0, -1).join(" ");
      const found = map.nameToSlug.get(dropped.toLowerCase());
      if (found) return found;
      const droppedSlug = slugFromName(dropped);
      if (map.slugToID.has(droppedSlug)) return droppedSlug;
      const droppedCompact = compactSlug(droppedSlug);
      const compactFound = map.compactToSlug.get(droppedCompact);
      if (compactFound) return compactFound;
    }
  }

  // Try prefix match — existing slug starts with candidate
  for (const slug of candidateSlugs) {
    if (!slug || slug.length < 3) continue;
    for (const [existingSlug] of map.slugToID) {
      if (existingSlug.startsWith(slug)) return existingSlug;
    }
  }

  // Try reverse prefix — candidate starts with existing slug (handles verbose RSI names
  // like "Carrack Expedition with Pisces Expedition" matching "carrack-expedition",
  // or "Idris-P Frigate" matching "idris-p")
  for (const slug of candidateSlugs) {
    if (!slug || slug.length < 3) continue;
    let bestMatch: string | null = null;
    let bestLen = 0;
    for (const [existingSlug] of map.slugToID) {
      if (slug.startsWith(existingSlug) && existingSlug.length > bestLen) {
        bestMatch = existingSlug;
        bestLen = existingSlug.length;
      }
    }
    if (bestMatch) return bestMatch;
  }

  return null;
}

// --- Paint matching ---

export interface PaintMap {
  normalizedToID: Map<string, number>;
}

/** Normalize RSI paint title: "100 Series - Blue Ametrine Paint" → "100 series blue ametrine" */
export function normalizePaintTitle(rsiTitle: string): string {
  return rsiTitle
    .replace(/\s*-\s*/g, " ")       // " - " → " "
    .replace(/\s+paint$/i, "")       // strip trailing " Paint"
    .replace(/\s+/g, " ")            // collapse whitespace
    .trim()
    .toLowerCase();
}

/** Normalize DB paint name: "100 Series Blue Ametrine Livery" → "100 series blue ametrine" */
function normalizeDbPaintName(dbName: string): string {
  return dbName
    .replace(/\s+camo\s+livery$/i, "")  // strip " Camo Livery"
    .replace(/\s+livery$/i, "")          // strip " Livery"
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export async function preloadPaintMap(db: D1Database): Promise<PaintMap> {
  const result = await db
    .prepare("SELECT id, name FROM paints WHERE is_base_variant = 0")
    .all();

  const normalizedToID = new Map<string, number>();
  for (const row of result.results) {
    const r = row as { id: number; name: string };
    const normalized = normalizeDbPaintName(r.name);
    if (!normalizedToID.has(normalized)) {
      normalizedToID.set(normalized, r.id);
    }
  }
  return { normalizedToID };
}

export function findPaintLocal(map: PaintMap, rsiTitle: string): number | null {
  if (!rsiTitle) return null;
  const normalized = normalizePaintTitle(rsiTitle);
  return map.normalizedToID.get(normalized) ?? null;
}

// --- Buyback name parsers ---

/** Strip SC manufacturer prefix from a ship name.
 *
 * IMPORTANT: keep in sync with the manufacturers table. Missing entries silently
 * break hangar-sync matching — RSI sends ship titles WITHOUT the manufacturer
 * prefix (e.g. "Guardian MX" not "Mirai Guardian MX"), so we depend on the
 * stripped form being indexed in nameToSlug.
 *
 * Issue #161 (2026-05-17): Mirai/Vanduul/Xian were missing, causing all Mirai
 * ships (Fury, Guardian MX, Pulse, etc.) to fail hangar-sync matching.
 */
const MFR_PREFIX = /^(Anvil Aerospace|Aegis Dynamics|Origin Jumpworks|Drake Interplanetary|Crusader Industries|Musashi Industrial|Consolidated Outland|Argo Astronautics|Roberts Space Industries|Kruger Intergalaktik|Greycat Industrial|C\.O\.|Mirai|Vanduul|Xi'?an|Anvil|Aegis|AEGIS|RSI|Origin|Drake|Crusader|CNOU|MISC|MRAI|VNCL|XNAA|Argo|Tumbril|Greycat|Aopoa|AOPOA|Esperia|Gatac|Banu|Kruger)\s+/i;

export function stripManufacturer(name: string): string {
  return name.replace(MFR_PREFIX, "").trim();
}

/** Parse buyback ship name: "Standalone Ship - Anvil C8X Pisces Expedition - IAE 2949" → "C8X Pisces Expedition" */
export function parseBuybackShipName(pledgeName: string): string {
  let name = pledgeName;
  // Strip prefix
  name = name.replace(/^Standalone Ships?\s*-\s*/i, "");
  name = name.replace(/^Buggies\s*-\s*/i, "");
  // Strip trailing dash-separated suffixes
  name = name.replace(/\s*-\s*(Warbond|IAE\s*\d+|ILW\s*\d+|LTI|\d+\s*Year|Anniversary\s*\d+|Citizencon\s*\d+|Gamescom\s*\d+|Presale).*$/i, "");
  // Strip trailing modifiers without dash
  name = name.replace(/\s+(LTI\s+Presale|LTI|Presale|Anniversary\s*\d+|Gamescom\s*\d+)$/i, "");
  // Strip "plus {Paint} Paint" suffix
  name = name.replace(/\s+plus\s+.+paint$/i, "");
  // Strip manufacturer prefix
  name = stripManufacturer(name);
  return name.trim();
}

/** Parse buyback paint name: "Paints - Terrapin - Felicity Paint" → "Terrapin - Felicity Paint" */
export function parseBuybackPaintName(pledgeName: string): string {
  return pledgeName.replace(/^Paints\s*-\s*/i, "").trim();
}

/** Parse CCU names: returns [fromShip, toShip] or null */
export function parseCCUNames(pledgeName: string): [string, string] | null {
  let name = pledgeName;
  // Strip prefixes
  name = name.replace(/^Ship Upgrades\s*-\s*/i, "");
  name = name.replace(/^Upgrade\s*-\s*/i, "");
  // Strip suffixes
  name = name.replace(/\s+Upgrade$/i, "");
  name = name.replace(/\s+(Standard|Warbond)\s+Edition$/i, "");
  // Strip trailing " - News Van" etc. (variant suffixes after dash)
  name = name.replace(/\s*-\s*[^-]+$/i, (match) => {
    // Only strip if the part after dash looks like a variant/edition, not a ship name
    const suffix = match.replace(/^\s*-\s*/, "").trim();
    if (/^(News Van|Warbond|Best In Show|BIS|Executive|Explorer|Touring)$/i.test(suffix)) return "";
    return match; // Keep it — it's part of the ship name (e.g., "San'tok.yai")
  });

  // Split on " to " — the divider between from and to ships
  const toIdx = name.toLowerCase().indexOf(" to ");
  if (toIdx < 1) return null;

  let from = name.slice(0, toIdx).trim();
  let to = name.slice(toIdx + 4).trim();
  if (!from || !to) return null;

  // Strip manufacturer prefixes from both sides
  from = stripManufacturer(from);
  to = stripManufacturer(to);

  return [from, to];
}

/** Classify buyback pledge type from its name */
export function classifyBuyback(name: string): "ship" | "paint" | "ccu" | "gear" | "addon" | "other" {
  if (/^Standalone Ship/i.test(name) || /^Buggies/i.test(name)) return "ship";
  if (/^Paints/i.test(name)) return "paint";
  if (/^(Ship Upgrades|Upgrade)\s*-/i.test(name)) return "ccu";
  if (/^Gear/i.test(name)) return "gear";
  if (/^Add-Ons/i.test(name)) return "addon";
  return "other";
}

// --- Date and value parsing helpers ---

/**
 * Parse RSI date strings like "August 19, 2025" or "Feb 28 2020, 7:41 am" to ISO format.
 * Returns null if unparseable.
 */
export function parseRsiDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed;

  // Try Date.parse (handles "August 19, 2025" and "Feb 28 2020, 7:41 am")
  const ts = Date.parse(trimmed);
  if (!isNaN(ts)) {
    const d = new Date(ts);
    const iso = d.toISOString();
    // Return date only if no time component in input, otherwise full ISO
    if (/\d{1,2}:\d{2}/.test(trimmed)) {
      return iso.replace("Z", "").replace(/\.000$/, "");
    }
    return iso.slice(0, 10);
  }

  return null;
}

/**
 * Parse RSI value strings like "$295.00 USD" or "$1,500.00" to cents.
 * Returns null if unparseable.
 */
export function parseValueCents(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const match = raw.match(/\$\s*([\d,]+(?:\.\d+)?)/);
  if (!match) return null;
  const num = parseFloat(match[1].replace(/,/g, ""));
  if (isNaN(num)) return null;
  return Math.round(num * 100);
}

/**
 * Fleet sync — UPSERT + cleanup-by-import-tag pattern.
 *
 * Replaces the insert-then-swap pattern (which allowed duplicates on
 * concurrent imports or partial-failure retries — see migration 0224).
 *
 * 1. Caller stamps every INSERT with the SAME imported_at timestamp,
 *    passed in here as `importTag`.
 * 2. Statements are INSERT ... ON CONFLICT(user_id, pledge_id, vehicle_id)
 *    DO UPDATE so re-imports refresh existing rows in place.
 * 3. After all UPSERTs land, we delete rows whose imported_at predates
 *    this import — those are entries the current hangar no longer
 *    contains (sold, gifted, melted).
 *
 * Failure modes:
 * - Insert batch fails partway: old rows still tagged with their old
 *   imported_at values, our cleanup step won't touch them. Safe.
 * - Cleanup step fails: stale rows linger but the new ones are correct;
 *   next successful import cleans up.
 * - Concurrent imports: both UPSERT into the same rows; the partial
 *   UNIQUE index from 0224 prevents duplicates at the DB level.
 *
 * `pledge_id IS NULL` rows (unmatched ships) bypass the UNIQUE constraint.
 * They're still cleaned up by the imported_at sweep.
 */
export async function executeFleetSwap(
  db: D1Database,
  userID: string,
  insertStmts: D1PreparedStatement[],
  importTag: string,
): Promise<void> {
  if (insertStmts.length === 0) return;

  const batchSize = 1000;
  for (let i = 0; i < insertStmts.length; i += batchSize) {
    await db.batch(insertStmts.slice(i, i + batchSize));
  }

  // Sweep PLEDGE entries the current hangar no longer contains. In-game
  // purchases (source='ingame') are user-managed and must survive re-imports.
  await db
    .prepare(
      "DELETE FROM user_fleet WHERE user_id = ? AND imported_at < ? AND source = 'pledge'",
    )
    .bind(userID, importTag)
    .run();
}

/**
 * Generic insert-then-swap for any user-scoped table with AUTOINCREMENT id.
 *
 * 1. Record MAX(id) of existing rows for this user
 * 2. Insert all new rows (which get higher IDs)
 * 3. Delete only rows with id <= the recorded max
 *
 * If inserts fail, old data is preserved. If delete fails, both old and new
 * data coexist (duplicates, but no data loss).
 */
export async function executeTableSwap(
  db: D1Database,
  table: string,
  userID: string,
  insertStmts: D1PreparedStatement[],
  batchSize = 1000,
): Promise<void> {
  if (insertStmts.length === 0) return;

  const maxRow = await db
    .prepare(`SELECT MAX(id) as max_id FROM ${table} WHERE user_id = ?`)
    .bind(userID)
    .first<{ max_id: number | null }>();
  const maxExistingId = maxRow?.max_id ?? 0;

  for (let i = 0; i < insertStmts.length; i += batchSize) {
    await db.batch(insertStmts.slice(i, i + batchSize));
  }

  await db
    .prepare(`DELETE FROM ${table} WHERE user_id = ? AND id <= ?`)
    .bind(userID, maxExistingId)
    .run();
}
