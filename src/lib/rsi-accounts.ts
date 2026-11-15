/**
 * RSI accounts (migration 0284) — one SC Bridge sign-in can hold several
 * Star Citizen accounts; every hangar row carries the rsi_account_id it
 * belongs to.
 */

/**
 * Return the user's primary RSI account id, creating a placeholder primary
 * account ('Imported hangar', no handle) when the user has none yet.
 */
export async function getOrCreatePrimaryAccountId(db: D1Database, userId: string): Promise<number> {
  const existing = await db
    .prepare("SELECT id FROM user_rsi_accounts WHERE user_id = ? AND is_primary = 1")
    .bind(userId)
    .first<{ id: number }>();
  if (existing) return existing.id;

  // The partial unique index on (user_id) WHERE is_primary = 1 makes a
  // concurrent second insert a no-op; the SELECT below then finds the winner.
  await db
    .prepare(
      `INSERT OR IGNORE INTO user_rsi_accounts (user_id, label, is_primary, is_placeholder)
       VALUES (?, 'Imported hangar', 1, 1)`,
    )
    .bind(userId)
    .run();

  const created = await db
    .prepare("SELECT id FROM user_rsi_accounts WHERE user_id = ? AND is_primary = 1")
    .bind(userId)
    .first<{ id: number }>();
  if (!created) throw new Error("Failed to create primary RSI account");
  return created.id;
}
