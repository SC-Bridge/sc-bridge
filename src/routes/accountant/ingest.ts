import { Hono } from "hono";
import { z } from "zod";
import { getAuthUser, type HonoEnv } from "../../lib/types";
import { validate } from "../../lib/validation";
import { classifyEntry } from "../../lib/accountant/categorize";
import { KNOWN_HINTS } from "../../lib/accountant/constants";
import { logEvent } from "../../lib/logger";
import { isoDatetime } from "./schemas";

const IngestEntrySchema = z
  .object({
    event_id: z.string().min(1).max(100),
    occurred_at: isoDatetime,
    amount: z.number().int().min(-9_999_999_999_999).max(9_999_999_999_999)
      .refine((n) => n !== 0, "amount must be non-zero"),
    description: z.string().max(500).optional(),
    location: z.string().max(200).optional(),
    quantity: z.number().positive().max(1_000_000_000).optional(),
    price_per_unit: z.number().int().min(-9_999_999_999_999).max(9_999_999_999_999).optional(),
    hint: z.string().max(50).optional(),
    ship: z.string().max(200).optional(),
  })
  .strict();

const IngestBatchSchema = z
  .object({ entries: z.array(IngestEntrySchema).min(1).max(500) })
  .strict();

/**
 * POST /api/accountant/ingest — Companion financial-event ingestion.
 * Idempotent: INSERT OR IGNORE against UNIQUE(user_id, source_ref); a fully
 * deduplicated retry is success with inserted: 0, never an error.
 * Auto-categorizer (lib/accountant/categorize) runs per entry at ingest time;
 * anything it can't classify lands in the Sorting List (category NULL).
 */
export function ingestRoutes() {
  const routes = new Hono<HonoEnv>();

  routes.post("/", validate("json", IngestBatchSchema), async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    const { entries } = c.req.valid("json");

    const stmts = entries.map((e) => {
      const cls = classifyEntry(e.hint, e.ship);
      return db
        .prepare(
          `INSERT OR IGNORE INTO accountant_entries
             (user_id, occurred_at, amount, category, tag, source,
              description, location, quantity, price_per_unit, source_ref)
           VALUES (?, ?, ?, ?, ?, 'parsed', ?, ?, ?, ?, ?)`,
        )
        .bind(
          userID,
          e.occurred_at,
          e.amount,
          cls.category,
          cls.tag,
          e.description ?? null,
          e.location ?? null,
          e.quantity ?? null,
          e.price_per_unit ?? null,
          e.event_id,
        );
    });

    let inserted = 0;
    for (let i = 0; i < stmts.length; i += 100) {
      const results = await db.batch(stmts.slice(i, i + 100));
      for (const r of results) inserted += r.meta.changes ?? 0;
    }

    // Unknown hints land in the Sorting List anyway, but a rising count means
    // the Companion parser ships hints the categorizer hasn't learned yet.
    const unknownHints = entries.filter(
      (e) => e.hint !== undefined && !(KNOWN_HINTS as readonly string[]).includes(e.hint),
    ).length;

    logEvent("accountant_ingest", {
      user_id: userID,
      received: entries.length,
      inserted,
      duplicates: entries.length - inserted,
      unknown_hints: unknownHints,
    });

    return c.json({ ok: true, inserted, duplicates: entries.length - inserted });
  });

  return routes;
}
