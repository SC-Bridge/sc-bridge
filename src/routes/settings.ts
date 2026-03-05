import { Hono } from "hono";
import { z } from "zod";
import { getAuthUser, type HonoEnv } from "../lib/types";
import { encrypt, decrypt, maskAPIKey } from "../lib/crypto";
import { logUserChange } from "../lib/change-history";
import { validate, LLMProvider } from "../lib/validation";

/**
 * /api/settings/* — User settings and LLM configuration
 */
export function settingsRoutes() {
  const routes = new Hono<HonoEnv>();

  // GET /api/settings/llm-config
  routes.get("/llm-config", async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;

    const config = await db
      .prepare(
        "SELECT id, provider, encrypted_api_key, model FROM user_llm_configs WHERE user_id = ? LIMIT 1",
      )
      .bind(userID)
      .first<{
        id: number;
        provider: string;
        encrypted_api_key: string;
        model: string;
      }>();

    let provider = "";
    let maskedKey = "";
    let model = "";
    let apiKeySet = false;

    if (config) {
      provider = config.provider;
      model = config.model ?? "";
      if (config.encrypted_api_key) {
        apiKeySet = true;
        if (c.env.ENCRYPTION_KEY) {
          try {
            const decrypted = await decrypt(
              config.encrypted_api_key,
              c.env.ENCRYPTION_KEY,
            );
            maskedKey = maskAPIKey(decrypted);
          } catch {
            maskedKey = "***error***";
          }
        } else {
          maskedKey = maskAPIKey(config.encrypted_api_key);
        }
      }
    }

    return c.json({
      provider,
      api_key_set: apiKeySet,
      api_key_mask: maskedKey,
      model,
    });
  });

  // PUT /api/settings/llm-config
  routes.put("/llm-config",
    validate("json", z.object({
      provider: LLMProvider.optional(),
      api_key: z.string().max(500).optional(),
      model: z.string().max(100).optional(),
    })),
    async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;

    const body = c.req.valid("json");

    // Clear operation
    if (!body.provider && !body.api_key && !body.model) {
      await db.prepare("DELETE FROM user_llm_configs WHERE user_id = ?").bind(userID).run();
      await logUserChange(db, userID, "llm_config_changed", {
        fieldName: "config",
        oldValue: "[configured]",
        newValue: "[cleared]",
        ipAddress: c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for"),
      });
      return c.json({ message: "LLM configuration cleared" });
    }

    if (!body.provider) {
      return c.json({ error: "Invalid provider" }, 400);
    }

    if (!body.api_key?.trim()) {
      return c.json({ error: "API key is required when provider is set" }, 400);
    }

    let encryptedKey = body.api_key;
    if (c.env.ENCRYPTION_KEY) {
      encryptedKey = await encrypt(body.api_key, c.env.ENCRYPTION_KEY);
    } else if (c.env.API_TOKEN) {
      // Production mode (API_TOKEN set) but no ENCRYPTION_KEY — refuse to store plaintext
      return c.json({ error: "ENCRYPTION_KEY not configured — cannot store API key securely" }, 500);
    }

    await db
      .prepare(
        `INSERT INTO user_llm_configs (user_id, provider, encrypted_api_key, model, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(user_id, provider) DO UPDATE SET
          encrypted_api_key=excluded.encrypted_api_key,
          model=excluded.model,
          updated_at=excluded.updated_at`,
      )
      .bind(userID, body.provider, encryptedKey, body.model ?? "")
      .run();

    await logUserChange(db, userID, "llm_config_changed", {
      fieldName: "provider",
      newValue: body.provider,
      metadata: { model: body.model ?? "", api_key: "[redacted]" },
      ipAddress: c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for"),
    });

    return c.json({ message: "LLM configuration saved" });
  });

  // GET /api/settings/preferences
  routes.get("/preferences", async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;

    const rows = await db
      .prepare("SELECT key, value FROM user_settings WHERE user_id = ?")
      .bind(userID)
      .all<{ key: string; value: string }>();

    const prefs: Record<string, string> = {};
    for (const row of rows.results) {
      prefs[row.key] = row.value;
    }

    return c.json(prefs);
  });

  // PUT /api/settings/preferences
  routes.put("/preferences",
    validate("json", z.object({
      timezone: z.string().max(200).optional(),
      fontPreference: z.string().max(200).optional(),
      adminPreviewPatch: z.string().max(100).nullable().optional(),
    }).strict()),
    async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;

    const body = c.req.valid("json");

    // Load existing prefs for old-value comparison
    const existingRows = await db
      .prepare("SELECT key, value FROM user_settings WHERE user_id = ?")
      .bind(userID)
      .all<{ key: string; value: string }>();
    const existingPrefs: Record<string, string> = {};
    for (const row of existingRows.results) {
      existingPrefs[row.key] = row.value;
    }

    const upsertStmt = db.prepare(
      `INSERT INTO user_settings (user_id, key, value)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value`,
    );
    const deleteStmt = db.prepare(
      `DELETE FROM user_settings WHERE user_id = ? AND key = ?`,
    );

    const batch: D1PreparedStatement[] = [];
    for (const [key, value] of Object.entries(body)) {
      if (value === null) {
        batch.push(deleteStmt.bind(userID, key));
      } else {
        batch.push(upsertStmt.bind(userID, key, value));
      }
    }

    if (batch.length > 0) {
      await db.batch(batch);
    }

    // Log each changed preference
    const ipAddress = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for");
    for (const [key, value] of Object.entries(body)) {
      const oldValue = existingPrefs[key];
      if (oldValue !== (value ?? undefined)) {
        await logUserChange(db, userID, "settings_changed", {
          fieldName: key,
          oldValue: oldValue ?? undefined,
          newValue: value === null ? "[cleared]" : value,
          ipAddress,
        });
      }
    }

    return c.json({ message: "Preferences saved" });
  });

  return routes;
}
