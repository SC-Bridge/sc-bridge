/**
 * User Change History — fire-and-forget audit logger.
 *
 * Logs user-scoped changes to `user_change_history`. Errors are caught and
 * logged via console.error so they never break the parent operation.
 */

/** Hardcoded map of event keys → IDs (matches change_event_types seed data) */
const EVENT_TYPE_IDS: Record<string, number> = {
  provider_linked: 1,
  provider_unlinked: 2,
  password_set: 3,
  password_changed: 4,
  profile_updated: 5,
  email_changed: 6,
  "2fa_enabled": 7,
  "2fa_disabled": 8,
  passkey_added: 9,
  passkey_removed: 10,
  passkey_renamed: 11,
  session_revoked: 12,
  account_deleted: 13,
  fleet_imported: 14,
  settings_changed: 15,
  llm_config_changed: 16,
  account_suspended: 17,
  account_banned: 18,
  account_reinstated: 19,
};

export async function logUserChange(
  db: D1Database,
  userId: string,
  eventKey: string,
  opts?: {
    providerId?: string;
    fieldName?: string;
    oldValue?: string;
    newValue?: string;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
  },
): Promise<void> {
  try {
    const eventTypeId = EVENT_TYPE_IDS[eventKey];
    if (!eventTypeId) {
      console.error(`[change-history] Unknown event key: ${eventKey}`);
      return;
    }

    await db
      .prepare(
        `INSERT INTO user_change_history
          (user_id, event_type_id, provider_id, field_name, old_value, new_value, metadata, ip_address)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        userId,
        eventTypeId,
        opts?.providerId ?? null,
        opts?.fieldName ?? null,
        opts?.oldValue ?? null,
        opts?.newValue ?? null,
        opts?.metadata ? JSON.stringify(opts.metadata) : null,
        opts?.ipAddress ?? null,
      )
      .run();
  } catch (err) {
    console.error("[change-history] Failed to log change:", err);
  }
}
