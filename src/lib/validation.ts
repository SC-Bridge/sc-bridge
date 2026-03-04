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
  unidentified: z.string().optional(),
  ship_code: z.string().min(1, "ship_code is required"),
  ship_name: z.string().optional(),
  manufacturer_code: z.string().min(1, "manufacturer_code is required"),
  manufacturer_name: z.string().min(1, "manufacturer_name is required"),
  lookup: z.string().optional(),
  lti: z.boolean(),
  insurance: z.string().optional(),
  name: z.string().min(1, "name is required"),
  warbond: z.boolean(),
  entity_type: z.string().min(1, "entity_type is required"),
  pledge_id: z.string(),
  pledge_name: z.string(),
  pledge_date: z.string(),
  pledge_cost: z.string(),
});

/** Import body: array of HangarXplor entries, max 2000 */
export const HangarXplorImportSchema = z
  .array(HangarXplorEntrySchema)
  .max(2000, "Import limited to 2000 entries");
