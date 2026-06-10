import { z } from "zod";
import { CATEGORIES } from "../../lib/accountant/constants";

/** Shared Zod pieces for the accountant route modules (ledger, sorting). */
export const categoryEnum = z.enum(CATEGORIES);

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
