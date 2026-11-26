import type { ChatToolHandler, ToolContext } from "../chat-tools";
import { str } from "./args";

export const MY_ITEMS_CAP = 100;
/** Serialised size cap for one section's items. The result is re-sent to the model on every later round. */
export const MY_ITEMS_MAX_CHARS = 24_000;

/** Longest prefix of `items` whose JSON fits in MY_ITEMS_MAX_CHARS. */
function fitToBudget(items: Record<string, unknown>[]): Record<string, unknown>[] {
  let size = 2; // "[]"
  for (let i = 0; i < items.length; i++) {
    size += JSON.stringify(items[i]).length + (i > 0 ? 1 : 0);
    if (size > MY_ITEMS_MAX_CHARS) return items.slice(0, i);
  }
  return items;
}

/** Keeps rows of table alias `a` inside the chat's account scope (null scope = all accounts). */
const scoped = (a: string) => `(? IS NULL OR ${a}.rsi_account_id IN (SELECT value FROM json_each(?)))`;

interface Section {
  /** FROM + WHERE, with `?` for the user id first, then the scope json twice when `scoped`. */
  from: string;
  /** Column list for the item rows. */
  cols: string;
  order: string;
  scoped: boolean;
  /** Optional per-row reshaping (parse json columns, etc.). */
  map?: (row: Record<string, unknown>) => Record<string, unknown>;
}

const USD = (col: string) => `ROUND(${col} / 100.0, 2)`;

/**
 * One fixed, user-bound query per section. The user id and scope always come
 * from ToolContext — never from tool arguments.
 */
const SECTIONS: Record<string, Section> = {
  pledges: {
    from: `user_pledges up WHERE up.user_id = ? AND ${scoped("up")}`,
    cols: `up.name, ${USD("up.value_cents")} AS value_usd, up.currency, up.pledge_date_parsed AS pledge_date,
      up.is_reclaimable, up.is_giftable, up.is_warbond,
      (SELECT json_group_array(json_object('title', i.title, 'kind', i.kind)) FROM (
         SELECT upi.title, upi.kind FROM user_pledge_items upi
          WHERE upi.user_pledge_id = up.id ORDER BY upi.sort_order LIMIT 20) i) AS items_json`,
    order: "up.pledge_date_parsed DESC, up.id DESC",
    scoped: true,
    map: ({ items_json, ...r }) => ({ ...r, items: JSON.parse(String(items_json ?? "[]")) }),
  },
  ccus: {
    from: `user_pledges up WHERE up.user_id = ? AND up.ccu_from_name IS NOT NULL AND ${scoped("up")}`,
    cols: `up.name, up.ccu_from_name AS "from", up.ccu_to_name AS "to", ${USD("up.value_cents")} AS value_usd,
      up.is_warbond, up.is_reclaimable`,
    order: "up.ccu_from_name, up.ccu_to_name",
    scoped: true,
  },
  upgrade_history: {
    from: `user_pledge_upgrades upu WHERE upu.user_id = ? AND ${scoped("upu")}`,
    cols: `upu.upgrade_name, upu.applied_at_parsed AS applied_at, ${USD("upu.new_value_cents")} AS new_value_usd`,
    order: "upu.applied_at_parsed DESC, upu.id DESC",
    scoped: true,
  },
  buyback: {
    from: `user_buyback_pledges bb
      LEFT JOIN vehicles fv ON fv.id = bb.from_vehicle_id
      LEFT JOIN vehicles tv ON tv.id = bb.to_vehicle_id
      LEFT JOIN vehicles bv ON bv.id = bb.vehicle_id
      WHERE bb.user_id = ? AND ${scoped("bb")}`,
    cols: `bb.name, ${USD("bb.value_cents")} AS value_usd, bb.date, bb.buyback_type, bb.is_credit_reclaimable,
      bv.name AS ship, fv.name AS upgrade_from, tv.name AS upgrade_to`,
    order: "bb.id DESC",
    scoped: true,
  },
  paints: {
    from: `user_paints upa JOIN paints p ON p.id = upa.paint_id WHERE upa.user_id = ? AND ${scoped("upa")}`,
    cols: "p.name, upa.is_buyback",
    order: "p.name",
    scoped: true,
  },
  collection: {
    from: "user_loot_collection c LEFT JOIN loot_map lm ON lm.uuid = c.loot_uuid WHERE c.user_id = ?",
    cols: "COALESCE(lm.name, c.loot_uuid) AS name, lm.category, c.quantity",
    order: "lm.name",
    scoped: false,
  },
  wishlist: {
    from: "user_loot_wishlist w LEFT JOIN loot_map lm ON lm.uuid = w.loot_uuid WHERE w.user_id = ?",
    cols: "COALESCE(lm.name, w.loot_uuid) AS name, lm.category, w.quantity",
    order: "lm.name",
    scoped: false,
  },
  blueprints: {
    from: "user_blueprints ub LEFT JOIN crafting_blueprints cb ON cb.id = ub.crafting_blueprint_id WHERE ub.user_id = ?",
    cols: "COALESCE(ub.nickname, cb.name) AS name, cb.type, ub.is_owned, ub.is_wishlist, ub.crafted_quantity",
    order: "cb.name",
    scoped: false,
  },
  builds: {
    from: `(SELECT ib.user_id, ib.kind, ib.name, lm.name AS item, ib.updated_at
              FROM user_item_builds ib LEFT JOIN loot_map lm ON lm.uuid = ib.item_uuid
            UNION ALL
            SELECT bb.user_id, 'blueprint' AS kind, bb.name, cb.name AS item, bb.updated_at
              FROM user_blueprint_builds bb LEFT JOIN crafting_blueprints cb ON cb.uuid = bb.blueprint_uuid) b
           WHERE b.user_id = ?`,
    cols: "b.kind, b.name, b.item",
    order: "b.updated_at DESC",
    scoped: false,
  },
  cart: {
    from: `user_loadout_cart ulc
      JOIN vehicle_components vc ON vc.id = ulc.component_id
      LEFT JOIN user_fleet uf ON uf.id = ulc.source_fleet_id
      LEFT JOIN vehicles v ON v.id = uf.vehicle_id
      WHERE ulc.user_id = ?`,
    cols: "vc.name AS component, vc.type, vc.size, ulc.quantity, COALESCE(uf.custom_name, v.name) AS for_ship",
    order: "vc.type, vc.name",
    scoped: false,
  },
};

