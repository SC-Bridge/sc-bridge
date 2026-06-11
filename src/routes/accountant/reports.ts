import { Hono } from "hono";
import { getAuthUser, type HonoEnv } from "../../lib/types";
import { catchUpAccruals } from "../../lib/accountant/accrual";
import { STATEMENT_LINES } from "../../lib/accountant/constants";
import { parsePeriod } from "./report-period";

/**
 * /api/accountant/reports — read-only derived views (design §4.5).
 * NO write path. catch-up accrual runs at the top of every read (design §4.4);
 * accrual ticks ARE included in aggregates (presentation design cross-cutting).
 * Period is HALF-OPEN: occurred_at >= from AND occurred_at < to.
 */
export function reportsRoutes() {
  const routes = new Hono<HonoEnv>();

  // GET /reports/pl?from&to — revenue/expense rollup by STATEMENT_LINES (+ per-tag).
  routes.get("/pl", async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    // Design §4.4 / §6: no try/catch — a throw becomes a 500, never stale numbers.
    await catchUpAccruals(db, userID);

    const period = parsePeriod({ from: c.req.query("from"), to: c.req.query("to") });
    if (!period) return c.json({ error: "from and to are required ISO timestamps" }, 400);
    const { from, to } = period;

    // One grouped aggregate: signed sum per (category, source, tag), positives and
    // negatives split so the classifier's sign logic is reproduced in SQL.
    const rows = await db
      .prepare(
        `SELECT category, source, tag,
                COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS pos,
                COALESCE(SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END), 0) AS neg
         FROM accountant_entries
         WHERE user_id = ? AND occurred_at >= ? AND occurred_at < ?
         GROUP BY category, source, tag`,
      )
      .bind(userID, from, to)
      .all<{ category: string | null; source: string; tag: string | null; pos: number; neg: number }>();

    // Bucket the grouped rows into STATEMENT_LINES (mirrors classifyPLLine in SQL terms).
    const lineValues = new Map<string, number>();          // line (or line|tag) → value
    const lineTags = new Map<string, string | null>();     // composite key → tag
    function add(line: string, tag: string | null, value: number, perTag: boolean) {
      const key = perTag ? `${line}|${tag ?? ""}` : line;
      lineValues.set(key, (lineValues.get(key) ?? 0) + value);
      lineTags.set(key, perTag ? tag : null);
    }

    for (const r of rows.results) {
      // Excluded sources/categories never reach a line.
      if (r.source === "adjustment" || r.source === "loan_principal" || r.source === "loan_repayment") continue;
      if (r.category === "assets") continue;

      if (r.source === "accrual_tick" || r.source === "loan_fee") {
        if (r.pos > 0) add("interest_income", null, r.pos, false);
        if (r.neg < 0) add("interest_expense", null, r.neg, false);
        continue;
      }
      switch (r.category) {
        case "trading":         if (r.pos > 0) add("trading_income", null, r.pos, false); break;
        case "mission_income":  if (r.pos > 0) add("mission_income", null, r.pos, false); break;
        case "production":
          if (r.pos > 0) add("production_income", null, r.pos, false);
          if (r.neg < 0) add("production_invest", r.tag, r.neg, true);
          break;
        case "running_cost":    if (r.neg < 0) add("running_cost", r.tag, r.neg, true); break;
        case "financial":       if (r.neg < 0) add("tactical", null, r.neg, false); break;
        default: break;
      }
    }

    // Shape into ordered sections following STATEMENT_LINES; expand per-tag lines.
    const revenue: Array<Record<string, unknown>> = [];
    const expenses: Array<Record<string, unknown>> = [];
    for (const spec of STATEMENT_LINES) {
      const matches = [...lineValues.entries()].filter(([k]) => k === spec.line || k.startsWith(`${spec.line}|`));
      for (const [key, value] of matches) {
        if (value === 0 && !["interest_income", "interest_expense"].includes(spec.line)) continue;
        const tag = lineTags.get(key) ?? null;
        const drill: Record<string, string> = { from, to };
        if (spec.categories?.length) drill.category = spec.categories.join(",");
        if (spec.line === "interest_income" || spec.line === "interest_expense") drill.source = "accrual_tick,loan_fee";
        if (spec.line === "tactical") { drill.category = "financial"; drill.tag = "tactical"; }
        if (tag) drill.tag = tag;
        const row = { line: spec.line, label: spec.label, value, ...(tag ? { tag } : {}), drill };
        (spec.section === "revenue" ? revenue : expenses).push(row);
      }
    }

    const revenueTotal = revenue.reduce((s, r) => s + (r.value as number), 0);
    const expensesTotal = expenses.reduce((s, r) => s + (r.value as number), 0);
    return c.json({
      from, to,
      revenue: { lines: revenue, total: revenueTotal },
      expenses: { lines: expenses, total: expensesTotal },
      net: revenueTotal + expensesTotal,
    });
  });

  return routes;
}
