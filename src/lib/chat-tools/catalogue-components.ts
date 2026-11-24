import { COMPONENT_STAT_COLS, componentStatJoins, getComponentShops } from "../../db/queries";
import { buyPriceSQL, buyablePricedSQL } from "../pricing-sql";
import type { ChatToolHandler } from "../chat-tools";
import { CANDIDATE_CAP, clip, num, SEARCH_CAP, str } from "./args";

interface Category {
  /** vehicle_components.type values, or null for ship_missiles. */
  types: string[] | null;
  /** Headline stats: result key → SQL expression. */
  stats: Record<string, string>;
}

/**
 * Chat category → component types (confirmed against staging
 * `SELECT DISTINCT type FROM vehicle_components`, 2026-11-25).
 */
export const COMPONENT_CATEGORIES: Record<string, Category> = {
  weapon: {
    types: ["WeaponGun"],
    stats: {
      dps: "cw.dps",
      damage_per_shot: "cw.damage_per_shot",
      damage_type: "cw.damage_type",
      rounds_per_minute: "cw.rounds_per_minute",
      effective_range: "cw.effective_range",
    },
  },
  missile_launcher: { types: ["MissileLauncher"], stats: {} },
  missile: {
    types: null,
    stats: { damage: "sm.damage", lock_range: "sm.lock_range", tracking_signal: "sm.tracking_signal" },
  },
  turret: { types: ["Turret", "TurretBase"], stats: { rotation_speed: "ct.rotation_speed" } },
  shield: { types: ["Shield"], stats: { shield_hp: "cs.shield_hp", shield_regen: "cs.shield_regen" } },
  power_plant: { types: ["PowerPlant"], stats: { power_output: "cp.power_output" } },
  cooler: { types: ["Cooler"], stats: { cooling_rate: "cc.cooling_rate" } },
  quantum_drive: {
    types: ["QuantumDrive"],
    stats: { quantum_speed: "cq.quantum_speed", quantum_range: "cq.quantum_range", spool_time: "cq.spool_time" },
  },
  radar: { types: ["Radar"], stats: { radar_range: "cr.radar_range" } },
  thruster: { types: ["MainThruster", "ManneuverThruster"], stats: { thrust_force: "cth.thrust_force" } },
  qed: { types: ["QuantumInterdictionGenerator"], stats: { qed_range: "ce.qed_range" } },
  countermeasure: { types: ["WeaponDefensive"], stats: {} },
  mining_laser: { types: ["WeaponMining"], stats: {} },
};

const CATEGORY_LIST = Object.keys(COMPONENT_CATEGORIES).join(", ");

/** Items in the shop data are keyed by class name; loot_map stores it with an entity prefix. */
const LM_CLASS = "REPLACE(lm.class_name, 'EntityClassDefinition.', '')";

/** One table's worth of SQL pieces, so ship components and missiles share the search code. */
function source(cat: Category) {
  if (cat.types === null) {
    return {
      from: "ship_missiles sm LEFT JOIN manufacturers m ON m.id = sm.manufacturer_id",
      alias: "sm",
      where: ["sm.removed = 0", "COALESCE(sm.is_deleted, 0) = 0"],
      binds: [] as unknown[],
    };
  }
  return {
    from: `vehicle_components vc LEFT JOIN manufacturers m ON m.id = vc.manufacturer_id ${componentStatJoins()}`,
    alias: "vc",
    where: [
      `vc.type IN (${cat.types.map(() => "?").join(", ")})`,
      "vc.removed = 0",
      "(vc.class_name IS NULL OR vc.class_name NOT LIKE 'vncl_%')",
    ],
    binds: [...cat.types] as unknown[],
  };
}

