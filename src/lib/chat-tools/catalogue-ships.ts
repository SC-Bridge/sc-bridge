import { getShipLoadout } from "../../db/queries";
import type { ChatToolHandler } from "../chat-tools";
import { bool, CANDIDATE_CAP, clip, num, SEARCH_CAP, str } from "./args";

/** Same base filter as GET /api/vehicles: real, current, player ships. */
const BASE_WHERE = "v.is_paint_variant = 0 AND v.removed = 0 AND v.is_npc_only = 0";

const PRODUCTION_STATUS_SQL =
  "CASE WHEN v.parent_vehicle_id IS NOT NULL AND pps.key IS NOT NULL THEN pps.key ELSE ps.key END";

const SHIP_JOINS = `LEFT JOIN manufacturers m ON m.id = v.manufacturer_id
  LEFT JOIN production_statuses ps ON ps.id = v.production_status_id
  LEFT JOIN vehicles pv ON pv.id = v.parent_vehicle_id
  LEFT JOIN production_statuses pps ON pps.id = pv.production_status_id`;

const SHIP_COLS = `v.slug, v.name, m.name AS manufacturer, v.focus, v.classification, v.size_label,
  v.crew_min, v.crew_max, v.cargo, v.speed_scm, v.pledge_price, v.price_auec, v.is_pledgeable,
  ${PRODUCTION_STATUS_SQL} AS production_status`;

const SORTS: Record<string, string> = {
  name: "v.name ASC",
  cargo: "v.cargo DESC",
  pledge_price: "v.pledge_price ASC",
  price_auec: "v.price_auec ASC",
  crew_max: "v.crew_max DESC",
  speed_scm: "v.speed_scm DESC",
};

export const searchShipsTool: ChatToolHandler = {
  spec: {
    name: "search_ships",
    description:
      "Search every ship and vehicle in the game (current LIVE patch), not just the user's fleet. All filters are optional; combine them to narrow down. Returns at most 25 ships plus `total` matches.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Text in the ship or manufacturer name." },
        manufacturer: { type: "string", description: "Manufacturer name or code, e.g. 'Drake' or 'DRAK'." },
        focus: { type: "string", description: "Role text, matched against focus and classification, e.g. 'cargo', 'mining', 'fighter'." },
        size_label: { type: "string", description: "Size, e.g. 'snub', 'small', 'medium', 'large', 'capital'." },
        crew_min: { type: "number", description: "Ships that can take at least this many crew." },
        crew_max: { type: "number", description: "Ships that can be flown with at most this many crew." },
        cargo_min: { type: "number", description: "Minimum cargo capacity in SCU." },
        pledge_price_max: { type: "number", description: "Maximum pledge price in USD." },
        auec_price_max: { type: "number", description: "Maximum in-game price in aUEC." },
        pledgeable: { type: "boolean", description: "true = only ships sold on the RSI pledge store." },
        production_status: { type: "string", description: "e.g. 'flight_ready', 'in_concept'." },
        sort: { type: "string", enum: Object.keys(SORTS), description: "Sort order (default name)." },
      },
    },
  },
  async run(args, ctx) {
    const where = [BASE_WHERE];
    const binds: unknown[] = [];
    const like = (v: string) => `%${v}%`;

    const query = str(args.query);
    if (query) { where.push("(v.name LIKE ? OR m.name LIKE ?)"); binds.push(like(query), like(query)); }
    const maker = str(args.manufacturer);
    if (maker) { where.push("(m.name LIKE ? OR m.code = ?)"); binds.push(like(maker), maker.toUpperCase()); }
    const focus = str(args.focus);
    if (focus) { where.push("(v.focus LIKE ? OR v.classification LIKE ?)"); binds.push(like(focus), like(focus)); }
    const size = str(args.size_label);
    if (size) { where.push("LOWER(v.size_label) = LOWER(?)"); binds.push(size); }
    const crewMin = num(args.crew_min);
    if (crewMin !== undefined) { where.push("v.crew_max >= ?"); binds.push(crewMin); }
    const crewMax = num(args.crew_max);
    if (crewMax !== undefined) { where.push("v.crew_min <= ?"); binds.push(crewMax); }
    const cargoMin = num(args.cargo_min);
    if (cargoMin !== undefined) { where.push("v.cargo >= ?"); binds.push(cargoMin); }
    const pledgeMax = num(args.pledge_price_max);
    if (pledgeMax !== undefined) { where.push("v.pledge_price <= ?"); binds.push(pledgeMax); }
    const auecMax = num(args.auec_price_max);
    if (auecMax !== undefined) { where.push("v.price_auec <= ?"); binds.push(auecMax); }
    const pledgeable = bool(args.pledgeable);
    if (pledgeable !== undefined) { where.push("v.is_pledgeable = ?"); binds.push(pledgeable ? 1 : 0); }
    const status = str(args.production_status);
    if (status) { where.push(`${PRODUCTION_STATUS_SQL} = ?`); binds.push(status); }

    const sortKey = str(args.sort) ?? "name";
    const order = SORTS[sortKey] ?? SORTS.name;
    const whereSql = where.join(" AND ");

    const total = await ctx.db
      .prepare(`SELECT COUNT(*) AS n FROM vehicles v ${SHIP_JOINS} WHERE ${whereSql}`)
      .bind(...binds)
      .first<{ n: number }>();
    const { results } = await ctx.db
      .prepare(`SELECT ${SHIP_COLS} FROM vehicles v ${SHIP_JOINS} WHERE ${whereSql} ORDER BY ${order}, v.name LIMIT ${SEARCH_CAP}`)
      .bind(...binds)
      .all();
    return { label: "Searched ships", total: total?.n ?? 0, ships: results };
  },
};

