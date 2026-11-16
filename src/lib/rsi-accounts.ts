/**
 * RSI accounts (migration 0284) — one SC Bridge sign-in can hold several
 * Star Citizen accounts; every hangar row carries the rsi_account_id it
 * belongs to.
 */

export const MAX_RSI_ACCOUNTS = 10;

/**
 * Parse the `?accounts=` query param. Missing, empty or 'all' means every
 * account (null); otherwise the distinct positive integers, at most
 * MAX_RSI_ACCOUNTS, in the order given. No valid id also means null — the
 * ids only ever narrow a query that is already scoped to the user.
 */
export function parseAccountsParam(raw: string | undefined): number[] | null {
  if (!raw || raw === "all") return null;
  const ids: number[] = [];
  for (const part of raw.split(",")) {
    const n = Number(part.trim());
    if (Number.isInteger(n) && n > 0 && !ids.includes(n)) ids.push(n);
  }
  return ids.length > 0 ? ids.slice(0, MAX_RSI_ACCOUNTS) : null;
}

/** Marker colours for RSI accounts, in the order they are handed out. */
export const ACCOUNT_COLORS: readonly string[] = [
  "#22d3ee", "#f97316", "#a855f7", "#84cc16", "#f43f5e",
  "#eab308", "#3b82f6", "#10b981", "#ec4899", "#94a3b8",
];

/** The first palette colour no account uses; once all are used, palette[count % size]. */
export function nextAccountColor(used: (string | null)[]): string {
  const taken = new Set(used);
  return ACCOUNT_COLORS.find((c) => !taken.has(c)) ?? ACCOUNT_COLORS[used.length % ACCOUNT_COLORS.length];
}

export interface SyncIdentity {
  handle: string | null;
  referralCode: string | null;
}

export interface RsiAccountRow {
  id: number;
  rsi_handle: string | null;
  referral_code: string | null;
  label: string | null;
  is_primary: number;
  is_placeholder: number;
  /**
   * Set when this account's handle / referral code was seen in an
   * authenticated hangar-sync payload (src/routes/import.ts). It is NOT proof
   * of RSI identity — per-account RSI verification is a later phase.
   */
  verified_at: string | null;
  synced_at: string | null;
}

export type SyncResolution =
  | { kind: "matched"; accountId: number; fillReferral: boolean }
  | { kind: "first" }
  | { kind: "needs_mapping"; reason: "no_identity" | "partial" | "unknown"; candidateId: number | null };

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Pull the RSI identity (handle + referral code) out of a hangar-sync `account` payload. */
export function identityFromPayload(account: unknown): SyncIdentity {
  if (!account || typeof account !== "object") return { handle: null, referralCode: null };
  const a = account as Record<string, unknown>;
  return { handle: cleanString(a.nickname), referralCode: cleanString(a.referral_code) };
}

function sameText(a: string | null, b: string | null): boolean {
  return a !== null && b !== null && a.toLowerCase() === b.toLowerCase();
}

/**
 * Decide which of the user's RSI accounts an incoming sync belongs to.
 * Placeholder accounts never match — they have no identity to compare.
 */
export function resolveSyncAccount(identity: SyncIdentity, accounts: RsiAccountRow[]): SyncResolution {
  if (accounts.length === 0) return { kind: "first" };
  if (!identity.handle && !identity.referralCode) {
    return { kind: "needs_mapping", reason: "no_identity", candidateId: null };
  }

  const real = accounts.filter((a) => !a.is_placeholder);

  const byHandle = real.find((a) => sameText(a.rsi_handle, identity.handle));
  if (byHandle) {
    const stored = byHandle.referral_code;
    const incoming = identity.referralCode;
    if (stored !== null && incoming !== null && stored.toLowerCase() !== incoming.toLowerCase()) {
      return { kind: "needs_mapping", reason: "partial", candidateId: byHandle.id };
    }
    const fillReferral = stored === null && incoming !== null;
    // Filling would violate the (user_id, referral_code) unique index when another account holds it.
    if (fillReferral && accounts.some((a) => a.id !== byHandle.id && sameText(a.referral_code, incoming))) {
      return { kind: "needs_mapping", reason: "partial", candidateId: byHandle.id };
    }
    return { kind: "matched", accountId: byHandle.id, fillReferral };
  }

  const byReferral = real.find((a) => sameText(a.referral_code, identity.referralCode));
  if (byReferral) {
    return { kind: "needs_mapping", reason: "partial", candidateId: byReferral.id };
  }

  return { kind: "needs_mapping", reason: "unknown", candidateId: null };
}

