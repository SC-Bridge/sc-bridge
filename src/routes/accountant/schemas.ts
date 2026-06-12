import { z } from "zod";
import { CATEGORIES } from "../../lib/accountant/constants";

/** Shared Zod pieces for the accountant route modules (ledger, sorting). */
export const categoryEnum = z.enum(CATEGORIES);

/**
 * Shared ISO-8601 timestamp: accepts any offset, STORES normalized UTC
 * (`new Date(s).toISOString()`). Stored values are compared BOTH as raw
 * strings in SQL (badges overdue, report windows, /balance cutoff, ledger
 * ordering) and as epochs in the fine/accrual engines — stored verbatim, a
 * `+12:00` deliver_by is overdue to the engine yet never to the badge. One
 * definition for every accountant datetime field; do not fork it.
 */
export const isoDatetime = z
  .string()
  .datetime({ offset: true })
  .max(50)
  .transform((s) => new Date(s).toISOString());

/**
 * The design's core invariant: the Sorting List / badge queue is the
 * `category IS NULL AND source='parsed'` slice of accountant_entries —
 * a QUERY, not a table. One definition, used by every consumer.
 */
export const UNSORTED_PREDICATE = "category IS NULL AND source = 'parsed'";

/** Queue page size — also the bulk-categorize ceiling (one page per action). */
export const SORTING_PAGE = 200;

/**
 * Strict positive-integer :id param. parseInt alone accepts "12.9"/"12abc"
 * as 12 — reject anything that isn't all digits (404-for-garbage contract).
 */
export function parseIdParam(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const id = parseInt(raw, 10);
  return id > 0 ? id : null;
}