type ShipRow = Record<string, unknown> & { id: number; slug: string; name: string };

/** Exact slug, then exact name, then a unique contains-match; several matches → candidates. */
async function resolveShip(db: D1Database, args: Record<string, unknown>): Promise<ShipRow | { error: string; candidates?: unknown[] }> {
  const slug = str(args.slug);
  const name = str(args.name);
  if (!slug && !name) return { error: "Give a ship slug or name." };
  const select = `SELECT v.id, ${SHIP_COLS}, v.length, v.beam, v.height, v.mass, v.speed_max,
      v.acquisition_type, v.acquisition_source_name, v.description
    FROM vehicles v ${SHIP_JOINS} WHERE ${BASE_WHERE}`;
  if (slug) {
    const row = await db.prepare(`${select} AND v.slug = ? LIMIT 1`).bind(slug).first<ShipRow>();
    if (row) return row;
  }
  const needle = name ?? slug!;
  const exact = await db.prepare(`${select} AND LOWER(v.name) = LOWER(?) LIMIT 1`).bind(needle).first<ShipRow>();
  if (exact) return exact;
  const { results } = await db
    .prepare(`${select} AND v.name LIKE ? ORDER BY v.name LIMIT ${CANDIDATE_CAP + 1}`)
    .bind(`%${needle}%`)
    .all<ShipRow>();
  if (results.length === 1) return results[0];
  if (results.length === 0) return { error: `No ship matches "${needle}".` };
  return {
    error: "Several ships match — call again with one of these slugs.",
    candidates: results.slice(0, CANDIDATE_CAP).map((r) => ({ slug: r.slug, name: r.name })),
  };
}

export const getShipDetailsTool: ChatToolHandler = {
  spec: {
    name: "get_ship_details",
    description:
      "Full details for any ship in the game: specs, prices (pledge USD and in-game aUEC), how it's acquired, stock loadout, and how many the user owns. Prefer slug (from search_ships); name works too.",
    parameters: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Ship slug from search_ships (preferred)." },
        name: { type: "string", description: "Ship name, e.g. 'Cutlass Black'." },
      },
    },
  },
  async run(args, ctx) {
    const ship = await resolveShip(ctx.db, args);
    if ("error" in ship) return ship;
    const scopeJson = ctx.scopeIds ? JSON.stringify(ctx.scopeIds) : null;
    const [owned, loadout] = await Promise.all([
      ctx.db
        .prepare(
          `SELECT COUNT(*) AS n FROM user_fleet uf
            WHERE uf.user_id = ? AND uf.vehicle_id = ?
              AND (? IS NULL OR uf.rsi_account_id IN (SELECT value FROM json_each(?)))`,
        )
        .bind(ctx.userId, ship.id, scopeJson, scopeJson)
        .first<{ n: number }>(),
      getShipLoadout(ctx.db, ship.slug),
    ]);
    const { id: _id, description, ...rest } = ship;
    return {
      label: rest.name,
      ...rest,
      description: clip(description),
      owned_count: owned?.n ?? 0,
      loadout: loadout.map((p) => ({
        port: p.port_name,
        type: p.component_type,
        size: p.component_size,
        component: p.component_name,
      })),
    };
  },
};