/** Whether the user may add another RSI account (one while the feature is off, MAX when on). */
export function canAddAccount(opts: { enabled: boolean; accountCount: number }): boolean {
  const cap = opts.enabled ? MAX_RSI_ACCOUNTS : 1;
  return opts.accountCount < cap;
}

/**
 * With no identity in the sync, hand mapping is only safe onto a verified,
 * non-placeholder account. With an identity, any account may be mapped onto.
 * "Verified" here means verified_at is set — the account was seen in an
 * authenticated sync payload — not that its RSI identity was proven.
 */
export function canMapOnto(target: RsiAccountRow, identity: SyncIdentity): boolean {
  if (!identity.handle && !identity.referralCode) {
    return !target.is_placeholder && target.verified_at !== null;
  }
  return true;
}

export function multiAccountEnabled(env: { ENVIRONMENT?: string }): boolean {
  return env.ENVIRONMENT !== "production";
}

/** Minimum gap between two syncs of the same RSI account. */
export const SYNC_INTERVAL_MINUTES = 5;

/**
 * Claim the right to sync this account: in one transaction, read the last
 * sync time and stamp it with now, but only if the last sync is at least
 * SYNC_INTERVAL_MINUTES old. Two requests arriving together cannot both pass —
 * a check-then-write here let two imports of one account run at once and
 * delete each other's pledges. julianday() reads both "YYYY-MM-DD HH:MM:SS"
 * and ISO timestamps.
 */
export async function claimSyncSlot(
  db: D1Database,
  userId: string,
  accountId: number,
): Promise<{ claimed: boolean; previous: string | null }> {
  const [before, update] = await db.batch([
    db
      .prepare("SELECT synced_at FROM user_rsi_accounts WHERE id = ? AND user_id = ?")
      .bind(accountId, userId),
    db
      .prepare(
        `UPDATE user_rsi_accounts SET synced_at = datetime('now')
         WHERE id = ? AND user_id = ?
           AND (synced_at IS NULL OR julianday(synced_at) <= julianday('now', ?))
         RETURNING id`,
      )
      .bind(accountId, userId, `-${SYNC_INTERVAL_MINUTES} minutes`),
  ]);
  const previous = (before.results[0] as { synced_at: string | null } | undefined)?.synced_at ?? null;
  return { claimed: update.results.length === 1, previous };
}

/** Undo a claim after a failed sync, so the user can retry straight away. */
export async function releaseSyncSlot(
  db: D1Database,
  userId: string,
  accountId: number,
  previous: string | null,
): Promise<void> {
  await db
    .prepare("UPDATE user_rsi_accounts SET synced_at = ? WHERE id = ? AND user_id = ?")
    .bind(previous, accountId, userId)
    .run();
}