const SECTION_LIST = Object.keys(SECTIONS).join(", ");

async function listSection(section: Section, ctx: ToolContext) {
  const scopeJson = ctx.scopeIds ? JSON.stringify(ctx.scopeIds) : null;
  const binds = section.scoped ? [ctx.userId, scopeJson, scopeJson] : [ctx.userId];
  const total = await ctx.db.prepare(`SELECT COUNT(*) AS n FROM ${section.from}`).bind(...binds).first<{ n: number }>();
  const { results } = await ctx.db
    .prepare(`SELECT ${section.cols} FROM ${section.from} ORDER BY ${section.order} LIMIT ${MY_ITEMS_CAP}`)
    .bind(...binds)
    .all<Record<string, unknown>>();
  const rows = section.map ? results.map(section.map) : results;
  const items = fitToBudget(rows);
  return { total: total?.n ?? 0, items, ...(items.length < rows.length ? { truncated: true } : {}) };
}

export const getMyItemsTool: ChatToolHandler = {
  spec: {
    name: "get_my_items",
    description:
      "Read the user's own hangar and item data, one section at a time: pledges (with contents and USD value), ccus (standalone upgrades: from → to), upgrade_history (upgrades already applied), buyback, paints, collection (in-game items they have), wishlist, blueprints, builds (saved weapon/armour/blueprint builds) or cart (ship components they plan to buy). Only call it when the question needs that data. At most 100 items plus `total`.",
    parameters: {
      type: "object",
      properties: {
        section: { type: "string", enum: Object.keys(SECTIONS), description: "Which part of the user's data to read." },
      },
      required: ["section"],
    },
  },
  async run(args, ctx) {
    const key = str(args.section)?.toLowerCase();
    const section = key ? SECTIONS[key] : undefined;
    if (!section || !key) return { error: `Unknown section. Use one of: ${SECTION_LIST}.` };
    return { label: `Your ${key.replace("_", " ")}`, section: key, ...(await listSection(section, ctx)) };
  },
};
