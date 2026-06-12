import { Hono } from "hono";
import { getAuthUser, type HonoEnv } from "../../lib/types";
import { catchUp } from "../../lib/accountant/catchup";
import {
  RESERVE_NEUTRAL_SQL,
  STATEMENT_LINES,
  classifyPLLine,
  type Category,
  type Source,
} from "../../lib/accountant/constants";
import { parsePeriod, defaultInterval, IntervalSchema } from "./report-period";
import { isoDatetime } from "./schemas";

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
    await catchUp(db, userID);

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

    // Bucket the grouped rows into STATEMENT_LINES. classifyPLLine is the single
    // source of truth for line keys, exclusions, and sign logic — each grouped
    // row is classified once per signed side (classification depends only on
    // category/source/sign, which grouping preserves).
    const lineValues = new Map<string, number>();          // line (or line|tag) → value
    const lineTags = new Map<string, string | null>();     // composite key → tag
    function add(line: string, tag: string | null, value: number, perTag: boolean) {
      const key = perTag ? `${line}|${tag ?? ""}` : line;
      lineValues.set(key, (lineValues.get(key) ?? 0) + value);
      lineTags.set(key, perTag ? tag : null);
    }

    const specByLine = new Map(STATEMENT_LINES.map((s) => [s.line, s]));
    for (const r of rows.results) {
      for (const amount of [r.pos, r.neg]) {
        if (amount === 0) continue;
        const cls = classifyPLLine({
          category: r.category as Category | null,
          source: r.source as Source,
          amount,
          tag: r.tag,
        });
        if (!cls) continue;
        const perTag = !!specByLine.get(cls.line)?.perTag;
        add(cls.line, perTag ? r.tag : null, amount, perTag);
      }
    }

    // Shape into ordered sections following STATEMENT_LINES; expand per-tag lines.
    const revenue: Array<Record<string, unknown>> = [];
    const expenses: Array<Record<string, unknown>> = [];
    for (const spec of STATEMENT_LINES) {
      const matches = [...lineValues.entries()].filter(([k]) => k === spec.line || k.startsWith(`${spec.line}|`));
      for (const [key, value] of matches) {
        const tag = lineTags.get(key) ?? null;
        // Drill link = window + generic category filter + the line's own extras
        // (declared on STATEMENT_LINES — no per-line special cases here).
        const drill: Record<string, string> = { from, to };
        if (spec.categories?.length) drill.category = spec.categories.join(",");
        Object.assign(drill, spec.drill);
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

  // GET /reports/balance?at= — cost-basis snapshot (owner decision 2026-06-11;
  // controller ruling on equity 2026-06-11; reserve add-back amendment 2026-06-12).
  // Semantics:
  //   cash        = SUM(amount) over ALL entries (ledger balance — reserves are real
  //                 negative rows inside it, so available balance ≡ ledger balance, §6).
  //   holdings    = −SUM(amount) over category='assets' entries (purchase −X → holding +X at cost).
  //   lockedInPOs = −SUM(po_reserve + po_reserve_release) — open-reserve memo, same
  //                 `occurred_at < at` cutoff as cash so equity is consistent at every instant.
  //   equity      = cash + holdings + lockedInPOs — deliberately NO liabilities subtraction.
  //                 Loans are booked obligation-style: an incoming principal is a NEGATIVE
  //                 entry, so the debt is already inside cash. Subtracting liabilities on top
  //                 would count the same debt twice (equity −200k for a 100k loan). Do not
  //                 "fix" this by reintroducing it. Reserves are earmarks already inside cash
  //                 (M5): adding the locked sum back keeps equity from dipping on a mere lock —
  //                 same decision class as the loan self-netting ruling. By construction
  //                 equity = SUM(non-asset, non-reserve-neutral), which is exactly what
  //                 /net-worth computes, so balance.equity == net-worth last point holds.
  //   liabilities = per-loan negative nets (display figure, unchanged).
  //   assets      = equity + liabilities — so Assets − Liabilities = Equity holds by construction.
  routes.get("/balance", async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    await catchUp(db, userID);

    // Normalized to UTC (isoDatetime) — the cutoff is a raw-string compare
    // against stored normalized timestamps.
    const parsed = isoDatetime.safeParse(c.req.query("at") ?? "");
    if (!parsed.success) return c.json({ error: "at must be an ISO timestamp" }, 400);
    const at = parsed.data;

    // Snapshot is strictly before `at` (same half-open convention applied to the upper bound).
    // Non-loan financial entries (tactical, no loan_id) are P&L expenses, not balance-sheet liabilities.
    const [holdingRow, liabRow] = await Promise.all([
      db
        .prepare(
          `SELECT
             COALESCE(SUM(amount), 0)                                              AS cash,
             COALESCE(-SUM(CASE WHEN category = 'assets' THEN amount ELSE 0 END), 0) AS holdings,
             COALESCE(-SUM(CASE WHEN source IN ('po_reserve', 'po_reserve_release') THEN amount ELSE 0 END), 0) AS locked
           FROM accountant_entries
           WHERE user_id = ? AND occurred_at < ?`,
        )
        .bind(userID, at)
        .first<{ cash: number; holdings: number; locked: number }>(),
      db
        .prepare(
          `SELECT COALESCE(SUM(ABS(net)), 0) AS liabilities
           FROM (
             SELECT SUM(amount) AS net
             FROM accountant_entries
             WHERE user_id = ? AND loan_id IS NOT NULL AND occurred_at < ?
             GROUP BY loan_id
           ) WHERE net < 0`,
        )
        .bind(userID, at)
        .first<{ liabilities: number }>(),
    ]);

    const cash = holdingRow?.cash ?? 0;
    const holdings = holdingRow?.holdings ?? 0;
    const lockedInPOs = holdingRow?.locked ?? 0;
    const equity = cash + holdings + lockedInPOs; // see semantics above
    const liabilities = liabRow?.liabilities ?? 0;
    return c.json({
      at,
      cash,
      holdings,
      lockedInPOs,
      assets: equity + liabilities,
      liabilities,
      equity,
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
    await catchUp(db, userID);

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
         WHERE user_id = ? AND occurred_at >= ? AND occurred_at < ?
           AND source != 'adjustment' AND ${RESERVE_NEUTRAL_SQL}
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
  // Owner decision 2026-06-11: series tracks equity = cumulative SUM(non-asset entries).
  // Asset purchases cancel against holdings: equity is unchanged by a pure buy; income/expenses move it.
  // Controller ruling: NO per-bucket liabilities subtraction — obligation-style loan entries
  // self-net inside the cumulative sum; subtracting liabilities would double-count the debt.
  // M5 (design §6): reserve-class sources are excluded too — a PO lock is an earmark, not an
  // economic event, so the series must not dip on it. This keeps the cumulative sum equal to
  // /balance equity (cash + holdings + lockedInPOs = SUM(non-asset, non-reserve-neutral)) at
  // every bucket cutoff.
  routes.get("/net-worth", async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    await catchUp(db, userID);

    const period = parsePeriod({ from: c.req.query("from"), to: c.req.query("to") });
    if (!period) return c.json({ error: "from and to are required ISO timestamps" }, 400);
    const iv = resolveInterval(c, period.from, period.to);
    if ("error" in iv) return c.json({ error: iv.error }, 400);
    const fmt = BUCKET_FORMAT[iv.interval];
    const { from, to } = period;

    // Opening equity = SUM of non-asset, non-reserve entries strictly before `from`.
    const opening = await db
      .prepare(
        `SELECT COALESCE(SUM(amount),0) AS bal
         FROM accountant_entries
         WHERE user_id = ? AND occurred_at < ?
           AND (category IS NULL OR category != 'assets') AND ${RESERVE_NEUTRAL_SQL}`,
      )
      .bind(userID, from)
      .first<{ bal: number }>();

    // Per-bucket non-asset, non-reserve deltas within the window.
    const rows = await db
      .prepare(
        `SELECT strftime('${fmt}', occurred_at) AS bucket, COALESCE(SUM(amount),0) AS delta
         FROM accountant_entries
         WHERE user_id = ? AND occurred_at >= ? AND occurred_at < ?
           AND (category IS NULL OR category != 'assets') AND ${RESERVE_NEUTRAL_SQL}
         GROUP BY bucket ORDER BY bucket ASC`,
      )
      .bind(userID, from, to)
      .all<{ bucket: string; delta: number }>();

    let running = opening?.bal ?? 0;
    const series = rows.results.map((r) => {
      running += r.delta;
      return { bucket: r.bucket, netWorth: running };
    });
    return c.json({ from, to, interval: iv.interval, opening: opening?.bal ?? 0, series });
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
    await catchUp(db, userID);

    // Default window = current calendar month (owner decision 2026-06-11). Explicit from&to override.
    const explicit = parsePeriod({ from: c.req.query("from"), to: c.req.query("to") });
    const hasAny = c.req.query("from") !== undefined || c.req.query("to") !== undefined;
    if (hasAny && !explicit) return c.json({ error: "from and to must both be valid ISO timestamps" }, 400);
    const { from, to } = explicit ?? currentMonthWindow();

    const row = await db
      .prepare(
        `SELECT COALESCE(SUM(amount),0) AS net FROM accountant_entries
         WHERE user_id = ? AND occurred_at >= ? AND occurred_at < ?
           AND source != 'adjustment' AND ${RESERVE_NEUTRAL_SQL}`,
      )
      .bind(userID, from, to)
      .first<{ net: number }>();

    const cashFlowNet = row?.net ?? 0;
    const positive = cashFlowNet > 0;
    return c.json({ from, to, cashFlowNet, surplus: positive ? cashFlowNet : 0, positive });
  });

  return routes;
}
