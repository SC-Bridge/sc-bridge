import { Hono } from "hono";
import type { HonoEnv } from "../lib/types";
import { encrypt, decrypt, maskAPIKey } from "../lib/crypto";

/**
 * /api/settings/* — User settings and LLM configuration
 */
export function settingsRoutes() {
  const routes = new Hono<HonoEnv>();

  // GET /api/settings/llm-config
  routes.get("/llm-config", async (c) => {
    const db = c.env.DB;
    const userID = c.get("user")!.id;

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
  routes.put("/llm-config", async (c) => {
    const db = c.env.DB;
    const userID = c.get("user")!.id;

    const body = await c.req.json<{
      provider?: string;
      api_key?: string;
      model?: string;
    }>();

    // Clear operation
    if (!body.provider && !body.api_key && !body.model) {
      await db.prepare("DELETE FROM user_llm_configs WHERE user_id = ?").bind(userID).run();
      return c.json({ message: "LLM configuration cleared" });
    }

    // Validate provider
    const validProviders = ["openai", "anthropic", "google"];
    if (!body.provider || !validProviders.includes(body.provider)) {
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

    return c.json({ message: "LLM configuration saved" });
  });

  // GET /api/settings/preferences
  routes.get("/preferences", async (c) => {
    const db = c.env.DB;
    const userID = c.get("user")!.id;

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
  routes.put("/preferences", async (c) => {
    const db = c.env.DB;
    const userID = c.get("user")!.id;

    const body = await c.req.json<Record<string, string>>();

    const stmt = db.prepare(
      `INSERT INTO user_settings (user_id, key, value)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value`,
    );

    const batch = Object.entries(body).map(([key, value]) =>
      stmt.bind(userID, key, value),
    );

    if (batch.length > 0) {
      await db.batch(batch);
    }

    return c.json({ message: "Preferences saved" });
  });

  return routes;
}