export const searchComponentsTool: ChatToolHandler = {
  spec: {
    name: "search_components",
    description:
      "Search every ship weapon, missile and component in the game (current LIVE patch), with headline stats and the cheapest shop that sells each in aUEC. Returns at most 25 plus `total` matches.",
    parameters: {
      type: "object",
      properties: {
        category: { type: "string", enum: Object.keys(COMPONENT_CATEGORIES), description: "What kind of item." },
        size: { type: "number", description: "Component size, e.g. 1–4 for most ship components." },
        grade: { type: "string", description: "Grade, e.g. 'A', 'B', 'C', 'D'." },
        manufacturer: { type: "string", description: "Manufacturer name or code." },
        query: { type: "string", description: "Text in the item name." },
        sort_by: { type: "string", description: "A headline stat to sort by, highest first (e.g. dps, shield_hp, quantum_speed, power_output, cooling_rate)." },
        max_price: { type: "number", description: "Only items buyable somewhere for at most this many aUEC." },
      },
      required: ["category"],
    },
  },
  async run(args, ctx) {
    const catKey = str(args.category)?.toLowerCase();
    const cat = catKey ? COMPONENT_CATEGORIES[catKey] : undefined;
    if (!cat || !catKey) return { error: `Unknown category. Use one of: ${CATEGORY_LIST}.` };

    const src = source(cat);
    const a = src.alias;
    const where = [...src.where];
    const binds = [...src.binds];

    const size = num(args.size);
    if (size !== undefined) { where.push(`${a}.size = ?`); binds.push(size); }
    const grade = str(args.grade, 10);
    if (grade) { where.push(`UPPER(${a}.grade) = UPPER(?)`); binds.push(grade); }
    const maker = str(args.manufacturer);
    if (maker) { where.push(`(m.name LIKE ? OR m.code = ? OR ${a}.manufacturer_code = ?)`); binds.push(`%${maker}%`, maker.toUpperCase(), maker.toUpperCase()); }
    const query = str(args.query);
    if (query) { where.push(`${a}.name LIKE ?`); binds.push(`%${query}%`); }
    const maxPrice = num(args.max_price);
    if (maxPrice !== undefined) {
      where.push(`EXISTS (SELECT 1 FROM terminal_inventory ti JOIN loot_map lm ON lm.uuid = ti.item_uuid
        WHERE ${LM_CLASS} = ${a}.class_name AND ${buyablePricedSQL("ti")} AND ${buyPriceSQL("ti")} <= ?)`);
      binds.push(maxPrice);
    }

    const sortKey = str(args.sort_by);
    const sortExpr = sortKey ? cat.stats[sortKey] : undefined;
    const order = sortExpr ? `${sortExpr} DESC NULLS LAST, ${a}.name` : `${a}.name`;
    const statCols = Object.entries(cat.stats).map(([k, expr]) => `${expr} AS s_${k}`);
    const whereSql = where.join(" AND ");

    const total = await ctx.db
      .prepare(`SELECT COUNT(*) AS n FROM ${src.from} WHERE ${whereSql}`)
      .bind(...binds)
      .first<{ n: number }>();

    const { results } = await ctx.db
      .prepare(
        `WITH page AS (
           SELECT ${a}.name, ${a}.class_name, ${a}.size, ${a}.grade, m.name AS manufacturer,
             ${[...statCols, `ROW_NUMBER() OVER (ORDER BY ${order}) AS pos`].join(", ")}
           FROM ${src.from} WHERE ${whereSql}
           ORDER BY ${order} LIMIT ${SEARCH_CAP}
         ),
         prices AS (
           SELECT ${LM_CLASS} AS cn,
             COALESCE(s.display_name, REPLACE(REPLACE(t.shop_name_key, 'Inv_', ''), '_', ' ')) AS shop,
             s.location_label AS location,
             ROUND(${buyPriceSQL("ti")}) AS buy_price,
             ROW_NUMBER() OVER (PARTITION BY lm.class_name ORDER BY ${buyPriceSQL("ti")} ASC) AS rn
           FROM terminal_inventory ti
           JOIN loot_map lm ON lm.uuid = ti.item_uuid
           JOIN terminals t ON t.id = ti.terminal_id
           LEFT JOIN shops s ON s.id = t.shop_id
           WHERE ${buyablePricedSQL("ti")} AND ${LM_CLASS} IN (SELECT class_name FROM page)
         )
         SELECT page.*, prices.shop, prices.location, prices.buy_price
         FROM page LEFT JOIN prices ON prices.cn = page.class_name AND prices.rn = 1
         ORDER BY page.pos`,
      )
      .bind(...binds)
      .all<Record<string, unknown>>();

    return {
      label: "Searched components",
      total: total?.n ?? 0,
      components: results.map((r) => ({
        name: r.name,
        class_name: r.class_name,
        category: catKey,
        size: r.size,
        grade: r.grade,
        manufacturer: r.manufacturer,
        stats: Object.fromEntries(Object.keys(cat.stats).map((k) => [k, r[`s_${k}`] ?? null])),
        cheapest: r.buy_price == null ? null : { shop: r.shop, location: r.location, buy_price: r.buy_price },
      })),
    };
  },
};

