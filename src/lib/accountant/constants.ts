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
  // M5 (design §3.3): source doubles as the order/workorder event kind.
  "po_reserve",
  "po_reserve_release",
  "order_fulfillment",
  "contract_fine",
  "wo_settlement",
  "workorder_summary",
  "loan_forgiveness", // M2 amendment (§5.6)
] as const;
export type Source = (typeof SOURCES)[number];

/** Orders are created within the ORIGINAL five categories — mission_income excluded (owner ruling). */
export const ORDER_CATEGORIES = ["assets", "running_cost", "financial", "production", "trading"] as const;
export type OrderCategory = (typeof ORDER_CATEGORIES)[number];

export const ORDER_TYPES = ["sale", "purchase"] as const;
export const FINE_RATE_TYPES = ["percent", "flat"] as const;
export const RATE_CHANGE_CONDITIONS = ["late", "partial"] as const;
export const ORDER_STATUSES = ["open", "in_progress", "complete", "cancelled"] as const;
export const WORKORDER_STATUSES = ["draft", "open", "in_progress", "complete", "cancelled", "terminated"] as const;

/**
 * Contract template defaults (design §5.1). modified_fields = the keys whose
 * submitted value deviates, computed ONCE at creation and stored — the template
 * may evolve later, the contract's marking must not.
 */
export const ORDER_TEMPLATE = {
  deliver_by: null as string | null,
  fine_interval: "daily",
  fine_rate_type: "percent",
  fine_rate: 0.5,
  rate_change_condition: null as string | null,
  rate_change_pct: 0,
  termination_clause: "standard",
} as const;

/**
 * Reserve-class sources: earmarks/markers, not economic events (design §6).
 * Excluded from P&L, Cash Flow, net-worth/equity, and investment-option.
 */
export const RESERVE_NEUTRAL_SOURCES = ["po_reserve", "po_reserve_release", "workorder_summary"] as const;
/** SQL fragment derived from the array — single source of truth, no drift. */
export const RESERVE_NEUTRAL_SQL = `source NOT IN (${RESERVE_NEUTRAL_SOURCES.map((s) => `'${s}'`).join(", ")})`;

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
  "po_reserve",       // reserve-class earmark, not an economic event (design §6)
  "po_reserve_release",
  "workorder_summary",
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
  /**
   * Extra ledger query params merged into this line's drill-down link, on top
   * of the generic `category` derived from `categories`. Source-keyed lines
   * (interest) carry their source filter here so the report route stays free
   * of per-line special cases.
   */
  drill?: Record<string, string>;
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
  { line: "interest_income",   section: "revenue",  label: "Interest income",              drill: { source: "accrual_tick,loan_fee" } },
  { line: "running_cost",      section: "expenses", label: "Running cost",                 categories: ["running_cost"], perTag: true },
  { line: "production_invest", section: "expenses", label: "Production investment",        categories: ["production"],   perTag: true },
  // tactical drill is category=financial only (no tag) — non-tactical financial
  // expenses over-show in the drill, accepted per the drill contract ruling.
  { line: "tactical",          section: "expenses", label: "Tactical investments",         categories: ["financial"] },
  { line: "interest_expense",  section: "expenses", label: "Interest expense",             drill: { source: "accrual_tick,loan_fee" } },
  { line: "debt_relief",       section: "revenue",  label: "Debt relief (forgiven)",       drill: { source: "loan_forgiveness" } },
  { line: "forgiveness_loss",  section: "expenses", label: "Forgiveness (written off)",    drill: { source: "loan_forgiveness" } },
  { line: "contract_fines_income",  section: "revenue",  label: "Contract fines (received)", drill: { source: "contract_fine" } },
  { line: "settlement_income",      section: "revenue",  label: "Settlements (received)",    drill: { source: "wo_settlement" } },
  { line: "contract_fines_expense", section: "expenses", label: "Contract fines (paid)",     drill: { source: "contract_fine" } },
  { line: "settlement_expense",     section: "expenses", label: "Settlements (paid)",        drill: { source: "wo_settlement" } },
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

  // Forgiveness is source-keyed by sign: incoming relief (+) vs outgoing loss (−),
  // real P&L per design §5.6 — no exclusion.
  if (e.source === "loan_forgiveness") {
    return e.amount > 0
      ? { section: "revenue", line: "debt_relief" }
      : { section: "expenses", line: "forgiveness_loss" };
  }

  // Fines and settlements are source-keyed by sign (same pattern): their rows
  // are category 'financial', whose generic rule drops the positive side —
  // without these branches received fines/settlements vanish from the P&L.
  if (e.source === "contract_fine") {
    return e.amount > 0
      ? { section: "revenue", line: "contract_fines_income" }
      : { section: "expenses", line: "contract_fines_expense" };
  }
  if (e.source === "wo_settlement") {
    return e.amount > 0
      ? { section: "revenue", line: "settlement_income" }
      : { section: "expenses", line: "settlement_expense" };
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
