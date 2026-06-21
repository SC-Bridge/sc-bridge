/**
 * UEX API sync — fetches community-reported prices from uexcorp.space
 * and updates terminal_inventory with latest prices.
 */

const UEX_BASE = "https://uexcorp.space/api/2.0";

// UEX commodity names that differ from our game-file names (after normalization)
const COMMODITY_OVERRIDES: Record<string, string> = {
  "audio visual equipment": "audiovisual equipment",
  "party favors": "fireworks",
};

function normalize(name: string): string {
  return name.toLowerCase()
    .replace(/[/_-]/g, " ")         // separators → space
    .replace(/[^a-z0-9\s]/g, "")   // strip remaining punctuation
    .replace(/gray/g, "grey")       // American → British spelling
    .replace(/(\D)\s+(\d+)$/, "$1$2") // trailing digit collapse
    .replace(/\s+/g, " ").trim();
}

interface UexResponse<T> {
  status: string;
  data: T[];
}

interface UexCommodityPrice {
  id_terminal: number;
  commodity_name: string;
  price_buy: number;
  price_sell: number;
  // Unix-seconds timestamps from UEX. `date_modified` = community last
  // updated the report; `date_added` = first time UEX saw this entry.
  // See migration 0247.
  date_modified?: number;
  date_added?: number;
}

interface UexItemPrice {
  id_terminal: number;
  item_uuid: string;
  item_name: string;
  price_buy: number;
  price_sell: number;
  date_modified?: number;
  date_added?: number;
}

async function fetchUex<T>(endpoint: string): Promise<T[]> {
  const res = await fetch(`${UEX_BASE}/${endpoint}`, {
    headers: { "User-Agent": "SCBridge/1.0" },
  });
  if (!res.ok) throw new Error(`UEX API ${res.status}: ${res.statusText}`);
  const data = (await res.json()) as UexResponse<T>;
  if (data.status !== "ok") throw new Error(`UEX API error: ${data.status}`);
  return data.data;
}

export interface SyncResult {
  commodities: number;
  items: number;
  /** loot_map rows created for buy-only items that UEX knows but extraction misses. */
  backfilled?: number;
  /** existing unmapped terminals matched to a UEX terminal and given uex_terminal_id. */
  terminalsMapped?: number;
  /** shop+terminal rows created for UEX terminals we never extracted. */
  terminalsCreated?: number;
  errors: string[];
}

interface UexTerminal {
  id: number;
  name: string;
  nickname?: string;
  displayname?: string;
  company_name?: string;
  type?: string;
  is_shop_fps?: number;
  is_shop_vehicle?: number;
  is_refinery?: number;
  city_name?: string | null;
  space_station_name?: string | null;
  outpost_name?: string | null;
  planet_name?: string | null;
  star_system_name?: string | null;
}

/** Lagrange code (e.g. "cru-l1") if present, else the normalized string. */
function locKeyOf(s: string | null | undefined): string {
  const m = String(s || "").toUpperCase().match(/\b([A-Z]{3}-L[1-5])\b/);
  return m ? m[1].toLowerCase() : normalize(s || "");
}

/** Best location key for a UEX terminal (prefers a Lagrange code). */
function uexLocKey(u: UexTerminal): string {
  for (const s of [u.nickname, u.name, u.space_station_name, u.city_name, u.outpost_name]) {
    const k = locKeyOf(s);
    if (/^[a-z]{3}-l[1-5]$/.test(k)) return k;
  }
  return normalize(u.city_name || u.space_station_name || u.outpost_name || (u.name || "").split(" - ").pop() || "");
}

