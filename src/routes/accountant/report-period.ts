import { z } from "zod";
import { INTERVALS } from "../../lib/accountant/accrual";

/**
 * Report period semantics (presentation design "Cross-cutting"):
 *   occurred_at >= from AND occurred_at < to   (HALF-OPEN — owner-confirmed 2026-06-11;
 *   this differs from the M1 ledger GET's inclusive `<= to`).
 * Both bounds are required, UTC ISO strings.
 */
export const PeriodSchema = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
});

export const IntervalSchema = z.enum(INTERVALS); // hourly|daily|weekly|monthly

/** Parse + validate ?from&to from a query record; returns null on failure (→ 400). */
export function parsePeriod(query: Record<string, string | undefined>): { from: string; to: string } | null {
  const r = PeriodSchema.safeParse({ from: query.from, to: query.to });
  return r.success ? r.data : null;
}

/**
 * Default granularity by period length (presentation design "Granularity"):
 *   ≤ 7 days → daily; ≤ 90 days → weekly; else monthly. Selectable via ?interval.
 */
export function defaultInterval(from: string, to: string): "daily" | "weekly" | "monthly" {
  const days = (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000;
  if (days <= 7) return "daily";
  if (days <= 90) return "weekly";
  return "monthly";
}