type Found = Record<string, unknown> & { name: string; class_name: string | null };

const COMPONENT_DETAIL_SQL = `SELECT ${COMPONENT_STAT_COLS}, vc.class_name, m.name AS manufacturer
  FROM vehicle_components vc LEFT JOIN manufacturers m ON m.id = vc.manufacturer_id ${componentStatJoins()}
  WHERE vc.removed = 0`;
const MISSILE_DETAIL_SQL = `SELECT sm.name, sm.class_name, sm.type, sm.sub_type, sm.size, sm.grade, sm.description,
    sm.missile_type, sm.lock_time, sm.tracking_signal, sm.damage, sm.damage_type, sm.blast_radius,
    sm.speed, sm.lock_range, sm.ammo_count, m.name AS manufacturer
  FROM ship_missiles sm LEFT JOIN manufacturers m ON m.id = sm.manufacturer_id
  WHERE sm.removed = 0 AND COALESCE(sm.is_deleted, 0) = 0`;

/** Exact class name, then exact name, then a unique contains-match, across components and missiles. */
async function resolveComponent(db: D1Database, args: Record<string, unknown>): Promise<Found | { error: string; candidates?: unknown[] }> {
  const className = str(args.class_name);
  const name = str(args.name);
  if (!className && !name) return { error: "Give a component class_name or name." };
  const tables: Array<[string, string]> = [[COMPONENT_DETAIL_SQL, "vc"], [MISSILE_DETAIL_SQL, "sm"]];

  if (className) {
    for (const [sql, a] of tables) {
      const row = await db.prepare(`${sql} AND ${a}.class_name = ? LIMIT 1`).bind(className).first<Found>();
      if (row) return row;
    }
  }
  const needle = name ?? className!;
  for (const [sql, a] of tables) {
    const row = await db.prepare(`${sql} AND LOWER(${a}.name) = LOWER(?) LIMIT 1`).bind(needle).first<Found>();
    if (row) return row;
  }
  const matches: Found[] = [];
  for (const [sql, a] of tables) {
    const { results } = await db.prepare(`${sql} AND ${a}.name LIKE ? ORDER BY ${a}.name LIMIT ${CANDIDATE_CAP + 1}`).bind(`%${needle}%`).all<Found>();
    matches.push(...results);
  }
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) return { error: `No component matches "${needle}".` };
  return {
    error: "Several components match — call again with one of these class names.",
    candidates: matches.slice(0, CANDIDATE_CAP).map((r) => ({ class_name: r.class_name, name: r.name })),
  };
}

export const getComponentDetailsTool: ChatToolHandler = {
  spec: {
    name: "get_component_details",
    description:
      "Full stats for one ship weapon, missile or component, plus every shop that sells it with its aUEC price (cheapest first). Prefer class_name (from search_components); name works too.",
    parameters: {
      type: "object",
      properties: {
        class_name: { type: "string", description: "Class name from search_components (preferred)." },
        name: { type: "string", description: "Item name, e.g. 'FR-76'." },
      },
    },
  },
  async run(args, ctx) {
    const found = await resolveComponent(ctx.db, args);
    if ("error" in found) return found;
    const shops = found.class_name ? await getComponentShops(ctx.db, found.class_name) : [];
    const details = Object.fromEntries(Object.entries(found).filter(([, v]) => v !== null && v !== undefined));
    return {
      label: found.name,
      ...details,
      description: clip(found.description),
      shops: shops.map((s) => ({ shop: s.shop_name, location: s.location_label, buy_price: s.buy_price })),
    };
  },
};
