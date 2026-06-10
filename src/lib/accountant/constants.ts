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

export const DEFAULT_TAGS = {
  assets: [], // intentionally empty — assets are untagged
  running_cost: ["ship_consumables", "player_consumables"],
  financial: ["tactical"],
  production: ["general", "specified"],
  trading: ["minerals", "salvage", "harvestable", "collectibles"],
} as const satisfies Record<Category, readonly string[]>;
export type DefaultTagValue = (typeof DEFAULT_TAGS)[Category][number];

// Companion hints the auto-categorizer understands (design §4.2). The single
// source of truth for categorize.ts's rules AND ingest's unknown-hint metric —
// add new hints here first, then teach classifyEntry the rule.
export const KNOWN_HINTS = ["ship_purchase", "repair", "fuel"] as const;
export type KnownHint = (typeof KNOWN_HINTS)[number];

// Fuel purchases on these ships go to the Sorting List instead of auto-cat
// (master doc §Running cost — fuel may be Trading/Production stock for them).
// v1: entries are CASE-INSENSITIVE SUBSTRING matched against the full
// parser-supplied ship name. New entries must be unique, non-overlapping
// substrings checked against the full ship roster (e.g. never add something
// as short as "star").
export const FUEL_MANUAL_REVIEW_SHIPS = [
  "starfarer",
  "pioneer",
  "idris",
  "kraken",
] as const;
