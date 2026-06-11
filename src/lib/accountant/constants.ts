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
  "mission_income",
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
  running_cost: ["ship_consumables", "player_consumables", "location_invest"],
  financial: ["tactical"],
  production: ["general", "specified"],
  trading: ["minerals", "salvage", "harvestable", "collectibles", "player_trading", "npc_trading"],
  mission_income: [], // intentionally empty — mission income is untagged
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

// ─── P&L statement mapping (M3 — presentation-design "Category → P&L line") ────
//
// Statement class is a PURE FUNCTION of (category, sign, source) — no schema
// change, no per-entry input. This is the single source of truth the P&L report
// reads from; the completeness test asserts no category is silently dropped.

/** Categories that never appear on the P&L (they are balance-sheet / equity / loan movements). */
export const PL_EXCLUDED_CATEGORIES: readonly Category[] = ["assets"] as const;

/** Sources that never appear on the P&L regardless of category. */
export const PL_EXCLUDED_SOURCES: readonly Source[] = [
  "adjustment",       // equity correction (opening balance), not income/expense
  "loan_principal",   // balance-sheet movement
  "loan_repayment",   // balance-sheet movement
] as const;

export type PLSection = "revenue" | "expenses";

export interface StatementLine {
  /** Stable line key (used as drill-down anchor + render key). */
  line: string;
  section: PLSection;
  /** Human label for the statement row. */
  label: string;
  /** Categories whose entries (on the matching sign) roll into this line. Omitted for source-keyed interest lines. */
  categories?: Category[];
  /** If true, this line is broken out PER TAG in the report (running cost, production investment). */
  perTag?: boolean;
}

/**
 * Order matters — this is the render order of the P&L. Interest lines are
 * source-keyed (accrual_tick / loan_fee) and resolved in classifyPLLine, so they
 * carry no `categories`.
 */
export const STATEMENT_LINES: readonly StatementLine[] = [
  { line: "trading_income",    section: "revenue",  label: "Trading income",               categories: ["trading"] },
  { line: "production_income", section: "revenue",  label: "Production income (derived)",  categories: ["production"] },
  { line: "mission_income",    section: "revenue",  label: "Mission income",               categories: ["mission_income"] },
  { line: "interest_income",   section: "revenue",  label: "Interest income" }, // source-keyed
  { line: "running_cost",      section: "expenses", label: "Running cost",                 categories: ["running_cost"], perTag: true },
  { line: "production_invest", section: "expenses", label: "Production investment",        categories: ["production"],   perTag: true },
  { line: "tactical",          section: "expenses", label: "Tactical investments",         categories: ["financial"] },
  { line: "interest_expense",  section: "expenses", label: "Interest expense" }, // source-keyed
] as const;

interface PLEntry {
  category: Category | null;
  amount: number;
  source: Source;
  tag?: string | null;
}

/**
 * Resolve one ledger entry to its P&L line, or null if excluded.
 * Sign decides revenue vs expense for ambiguous categories (production appears
 * on both sides). Interest is source-keyed (accrual_tick/loan_fee) by sign.
 */
export function classifyPLLine(e: PLEntry): { section: PLSection; line: string } | null {
  if ((PL_EXCLUDED_SOURCES as readonly string[]).includes(e.source)) return null;
  if (e.category !== null && (PL_EXCLUDED_CATEGORIES as readonly string[]).includes(e.category)) return null;
  if (e.amount === 0) return null;

  // Interest is source-keyed regardless of category (financial), split by sign.
  if (e.source === "accrual_tick" || e.source === "loan_fee") {
    return e.amount > 0
      ? { section: "revenue", line: "interest_income" }
      : { section: "expenses", line: "interest_expense" };
  }

  switch (e.category) {
    case "trading":
      // trading expenses are not modelled (locked UX B.3 — no purchases line on the P&L)
      return e.amount > 0 ? { section: "revenue", line: "trading_income" } : null;
    case "mission_income":
      return e.amount > 0 ? { section: "revenue", line: "mission_income" } : null;
    case "production":
      return e.amount > 0
        ? { section: "revenue", line: "production_income" }
        : { section: "expenses", line: "production_invest" };
    case "running_cost":
      return e.amount < 0 ? { section: "expenses", line: "running_cost" } : null;
    case "financial":
      // financial/tactical negative → tactical investment expense.
      // (loan_* sources already excluded above; remaining financial is tactical.)
      return e.amount < 0 ? { section: "expenses", line: "tactical" } : null;
    default:
      return null;
  }
}
