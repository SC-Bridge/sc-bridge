import { Hono } from "hono";
import { z } from "zod";
import { getAuthUser, type HonoEnv } from "../lib/types";
import { encrypt, decrypt, maskAPIKey } from "../lib/crypto";
import { logUserChange } from "../lib/change-history";
import { validate, LLMProvider } from "../lib/validation";
import { purgePublicFleetCache } from "../lib/publicFleet";

/**
 * /api/settings/* — User settings and LLM configuration
 */
export function settingsRoutes() {
  const routes = new Hono<HonoEnv>();

  // GET /api/settings/llm-config
  routes.get("/llm-config", async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;

    const configs = await db
      .prepare(
        "SELECT id, provider, encrypted_api_key, model FROM user_llm_configs WHERE user_id = ? ORDER BY provider",
      )
      .bind(userID)
      .all<{
        id: number;
        provider: string;
        encrypted_api_key: string;
        model: string;
      }>();

    // Build per-provider info
    const providers: Record<string, { api_key_set: boolean; api_key_mask: string; model: string }> = {};
    let firstProvider = "";
    let firstModel = "";
    let anyKeySet = false;

    for (const config of configs.results) {
      let maskedKey = "";
      let keySet = false;
      if (config.encrypted_api_key) {
        keySet = true;
        anyKeySet = true;
        if (c.env.ENCRYPTION_KEY) {
          try {
            const decrypted = await decrypt(config.encrypted_api_key, c.env.ENCRYPTION_KEY);
            maskedKey = maskAPIKey(decrypted);
          } catch {
            maskedKey = "***error***";
          }
        } else {
          maskedKey = maskAPIKey(config.encrypted_api_key);
        }
      }
      providers[config.provider] = { api_key_set: keySet, api_key_mask: maskedKey, model: config.model ?? "" };
      if (!firstProvider) {
        firstProvider = config.provider;
        firstModel = config.model ?? "";
      }
    }

    return c.json({
      provider: firstProvider,
      api_key_set: anyKeySet,
      api_key_mask: providers[firstProvider]?.api_key_mask ?? "",
      model: firstModel,
      providers,
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
      return c.json({ ok: true, message: "LLM configuration cleared" });
    }

    if (!body.provider) {
      return c.json({ error: "Invalid provider" }, 400);
    }

    // Model-only update (no new api_key) — just update the model column
    if (!body.api_key?.trim()) {
      const existing = await db
        .prepare("SELECT id FROM user_llm_configs WHERE user_id = ? AND provider = ?")
        .bind(userID, body.provider)
        .first();
      if (!existing) {
        return c.json({ error: "API key is required for new provider" }, 400);
      }
      if (body.model) {
        await db
          .prepare("UPDATE user_llm_configs SET model = ?, updated_at = datetime('now') WHERE user_id = ? AND provider = ?")
          .bind(body.model, userID, body.provider)
          .run();
      }
      return c.json({ ok: true, message: "Model updated" });
    }

    // Clear key for this provider
    if (body.api_key === '') {
      await db.prepare("DELETE FROM user_llm_configs WHERE user_id = ? AND provider = ?")
        .bind(userID, body.provider).run();
      return c.json({ ok: true, message: "Provider key removed" });
    }

    let encryptedKey = body.api_key;
    if (c.env.ENCRYPTION_KEY) {
      encryptedKey = await encrypt(body.api_key, c.env.ENCRYPTION_KEY);
    } else if (c.env.API_TOKEN) {
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

    return c.json({ ok: true, message: "LLM configuration saved" });
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
      sync_consent: z.string().max(100).nullable().optional(),
      preferredGameVersion: z.string().max(100).nullable().optional(),
      privacyMode: z.enum(['off', 'hidden', 'stealth']).optional(),
      stealthPercent: z.string().max(5).optional(),
      sidebarCollapsed: z.enum(['0', '1']).optional(),
      publicFleetShare: z.enum(['true']).nullable().optional(),
    }).strict()),
    async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;

    const body = c.req.valid("json");

    // adminPreviewPatch (Preview Channel): any authenticated user can opt in.
    // The legacy super_admin gate was removed 2026-05-08 — PTU data is just
    // game info, no security implications. PTU shadow tables only exist on
    // staging anyway; on production the toggle has no effect (no ptu_* data
    // present, so the channelMiddleware fallback would just keep showing LIVE).

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

    // Bust public-fleet KV cache when the share toggle changes. Use waitUntil
    // so a transient KV error doesn't 500 the settings save.
    if ('publicFleetShare' in body) {
      const handleRow = await db
        .prepare("SELECT verified_handle FROM user_rsi_profile WHERE user_id = ?")
        .bind(userID)
        .first<{ verified_handle: string | null }>();
      c.executionCtx.waitUntil(
        purgePublicFleetCache(c.env.SC_BRIDGE_CACHE, handleRow?.verified_handle ?? null)
          .catch((err) => console.error("[settings/preferences] KV purge failed (non-fatal):", err)),
      );
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

    return c.json({ ok: true, message: "Preferences saved" });
  });

  // DELETE /api/settings/sync-data — remove all synced RSI data
  routes.delete("/sync-data", async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    const ipAddress = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for");

    // Count what we're about to delete for the response
    const [fleetCount, buybackCount, profileExists] = await Promise.all([
      db.prepare("SELECT COUNT(*) as cnt FROM user_fleet WHERE user_id = ?").bind(userID).first<{ cnt: number }>(),
      db.prepare("SELECT COUNT(*) as cnt FROM user_buyback_pledges WHERE user_id = ?").bind(userID).first<{ cnt: number }>(),
      db.prepare("SELECT 1 FROM user_rsi_profiles WHERE user_id = ?").bind(userID).first(),
    ]);

    // Delete all synced data in a batch
    await db.batch([
      db.prepare("DELETE FROM user_fleet WHERE user_id = ?").bind(userID),
      db.prepare("DELETE FROM user_buyback_pledges WHERE user_id = ?").bind(userID),
      db.prepare("DELETE FROM user_rsi_profiles WHERE user_id = ?").bind(userID),
      db.prepare("DELETE FROM user_settings WHERE user_id = ? AND key = 'sync_consent'").bind(userID),
    ]);

    await logUserChange(db, userID, "sync_data_deleted", {
      metadata: {
        fleet_deleted: fleetCount?.cnt ?? 0,
        buyback_deleted: buybackCount?.cnt ?? 0,
        profile_deleted: !!profileExists,
      },
      ipAddress,
    });

    return c.json({
      message: "All synced data deleted",
      fleet_deleted: fleetCount?.cnt ?? 0,
      buyback_deleted: buybackCount?.cnt ?? 0,
      profile_deleted: !!profileExists,
    });
  });

  // GET /api/settings/sync-status — what synced data exists for this user
  routes.get("/sync-status", async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;

    const [fleetCount, buybackCount, profile, consentSetting] = await Promise.all([
      db.prepare("SELECT COUNT(*) as cnt FROM user_fleet WHERE user_id = ?").bind(userID).first<{ cnt: number }>(),
      db.prepare("SELECT COUNT(*) as cnt FROM user_buyback_pledges WHERE user_id = ?").bind(userID).first<{ cnt: number }>(),
      db.prepare("SELECT synced_at FROM user_rsi_profiles WHERE user_id = ?").bind(userID).first<{ synced_at: string }>(),
      db.prepare("SELECT value FROM user_settings WHERE user_id = ? AND key = 'sync_consent'").bind(userID).first<{ value: string }>(),
    ]);

    return c.json({
      has_data: (fleetCount?.cnt ?? 0) > 0 || (buybackCount?.cnt ?? 0) > 0 || !!profile,
      fleet_count: fleetCount?.cnt ?? 0,
      buyback_count: buybackCount?.cnt ?? 0,
      has_profile: !!profile,
      last_synced: profile?.synced_at ?? null,
      consent_given: consentSetting?.value ?? null,
    });
  });

  return routes;
}
