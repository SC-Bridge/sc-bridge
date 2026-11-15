import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";

/**
 * Typed zValidator wrapper with a consistent error hook baked in.
 * Returns { error: "message" } for single issues, { error, details } for multiple.
 */
export function validate<
  Target extends keyof ValidationTargets,
  T extends z.ZodType,
>(target: Target, schema: T) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      const issues = result.error.issues;
      if (issues.length === 1) {
        return c.json({ error: issues[0].message }, 400);
      }
      return c.json({
        error: "Validation failed",
        details: issues.map((i: z.ZodIssue) => ({ path: i.path.join("."), message: i.message })),
      }, 400);
    }
  });
}

// --- Shared Schemas ---

/** Route param with integer ID */
export const IntIdParam = z.object({
  id: z.coerce.number().int().positive({ message: "Invalid ID" }),
});

/** Route param with UUID */
export const UuidParam = z.object({
  uuid: z.string().uuid({ message: "Invalid UUID format" }),
});

/** Organisation visibility enum */
export const OrgVisibility = z.enum(["public", "org", "officers", "private"]);

/** LLM provider enum */
export const LLMProvider = z.enum(["anthropic", "openai", "google"]);

/** HangarXplor import entry schema */
export const HangarXplorEntrySchema = z.object({
  unidentified: z.string().max(200).optional(),
  ship_code: z.string().min(1, "ship_code is required").max(200),
  ship_name: z.string().max(200).optional(),
  manufacturer_code: z.string().min(1, "manufacturer_code is required").max(10),
  manufacturer_name: z.string().min(1, "manufacturer_name is required").max(200),
  lookup: z.string().max(200).optional(),
  lti: z.boolean(),
  insurance: z.string().max(100).optional(),
  name: z.string().min(1, "name is required").max(200),
  warbond: z.boolean(),
  entity_type: z.string().min(1, "entity_type is required").max(50),
  pledge_id: z.string().max(50),
  pledge_name: z.string().max(200),
  pledge_date: z.string().max(50),
  pledge_cost: z.string().max(30),
});

/** Import body: array of HangarXplor entries, max 2000 */
export const HangarXplorImportSchema = z
  .array(HangarXplorEntrySchema)
  .max(2000, "Import limited to 2000 entries");

// --- Hangar Sync Schemas (RSI extension) ---
// String length caps prevent payload-stuffing DoS. .passthrough() kept because RSI
// scraped data varies between pledges — extra fields are normal but we cap known ones.
// Per-element schemas validate ONLY fields that are bound to SQL — .passthrough()
// avoids CPU-expensive deep validation on RSI's variable payload shape.


// Per-element validation of RSI data was attempted but RSI's payload shape is too
// variable — scraped HTML, JSON.parse of script tags, and API responses all produce
// unpredictable types/nulls. Array-level caps prevent DoS; element validation is
// deferred to the SQL binding layer (D1 rejects bad types at bind time).
// TODO: Re-add per-element schemas once we capture real payloads from diverse hangars.

/** Anomaly thresholds — payloads exceeding these are logged but still processed */
export const SYNC_ANOMALY_THRESHOLDS = {
  /** Max pledges before flagging as anomalous */
  pledgeCount: 500,
  /** Max total fleet value in cents before flagging */
  fleetValueCents: 50_000_00,
} as const;

/** Full hangar sync payload from extension */
export const HangarSyncPayloadSchema = z.object({
  // Array-level caps prevent DoS. Per-element validation deferred to SQL binding layer.
  pledges: z.array(z.any()).max(2000).default([]),
  buyback_pledges: z.array(z.any()).max(1000).default([]),
  upgrades: z.array(z.any()).max(5000).default([]),
  account: z.any().optional().default(null),
  named_ships: z.array(z.any()).max(500).default([]),
  // Which of the user's RSI accounts this sync belongs to, when the server
  // could not tell on its own (answer to a 409 needs_mapping).
  target: z
    .discriminatedUnion("mode", [
      z.object({ mode: z.literal("new") }),
      z.object({ mode: z.literal("map"), rsi_account_id: z.number().int().positive() }),
    ])
    .optional(),
  sync_meta: z.object({
    extension_version: z.string().max(50).default("unknown"),
    synced_at: z.string().max(50).default(""),
    pledge_count: z.number().int().min(0).max(10000).default(0),
    buyback_count: z.number().int().min(0).max(10000).default(0),
    ship_count: z.number().int().min(0).max(10000).default(0),
    item_count: z.number().int().min(0).max(50000).default(0),
  }).passthrough(),
}).passthrough();
