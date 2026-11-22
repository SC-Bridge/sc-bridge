import { z } from "zod";

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
