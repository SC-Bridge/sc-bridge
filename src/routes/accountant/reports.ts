import { Hono } from "hono";
import { z } from "zod";
import { getAuthUser, type HonoEnv } from "../../lib/types";
import { catchUpAccruals } from "../../lib/accountant/accrual";
import { STATEMENT_LINES } from "../../lib/accountant/constants";
import { parsePeriod, defaultInterval, IntervalSchema } from "./report-period";

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

  // GET /reports/balance?at= — assets vs liabilities snapshot (design §4.5).
  routes.get("/balance", async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    await catchUpAccruals(db, userID);

    const at = c.req.query("at");
    const ok = at && z.string().datetime({ offset: true }).safeParse(at).success;
    if (!ok) return c.json({ error: "at must be an ISO timestamp" }, 400);

    // Snapshot is strictly before `at` (same half-open convention applied to the upper bound).
    const row = await db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN category = 'assets' THEN amount ELSE 0 END), 0) AS assets,
           COALESCE(SUM(CASE WHEN category = 'financial' AND amount < 0 THEN amount ELSE 0 END), 0) AS liabilities_signed,
           COALESCE(SUM(amount), 0) AS net_worth
         FROM accountant_entries
         WHERE user_id = ? AND occurred_at < ?`,
      )
      .bind(userID, at)
      .first<{ assets: number; liabilities_signed: number; net_worth: number }>();

    const assets = row?.assets ?? 0;
    const liabilities = Math.abs(row?.liabilities_signed ?? 0);
    return c.json({
      at,
      assets,
      liabilities,
      equity: assets - liabilities,
      netWorth: row?.net_worth ?? 0,
    });
  });

  // Map an interval label → the strftime format string for bucketing occurred_at.
  const BUCKET_FORMAT: Record<string, string> = {
    hourly: "%Y-%m-%dT%H:00",
    daily: "%Y-%m-%d",
    weekly: "%Y-W%W",
    monthly: "%Y-%m",
  };

  function resolveInterval(c: { req: { query: (k: string) => string | undefined } }, from: string, to: string):
    { interval: string } | { error: string } {
    const raw = c.req.query("interval");
    if (raw === undefined) return { interval: defaultInterval(from, to) };
    const r = IntervalSchema.safeParse(raw);
    return r.success ? { interval: r.data } : { error: "invalid interval" };
  }

  // GET /reports/cash-flow?from&to&interval — in/out/net liquidity per bucket.
  routes.get("/cash-flow", async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    await catchUpAccruals(db, userID);

    const period = parsePeriod({ from: c.req.query("from"), to: c.req.query("to") });
    if (!period) return c.json({ error: "from and to are required ISO timestamps" }, 400);
    const iv = resolveInterval(c, period.from, period.to);
    if ("error" in iv) return c.json({ error: iv.error }, 400);
    const fmt = BUCKET_FORMAT[iv.interval];

    const rows = await db
      .prepare(
        `SELECT strftime('${fmt}', occurred_at) AS bucket,
                COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS in_sum,
                COALESCE(SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END), 0) AS out_sum
         FROM accountant_entries
         WHERE user_id = ? AND occurred_at >= ? AND occurred_at < ? AND source != 'adjustment'
         GROUP BY bucket ORDER BY bucket ASC`,
      )
      .bind(userID, period.from, period.to)
      .all<{ bucket: string; in_sum: number; out_sum: number }>();

    return c.json({
      from: period.from, to: period.to, interval: iv.interval,
      series: rows.results.map((r) => ({ bucket: r.bucket, in: r.in_sum, out: r.out_sum, net: r.in_sum + r.out_sum })),
    });
  });

  // GET /reports/net-worth?from&to&interval — cumulative equity per bucket.
  routes.get("/net-worth", async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    await catchUpAccruals(db, userID);

    const period = parsePeriod({ from: c.req.query("from"), to: c.req.query("to") });
    if (!period) return c.json({ error: "from and to are required ISO timestamps" }, 400);
    const iv = resolveInterval(c, period.from, period.to);
    if ("error" in iv) return c.json({ error: iv.error }, 400);
    const fmt = BUCKET_FORMAT[iv.interval];

    // Opening equity = everything strictly before `from` (cumulative carry-in).
    const opening = await db
      .prepare(`SELECT COALESCE(SUM(amount),0) AS bal FROM accountant_entries WHERE user_id = ? AND occurred_at < ?`)
      .bind(userID, period.from)
      .first<{ bal: number }>();

    // Per-bucket net change within the window.
    const rows = await db
      .prepare(
        `SELECT strftime('${fmt}', occurred_at) AS bucket, COALESCE(SUM(amount),0) AS delta
         FROM accountant_entries
         WHERE user_id = ? AND occurred_at >= ? AND occurred_at < ?
         GROUP BY bucket ORDER BY bucket ASC`,
      )
      .bind(userID, period.from, period.to)
      .all<{ bucket: string; delta: number }>();

    let running = opening?.bal ?? 0;
    const series = rows.results.map((r) => {
      running += r.delta;
      return { bucket: r.bucket, equity: running };
    });
    return c.json({ from: period.from, to: period.to, interval: iv.interval, opening: opening?.bal ?? 0, series });
  });

  // First/last instant of the calendar month containing nowMs (UTC).
  function currentMonthWindow(nowMs: number = Date.now()): { from: string; to: string } {
    const d = new Date(nowMs);
    const from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
    const to = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString();
    return { from, to };
  }

  // GET /reports/investment-option?from&to — advisory surplus (Module3; hidden when ≤ 0).
  routes.get("/investment-option", async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    await catchUpAccruals(db, userID);

    // Default window = current calendar month (owner decision 2026-06-11). Explicit from&to override.
    const explicit = parsePeriod({ from: c.req.query("from"), to: c.req.query("to") });
    const hasAny = c.req.query("from") !== undefined || c.req.query("to") !== undefined;
    if (hasAny && !explicit) return c.json({ error: "from and to must both be valid ISO timestamps" }, 400);
    const { from, to } = explicit ?? currentMonthWindow();

    const row = await db
      .prepare(
        `SELECT COALESCE(SUM(amount),0) AS net FROM accountant_entries
         WHERE user_id = ? AND occurred_at >= ? AND occurred_at < ? AND source != 'adjustment'`,
      )
      .bind(userID, from, to)
      .first<{ net: number }>();

    const cashFlowNet = row?.net ?? 0;
    const positive = cashFlowNet > 0;
    return c.json({ from, to, cashFlowNet, surplus: positive ? cashFlowNet : 0, positive });
  });

  return routes;
}