export async function listRsiAccounts(db: D1Database, userId: string): Promise<RsiAccountRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, rsi_handle, referral_code, label, is_primary, is_placeholder, verified_at, synced_at
       FROM user_rsi_accounts WHERE user_id = ? ORDER BY id`,
    )
    .bind(userId)
    .all<RsiAccountRow>();
  return results;
}

/**
 * Create an RSI account. It becomes the primary account only when it is the
 * user's first. The account cap is the caller's check (canAddAccount).
 */
export async function createRsiAccount(
  db: D1Database,
  userId: string,
  fields: { handle: string | null; referralCode: string | null; placeholder: boolean },
): Promise<number> {
  const label = fields.placeholder ? "Imported hangar" : null;
  const { results: existing } = await db
    .prepare("SELECT color FROM user_rsi_accounts WHERE user_id = ?")
    .bind(userId)
    .all<{ color: string | null }>();
  const color = nextAccountColor(existing.map((r) => r.color));
  const row = await db
    .prepare(
      `INSERT INTO user_rsi_accounts (user_id, rsi_handle, referral_code, label, is_primary, is_placeholder, color)
       VALUES (?, ?, ?, ?,
         CASE WHEN EXISTS (SELECT 1 FROM user_rsi_accounts WHERE user_id = ?) THEN 0 ELSE 1 END,
         ?, ?)
       RETURNING id`,
    )
    .bind(userId, fields.handle, fields.referralCode, label, userId, fields.placeholder ? 1 : 0, color)
    .first<{ id: number }>();
  if (!row) throw new Error("Failed to create RSI account");
  return row.id;
}

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
      `INSERT OR IGNORE INTO user_rsi_accounts (user_id, label, is_primary, is_placeholder, color)
       VALUES (?, 'Imported hangar', 1, 1, ?)`,
    )
    .bind(userId, ACCOUNT_COLORS[0])
    .run();

  const created = await db
    .prepare("SELECT id FROM user_rsi_accounts WHERE user_id = ? AND is_primary = 1")
    .bind(userId)
    .first<{ id: number }>();
  if (!created) throw new Error("Failed to create primary RSI account");
  return created.id;
}

/**
 * Resolve the `?account=` value of a per-account vehicle-settings request.
 * No value means the primary account. An owned id returns itself. A foreign,
 * unknown or non-integer id returns null, which the route turns into a 404.
 */
export async function resolveAccountId(
  db: D1Database,
  userId: string,
  raw: number | string | undefined | null,
): Promise<number | null> {
  if (raw === undefined || raw === null || raw === "") return getOrCreatePrimaryAccountId(db, userId);
  const id = typeof raw === "number" ? raw : /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const owned = await db
    .prepare("SELECT id FROM user_rsi_accounts WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .first<{ id: number }>();
  return owned ? owned.id : null;
}

/**
 * Delete an RSI account and every hangar row stamped with it. Order matters —
 * D1 enforces foreign keys. Throws when the account is not the user's.
 */
export async function deleteRsiAccount(db: D1Database, userId: string, accountId: number): Promise<void> {
  const owned = await db
    .prepare("SELECT id FROM user_rsi_accounts WHERE id = ? AND user_id = ?")
    .bind(accountId, userId)
    .first<{ id: number }>();
  if (!owned) throw new Error("RSI account not found");

  const fleetIds = "SELECT id FROM user_fleet WHERE user_id = ? AND rsi_account_id = ?";
  const pledgeIds = "SELECT rsi_pledge_id FROM user_pledges WHERE user_id = ? AND rsi_account_id = ?";
  const del = (table: string) =>
    db.prepare(`DELETE FROM ${table} WHERE user_id = ? AND rsi_account_id = ?`).bind(userId, accountId);

  await db.batch([
    db
      .prepare(`DELETE FROM org_op_ships WHERE owner_user_id = ? AND user_fleet_id IN (${fleetIds})`)
      .bind(userId, userId, accountId),
    // Fleet selections stamped before 0286 reached them (the deploy window) have
    // no rsi_account_id, so they are also found through the ship they belong to.
    db
      .prepare(
        `DELETE FROM user_module_selection WHERE user_id = ? AND owner_kind = 'fleet' AND owner_id IN (${fleetIds})`,
      )
      .bind(userId, userId, accountId),
    del("user_module_selection"),
    del("user_loaner_loadout"),
    del("user_localization_ship_order"),
    db
      .prepare(`DELETE FROM user_hangar_cleanup_decisions WHERE user_id = ? AND rsi_pledge_id IN (${pledgeIds})`)
      .bind(userId, userId, accountId),
    del("user_paints"),
    del("user_buyback_pledges"),
    del("user_pledge_upgrades"),
    del("user_pledge_items"),
    del("user_pledges"),
    del("user_fleet"),
    del("user_hangar_syncs"),
    db.prepare("DELETE FROM user_rsi_accounts WHERE id = ? AND user_id = ?").bind(accountId, userId),
    db
      .prepare(
        `UPDATE user_rsi_accounts SET is_primary = 1
         WHERE user_id = ?
           AND id = (SELECT MIN(id) FROM user_rsi_accounts WHERE user_id = ?)
           AND NOT EXISTS (SELECT 1 FROM user_rsi_accounts WHERE user_id = ? AND is_primary = 1)`,
      )
      .bind(userId, userId, userId),
  ]);
}
