/**
 * Accountant domain constants — design: accountant-m1-m3-design.md.
 * Default tags are code constants, not DB rows: they can never be deleted
 * or renamed, so they don't belong in user data (only custom trading tags
 * live in accountant_tags).
 */

export const CATEGORIES = [
  "assets",
  "running_cost",
  "financial",
  "production",
  "trading",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const SOURCES = [
  "parsed",
  "manual",
  "adjustment",
  "loan_principal",
  "loan_fee",
  "loan_repayment",
  "accrual_tick",
] as const;
export type Source = (typeof SOURCES)[number];

export const DEFAULT_TAGS: Record<Category, readonly string[]> = {
  assets: [],
  running_cost: ["ship_consumables", "player_consumables"],
  financial: ["tactical"],
  production: ["general", "specified"],
  trading: ["minerals", "salvage", "harvestable", "collectibles"],
};

// Fuel purchases on these ships go to the Sorting List instead of auto-cat
// (master doc §Running cost — fuel may be Trading/Production stock for them).
// v1: case-insensitive substring match on the parser-supplied ship name.
export const FUEL_MANUAL_REVIEW_SHIPS = [
  "starfarer",
  "pioneer",
  "idris",
  "kraken",
] as const;
