import { z } from "zod";
import type { RenderRef } from "./types";

/** Every kind of item that can have a published render. */
export const RENDER_KINDS = [
  "vehicle",
  "ship_weapon",
  "fps_weapon",
  "fps_melee",
  "fps_attachment",
  "fps_armour",
  "armour_set",
  "fps_clothing",
  "consumable",
  "vehicle_component",
  "ship_missile",
  "carryable",
  "prop",
  "fps_utility",
  "cargo_crate",
  "storage_container",
  "harvestable",
] as const;

export type RenderKind = (typeof RENDER_KINDS)[number];

export const RenderKindSchema = z.enum(RENDER_KINDS);

/**
 * The render_* columns a query selects through `renderJoin` + `renderCols`.
 * They are folded into `render` by `toRenderRef` / `withRender`.
 */
export interface RenderCols {
  render_hash: string | null;
  render_width: number | null;
  render_height: number | null;
  render_view: string | null;
}

/**
 * The one place that says which view a card or list shows: iso, then side,
 * then worn_male, then worn_female (last, so female-only clothing still has
 * an image; the large view offers both worn views).
 * `renderViewFilter` limits rows to those views and `renderViewRank` orders
 * them; use both on the same item_renders alias.
 */
export function renderViewFilter(alias: string): string {
  return `${alias}.view IN ('iso', 'side', 'worn_male', 'worn_female')`;
}

/** ORDER BY expression for `renderViewFilter`: lowest is preferred. */
export function renderViewRank(alias: string): string {
  return `CASE ${alias}.view WHEN 'iso' THEN 0 WHEN 'side' THEN 1 WHEN 'worn_male' THEN 2 ELSE 3 END`;
}

/**
 * LEFT JOIN that attaches at most one render row to each result row.
 *
 * `itemKeyExpr` and `variantExpr` are SQL expressions from the outer query
 * (e.g. `v.class_name`, `p.class_name`). Both are lower-cased: item_renders
 * keys are lower-case class_names. lower() wraps the outer value, not
 * `item_key`, so the (item_key, variant) index is still used.
 *
 * The match is a correlated lookup of one id, not a plain join, so an item
 * with renders in several views can never multiply rows. The view is picked
 * by `renderViewFilter` / `renderViewRank`.
 * Joined on item_key and variant, never on kind.
 */
export function renderJoin(alias: string, itemKeyExpr: string, variantExpr = "''"): string {
  return `LEFT JOIN item_renders ${alias} ON ${alias}.id = (
    SELECT _ir.id FROM item_renders _ir
    WHERE _ir.item_key = lower(${itemKeyExpr})
      AND _ir.variant = lower(${variantExpr})
      AND ${renderViewFilter("_ir")}
    ORDER BY ${renderViewRank("_ir")}
    LIMIT 1)`;
}

/**
 * LEFT JOIN of a loot item's render. Its stock render (item_key = class_name,
 * variant '') when there is one; otherwise the row whose variant is the
 * item's class_name under any item_key. That second case is a weapon finish:
 * the publisher stores it under the base weapon's key with the finish
 * class_name as the variant. Select `alias.item_key` and `alias.variant` so the
 * large view opens the base item with that finish selected.
 * One row per item, views as in `renderJoin`.
 */
export function lootRenderJoin(alias: string, classNameExpr: string): string {
  return `LEFT JOIN item_renders ${alias} ON ${alias}.id = (
    SELECT _ir.id FROM item_renders _ir
    WHERE ((_ir.item_key = lower(${classNameExpr}) AND _ir.variant = '')
        OR _ir.variant = lower(${classNameExpr}))
      AND ${renderViewFilter("_ir")}
    ORDER BY (_ir.variant <> ''), ${renderViewRank("_ir")}, _ir.item_key
    LIMIT 1)`;
}

/** SELECT list for the row joined by `renderJoin(alias, …)`. */
export function renderCols(alias: string): string {
  return `${alias}.hash AS render_hash, ${alias}.width AS render_width,
    ${alias}.height AS render_height, ${alias}.view AS render_view`;
}

/** Fold the render_* columns into a RenderRef; null when no render matched. */
export function toRenderRef(row: RenderCols): RenderRef | null {
  if (row.render_hash == null) return null;
  return {
    hash: row.render_hash,
    width: row.render_width as number,
    height: row.render_height as number,
    view: row.render_view as string,
  };
}

/** Replace a row's render_* columns with a single `render` field. */
export function withRender<T extends RenderCols>(row: T): Omit<T, keyof RenderCols> & { render: RenderRef | null } {
  const { render_hash, render_width, render_height, render_view, ...rest } = row;
  return { ...rest, render: toRenderRef({ render_hash, render_width, render_height, render_view }) };
}
