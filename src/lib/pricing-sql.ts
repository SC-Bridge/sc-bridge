/**
 * Effective shop-price SQL fragments for `terminal_inventory`.
 *
 * Each `terminal_inventory` row carries two price tiers:
 *   - `latest_*` — community-reported prices (UEX sync / user submissions),
 *     present only for items UEX actually tracks (overwhelmingly commodities).
 *   - `base_*`   — the in-game default price from p4k extraction. For most ship
 *     components this is the ONLY price they ever have (UEX doesn't list them).
 *
 * The effective price is the community price when present, else the base price.
 * Earlier queries read `latest_*` only and gated on `latest_source IS NOT NULL`,
 * which hid every ship component's price (UEX doesn't cover them) — so the
 * loadout planner, Ship DB and Loot DB rendered every component as "Loot Only"
 * even though it is sold in-game. These helpers surface the base price as the
 * fallback so real shop prices appear everywhere.
 *
 * `ti` is the table alias used in the query (default "ti"). These fragments
 * reference only fixed column names — no user input is interpolated.
 */

/** Effective buy price: community price when present, else extracted base. */
export const buyPriceSQL = (ti = "ti"): string =>
  `COALESCE(${ti}.latest_buy_price, ${ti}.base_buy_price)`;

/** Effective sell price: community price when present, else extracted base. */
export const sellPriceSQL = (ti = "ti"): string =>
  `COALESCE(${ti}.latest_sell_price, ${ti}.base_sell_price)`;

/** Provenance label for the effective price ('uex' / 'user' / else 'base'). */
export const priceSourceSQL = (ti = "ti"): string =>
  `COALESCE(${ti}.latest_source, 'base')`;

/** True when the item has a buy OR sell price from either tier. */
export const pricedSQL = (ti = "ti"): string =>
  `(${buyPriceSQL(ti)} > 0 OR ${sellPriceSQL(ti)} > 0)`;

/** True when the item has a buy price from either tier. */
export const buyablePricedSQL = (ti = "ti"): string => `${buyPriceSQL(ti)} > 0`;
