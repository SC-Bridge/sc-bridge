import { decrypt } from "./crypto";

/**
 * Decrypt a stored API key. With no ENCRYPTION_KEY the key was stored in
 * plaintext (dev mode only — production blocks plaintext writes).
 */
export async function decryptAPIKey(
  encryptedKey: string,
  encryptionKey?: string,
): Promise<string | null> {
  if (!encryptionKey) {
    console.warn("[llm] ENCRYPTION_KEY not set — reading API key as plaintext (dev mode)");
    return encryptedKey;
  }
  try {
    return await decrypt(encryptedKey, encryptionKey);
  } catch {
    return null;
  }
}

/**
 * Fetch + decrypt the user's stored API key. Pass `provider` to target a
 * specific provider's config; omit it to take the first configured key.
 */
export async function getDecryptedAPIKey(
  db: D1Database,
  userID: string,
  encryptionKey?: string,
  provider?: string,
): Promise<string | null> {
  const config = await db
    .prepare(
      provider
        ? "SELECT encrypted_api_key FROM user_llm_configs WHERE user_id = ? AND provider = ? LIMIT 1"
        : "SELECT encrypted_api_key FROM user_llm_configs WHERE user_id = ? LIMIT 1",
    )
    .bind(...(provider ? [userID, provider] : [userID]))
    .first<{ encrypted_api_key: string }>();

  if (!config?.encrypted_api_key) return null;
  return decryptAPIKey(config.encrypted_api_key, encryptionKey);
}