function slugify(s: string): string {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

/**
 * Self-heal the terminal mapping so the UEX price sync can reach every priced
 * item. UEX tracks far more terminals than the p4k extractor produces, and a
 * data reload wipes `terminals.uex_terminal_id` entirely. For each UEX terminal
 * that sells a priced item or commodity:
 *   1. if already mapped → skip;
 *   2. else if an existing unmapped terminal matches by location + brand → set
 *      its uex_terminal_id (map);
 *   3. else create a shop (data_source='uex') + terminal from UEX metadata.
 * Idempotent (deterministic uuids + ON CONFLICT) and self-healing across reloads,
 * exactly like backfillBuyOnlyLootMap. Mirrors that #135 pattern for terminals.
 */
export async function ensureUexTerminals(
  db: D1Database,
  gvId: number,
): Promise<{ mapped: number; created: number; itemPrices: UexItemPrice[] }> {
  const [uexTerminals, itemPrices] = await Promise.all([
    fetchUex<UexTerminal>("terminals"),
    fetchUex<UexItemPrice>("items_prices_all"),
  ]);

  const uexById = new Map(uexTerminals.map((u) => [u.id, u]));

  // Existing terminals: which UEX ids are mapped, and an index of unmapped ones
  // by (locationKey) for brand matching.
  const { results: existing } = await db
    .prepare(
      `SELECT t.id, t.uex_terminal_id, t.shop_name_key, s.name AS shop_name, s.location_label
       FROM terminals t LEFT JOIN shops s ON s.id = t.shop_id
       WHERE COALESCE(t.is_deleted, 0) = 0`,
    )
    .all<{ id: number; uex_terminal_id: number | null; shop_name_key: string; shop_name: string | null; location_label: string | null }>();
  const mappedUex = new Set<number>();
  const unmappedByLoc = new Map<string, Array<{ id: number; brand: string }>>();
  for (const t of existing) {
    if (t.uex_terminal_id != null) { mappedUex.add(t.uex_terminal_id); continue; }
    const lk = locKeyOf(t.location_label);
    const brand = normalize(t.shop_name || t.shop_name_key).replace(/stanton\d+ l(eo)?\d+/g, "").trim();
    if (!unmappedByLoc.has(lk)) unmappedByLoc.set(lk, []);
    unmappedByLoc.get(lk)!.push({ id: t.id, brand });
  }

  // Only materialise terminals that close a REAL gap: those selling at least one
  // priced item that NO already-mapped terminal carries. Scoped to ITEMS
  // (components/FPS/ship gear), not commodities (matched by name elsewhere).
  // Without this we'd create ~400 redundant shops for items already priced.
  const itemTerms = new Map<string, Set<number>>();
  for (const p of itemPrices) {
    if (!(p.price_buy > 0 || p.price_sell > 0) || !p.item_uuid) continue;
    if (!itemTerms.has(p.item_uuid)) itemTerms.set(p.item_uuid, new Set());
    itemTerms.get(p.item_uuid)!.add(p.id_terminal);
  }
  const priced = new Set<number>();
  for (const [, terms] of itemTerms) {
    if ([...terms].some((t) => mappedUex.has(t))) continue; // item already covered
    for (const t of terms) priced.add(t);
  }

  const mapStmts: D1PreparedStatement[] = [];
  const shopStmts: D1PreparedStatement[] = [];
  const toCreateTerminals: Array<{ uid: number; u: UexTerminal }> = [];
  const usedExisting = new Set<number>();

  for (const uid of priced) {
    if (mappedUex.has(uid)) continue;
    const u = uexById.get(uid);
    if (!u) continue;

    // 2) match an existing unmapped terminal at the same location + brand
    const lk = uexLocKey(u);
    const company = normalize(u.company_name || (u.name || "").split(" - ")[0]);
    const cands = (unmappedByLoc.get(lk) || []).filter(
      (c) => !usedExisting.has(c.id) && company && (c.brand.includes(company) || company.includes(c.brand.split(" ")[0])),
    );
    if (cands.length >= 1) {
      usedExisting.add(cands[0].id);
      mappedUex.add(uid);
      mapStmts.push(
        db.prepare("UPDATE terminals SET uex_terminal_id = ?, updated_at = datetime('now') WHERE id = ?").bind(uid, cands[0].id),
      );
      continue;
    }

    // 3) create a shop (data_source='uex') for this UEX terminal
    const shopName = u.company_name || (u.name || `UEX ${uid}`).split(" - ")[0];
    const loc = u.city_name || u.space_station_name || u.outpost_name || u.planet_name || null;
    const shopType = u.is_shop_vehicle ? "ship_components" : u.is_shop_fps ? "fps" : u.is_refinery ? "refinery" : (u.type || "general");
    shopStmts.push(
      db
        .prepare(
          `INSERT INTO shops (uuid, name, slug, shop_type, location_label, display_name, data_source, game_version_id)
           VALUES (?, ?, ?, ?, ?, ?, 'uex', ?)
           ON CONFLICT(uuid) DO UPDATE SET name = excluded.name, location_label = excluded.location_label,
             display_name = excluded.display_name, game_version_id = excluded.game_version_id, updated_at = datetime('now')`,
        )
        .bind(`uex-shop-${uid}`, shopName, `uex-${slugify(u.name || String(uid))}`, shopType, loc, u.name || shopName, gvId),
    );
    toCreateTerminals.push({ uid, u });
  }

  for (let i = 0; i < mapStmts.length; i += 100) await db.batch(mapStmts.slice(i, i + 100));
  for (let i = 0; i < shopStmts.length; i += 100) await db.batch(shopStmts.slice(i, i + 100));

  // Resolve the shop ids we just created, then create their terminals.
  let created = 0;
  if (toCreateTerminals.length > 0) {
    const termStmts: D1PreparedStatement[] = [];
    for (const { uid, u } of toCreateTerminals) {
      termStmts.push(
        db
          .prepare(
            `INSERT INTO terminals (uuid, shop_id, shop_name_key, terminal_type, uex_terminal_id, game_version_id)
             SELECT ?, s.id, ?, 'item', ?, ?
             FROM shops s WHERE s.uuid = ?
             ON CONFLICT(uuid) DO UPDATE SET uex_terminal_id = excluded.uex_terminal_id, updated_at = datetime('now')`,
          )
          .bind(`uex-term-${uid}`, `UEX ${(u.name || uid).toString().slice(0, 110)}`, uid, gvId, `uex-shop-${uid}`),
      );
    }
    for (let i = 0; i < termStmts.length; i += 100) await db.batch(termStmts.slice(i, i + 100));
    created = termStmts.length;
  }

  return { mapped: mapStmts.length, created, itemPrices };
}

/**
 * Backfill loot_map for "buy-only" items: items UEX prices but that the p4k
 * extractor never produced (they're sold at shops but never in a loot table,
 * so the loot-table-driven loot_map build skips them — e.g. the RediMake
 * fabricator, ship bombs, refueling nozzles, ship modules, mobiGlas casings).
 *
 * Without a loot_map row they're unsearchable and their UEX prices are orphaned.
 * This creates a minimal loot_map row keyed by the item's uuid (matching
 * terminal_inventory.item_uuid), so it becomes searchable and the "Where to Buy"
 * shop query links its prices automatically. Idempotent (NOT EXISTS guard) and
 * self-healing — re-creates rows after a full DB reload on the next sync.
 *
 * Category is assigned by name (the entity isn't extracted, so we have no type).
 * Tagged data_source='terminal_inventory_backfill'. Excludes UEX commodities
 * (item_type='commodity' live in trade_commodities) and lowercase/placeholder junk.
 */
export async function backfillBuyOnlyLootMap(db: D1Database, gvId: number): Promise<number> {
  const res = await db
    .prepare(
      `INSERT INTO loot_map (uuid, name, category, data_source, game_version_id)
       SELECT g.item_uuid, g.item_name,
         CASE WHEN g.item_name LIKE 'mobiGlas%' THEN 'clothing'
              WHEN g.item_name LIKE '%Bomb%' OR g.item_name LIKE '%Gatling%' THEN 'ship_weapon'
              WHEN g.item_name LIKE 'RediMake%' THEN 'misc'
              ELSE 'ship_component' END,
         'terminal_inventory_backfill', ?1
       FROM (
         SELECT DISTINCT ti.item_uuid, ti.item_name
         FROM terminal_inventory ti
         WHERE ti.is_deleted = 0
           AND ti.latest_source IS NOT NULL
           AND ti.item_type = 'item'
           AND (ti.latest_buy_price > 0 OR ti.latest_sell_price > 0)
           AND ti.item_name GLOB '*[A-Z]*'
           AND ti.item_name NOT LIKE '%PLACEHOLDER%'
           AND NOT EXISTS (
             SELECT 1 FROM loot_map lm WHERE lm.uuid = ti.item_uuid AND lm.is_deleted = 0
           )
       ) g`,
    )
    .bind(gvId)
    .run();
  return res.meta?.changes ?? 0;
}

export async function syncUexPrices(
  db: D1Database,
  type: "commodities" | "items" | "all" = "all",
  kv?: KVNamespace,
): Promise<SyncResult> {
  const result: SyncResult = { commodities: 0, items: 0, errors: [] };

  // Get game version for inserts
  const gv = await db.prepare("SELECT id FROM game_versions WHERE is_default = 1 LIMIT 1").first<{ id: number }>();
  const gvId = gv?.id ?? 1;

  // Self-heal the terminal mapping FIRST: map existing unmapped terminals + create
  // shop/terminal rows for UEX terminals we never extracted, so every UEX-priced
  // item has a home. Without this, a data reload (which wipes uex_terminal_id)
  // leaves the sync with nothing to map and it silently writes zero prices.
  let prefetchedItemPrices: UexItemPrice[] | undefined;
  try {
    const ens = await ensureUexTerminals(db, gvId);
    result.terminalsMapped = ens.mapped;
    result.terminalsCreated = ens.created;
    prefetchedItemPrices = ens.itemPrices;
  } catch (e) {
    result.errors.push(`Terminal self-heal failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Get terminal mappings: uex_terminal_id → our terminal_id (now self-healed)
  const { results: terminals } = await db
    .prepare("SELECT id, uex_terminal_id FROM terminals WHERE uex_terminal_id IS NOT NULL")
    .all();
  const uexToOurs = new Map<number, number>();
  for (const t of terminals) {
    uexToOurs.set(t.uex_terminal_id as number, t.id as number);
  }

  if (uexToOurs.size === 0) {
    result.errors.push("No terminals with uex_terminal_id mapped");
    return result;
  }

  try {
    if (type === "commodities" || type === "all") {
      result.commodities = await syncCommodities(db, uexToOurs, gvId);
    }
  } catch (e) {
    result.errors.push(`Commodity sync failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    if (type === "items" || type === "all") {
      result.items = await syncItems(db, uexToOurs, gvId, prefetchedItemPrices);
      // Durable fix for buy-only items the p4k extractor misses (#135): once
      // UEX knows an item, ensure it has a loot_map row so it's searchable +
      // price-linked. Self-healing across full DB reloads.
      result.backfilled = await backfillBuyOnlyLootMap(db, gvId);
    }
  } catch (e) {
    result.errors.push(`Item sync failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Purge KV cache for shop/loot/trade endpoints so fresh prices are served
  if (kv && (result.commodities > 0 || result.items > 0)) {
    try {
      const { purgeByPrefix } = await import("./cache");
      await purgeByPrefix(kv, "loot:");
      await purgeByPrefix(kv, "gd:shops");
      await purgeByPrefix(kv, "gd:shop-inv:");
      await purgeByPrefix(kv, "gd:trade");
      console.log("[uex] KV cache purged for loot/shop/trade prefixes");
    } catch (e) {
      result.errors.push(`KV purge failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return result;
}

export async function syncCommodities(
  db: D1Database,
  uexToOurs: Map<number, number>,
  gvId: number,
): Promise<number> {
  // Build commodity name → uuid lookup
  const { results: commodities } = await db
    .prepare("SELECT uuid, name FROM trade_commodities")
    .all();
  const byName = new Map<string, string>();
  for (const c of commodities) {
    byName.set(normalize(c.name as string), c.uuid as string);
  }

  const prices = await fetchUex<UexCommodityPrice>("commodities_prices_all");

  const stmts: D1PreparedStatement[] = [];
  for (const p of prices) {
    const ourTermId = uexToOurs.get(p.id_terminal);
    if (!ourTermId) continue;

    let name = normalize(p.commodity_name);
    name = COMMODITY_OVERRIDES[name] ?? name;
    const itemUuid = byName.get(name);
    if (!itemUuid) continue;

    const buy = p.price_buy || null;
    const sell = p.price_sell || null;
    if (!buy && !sell) continue;

    // game_version_id MUST be in the SET clause — otherwise the row stays
    // stuck at the OLD version_id when a new patch lands (the UNIQUE is on
    // terminal_id+item_uuid). See project_terminal_inventory_upsert_bug.md
    // for the 2026-05-16 outage this fixes.
    const modified = p.date_modified ?? null;
    const added = p.date_added ?? null;

    stmts.push(
      db
        .prepare(
          `INSERT INTO terminal_inventory
           (terminal_id, item_uuid, item_type, item_name, latest_buy_price, latest_sell_price, latest_source, latest_observed_at, game_version_id, uex_date_modified, uex_date_added)
           VALUES (?, ?, 'commodity', ?, ?, ?, 'uex', datetime('now'), ?, ?, ?)
           ON CONFLICT(terminal_id, item_uuid) DO UPDATE SET
           latest_buy_price = excluded.latest_buy_price,
           latest_sell_price = excluded.latest_sell_price,
           latest_source = 'uex',
           latest_observed_at = datetime('now'),
           game_version_id = excluded.game_version_id,
           uex_date_modified = excluded.uex_date_modified,
           uex_date_added = COALESCE(excluded.uex_date_added, terminal_inventory.uex_date_added)`,
        )
        .bind(ourTermId, itemUuid, p.commodity_name, buy, sell, gvId, modified, added),
    );
  }

  // D1 batch limit is 100 statements
  for (let i = 0; i < stmts.length; i += 100) {
    await db.batch(stmts.slice(i, i + 100));
  }

  return stmts.length;
}

export async function syncItems(
  db: D1Database,
  uexToOurs: Map<number, number>,
  gvId: number,
  prefetched?: UexItemPrice[],
): Promise<number> {
  // Reuse the feed already fetched by ensureUexTerminals when available, so the
  // 6MB items feed is fetched once per sync (not twice).
  const prices = prefetched ?? (await fetchUex<UexItemPrice>("items_prices_all"));

  const stmts: D1PreparedStatement[] = [];
  for (const p of prices) {
    const ourTermId = uexToOurs.get(p.id_terminal);
    if (!ourTermId) continue;

    if (!p.item_uuid) continue;

    const buy = p.price_buy || null;
    const sell = p.price_sell || null;
    if (!buy && !sell) continue;

    const modified = p.date_modified ?? null;
    const added = p.date_added ?? null;

    // game_version_id MUST be in the SET clause — see comment in syncCommodities.
    // uex_date_modified / uex_date_added are also in the SET — see migration 0247.
    stmts.push(
      db
        .prepare(
          `INSERT INTO terminal_inventory
           (terminal_id, item_uuid, item_type, item_name, latest_buy_price, latest_sell_price, latest_source, latest_observed_at, game_version_id, uex_date_modified, uex_date_added)
           VALUES (?, ?, 'item', ?, ?, ?, 'uex', datetime('now'), ?, ?, ?)
           ON CONFLICT(terminal_id, item_uuid) DO UPDATE SET
           latest_buy_price = excluded.latest_buy_price,
           latest_sell_price = excluded.latest_sell_price,
           latest_source = 'uex',
           latest_observed_at = datetime('now'),
           game_version_id = excluded.game_version_id,
           uex_date_modified = excluded.uex_date_modified,
           uex_date_added = COALESCE(excluded.uex_date_added, terminal_inventory.uex_date_added)`,
        )
        .bind(ourTermId, p.item_uuid, p.item_name, buy, sell, gvId, modified, added),
    );
  }

  for (let i = 0; i < stmts.length; i += 100) {
    await db.batch(stmts.slice(i, i + 100));
  }

  return stmts.length;
}
