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
  errors: string[];
}

export async function syncUexPrices(
  db: D1Database,
  type: "commodities" | "items" | "all" = "all",
  kv?: KVNamespace,
): Promise<SyncResult> {
  const result: SyncResult = { commodities: 0, items: 0, errors: [] };

  // Get terminal mappings: uex_terminal_id → our terminal_id
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

  // Get game version for inserts
  const gv = await db.prepare("SELECT id FROM game_versions WHERE is_default = 1 LIMIT 1").first<{ id: number }>();
  const gvId = gv?.id ?? 1;

  try {
    if (type === "commodities" || type === "all") {
      result.commodities = await syncCommodities(db, uexToOurs, gvId);
    }
  } catch (e) {
    result.errors.push(`Commodity sync failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    if (type === "items" || type === "all") {
      result.items = await syncItems(db, uexToOurs, gvId);
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
): Promise<number> {
  const prices = await fetchUex<UexItemPrice>("items_prices_all");

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
