/**
 * Accountant ledger scope (design: accountant-m4-design.md §5.1–§5.2).
 *
 * The single complexity-containment seam for M4 corp support: every accountant
 * query resolves its WHERE fragment through `resolveScope`, so the private-vs-corp
 * decision lives in exactly one place.
 *
 *   - Private ledger: `user_id = ? AND org_id IS NULL`  (per-user)
 *   - Corp ledger:    `org_id = ?`                       (org-wide; any member's rows)
 *
 * `user_id` is still stamped on corp rows for attribution, but corp balance is
 * org-wide. Reading a corp scope requires membership; writing requires manager
 * authority (owner/admin) OR being the org's accountant (D13).
 */

import { HTTPException } from "hono/http-exception";

/**
 * Thrown when a user lacks access to the requested corp scope/action. Extends
 * HTTPException so Hono renders it as a 403 `{ error }` automatically — handlers
 * can call the assert* helpers without try/catch.
 */
export class ScopeForbidden extends HTTPException {
  constructor(message = "Forbidden") {
    super(403, { res: Response.json({ error: message }, { status: 403 }) });
  }
}

export interface Scope {
  /** WHERE fragment, e.g. `user_id = ? AND org_id IS NULL` or `org_id = ?`. */
  sql: string;
  /** Bind values for the fragment, in order. */
  binds: string[];
  /** The active org id, or null for the private ledger. */
  orgId: string | null;
}

/**
 * Build the scope WHERE fragment, optionally table-aliased (for joined queries
 * that alias the accountant table, e.g. `l.org_id`). The single source of truth
 * for the private-vs-corp predicate; binds are unchanged by the alias.
 */
function buildSql(orgId: string | null, alias = ""): string {
  const p = alias ? `${alias}.` : "";
  return orgId ? `${p}org_id = ?` : `${p}user_id = ? AND ${p}org_id IS NULL`;
}

/** The scope WHERE fragment with a table alias (e.g. scopeWhere(scope, "l")). */
export function scopeWhere(scope: Scope, alias = ""): string {
  return buildSql(scope.orgId, alias);
}

/** The private-ledger scope for a user (used by direct engine callers/tests). */
export function privateScope(userId: string): Scope {
  return { sql: buildSql(null), binds: [userId], orgId: null };
}

/** A member's base role in an org, or null if not a member. */
export async function memberRole(
  db: D1Database,
  orgId: string,
  userId: string,
): Promise<string | null> {
  const r = await db
    .prepare("SELECT role FROM member WHERE organizationId = ? AND userId = ?")
    .bind(orgId, userId)
    .first<{ role: string }>();
  return r?.role ?? null;
}

/** True when the user is the org's designated accountant (D13). */
export async function isAccountant(
  db: D1Database,
  orgId: string,
  userId: string,
): Promise<boolean> {
  const r = await db
    .prepare('SELECT accountant_user_id FROM organization WHERE id = ?')
    .bind(orgId)
    .first<{ accountant_user_id: string | null }>();
  return !!r && r.accountant_user_id === userId;
}

/**
 * Resolve the active ledger scope. `activeOrgId` null → private; otherwise the
 * caller must be a member of the org (else ScopeForbidden → 403). This gates
 * READ access; writes additionally call `assertManager`.
 */
export async function resolveScope(
  db: D1Database,
  userId: string,
  activeOrgId: string | null,
): Promise<Scope> {
  if (!activeOrgId) {
    return { sql: buildSql(null), binds: [userId], orgId: null };
  }
  const role = await memberRole(db, activeOrgId, userId);
  if (!role) throw new ScopeForbidden();
  return { sql: buildSql(activeOrgId), binds: [activeOrgId], orgId: activeOrgId };
}

/**
 * The user's active ledger org, read from the `activeLedgerOrgId` user setting.
 * Returns null (private) when unset OR when the user is no longer a member of the
 * stored org — a lapsed membership transparently falls back to private rather
 * than 403-ing every accountant page. The single source of truth for "what scope
 * am I in", used by the mode endpoint and the scope-resolving handlers.
 */
export async function getActiveOrgId(
  db: D1Database,
  userId: string,
): Promise<string | null> {
  const r = await db
    .prepare("SELECT value FROM user_settings WHERE user_id = ? AND key = 'activeLedgerOrgId'")
    .bind(userId)
    .first<{ value: string }>();
  const orgId = r?.value ?? null;
  if (!orgId) return null;
  return (await memberRole(db, orgId, userId)) ? orgId : null;
}

/** Any base role. Returns the role. Throws if not a member. */
export async function assertMember(
  db: D1Database,
  orgId: string,
  userId: string,
): Promise<string> {
  const role = await memberRole(db, orgId, userId);
  if (!role) throw new ScopeForbidden();
  return role;
}

/**
 * Manager authority over the corp wallet: base role owner/admin OR the org's
 * accountant (D13 — custody carries financial authority, even for a plain member).
 */
export async function assertManager(
  db: D1Database,
  orgId: string,
  userId: string,
): Promise<void> {
  const role = await memberRole(db, orgId, userId);
  if (role === "owner" || role === "admin") return;
  if (await isAccountant(db, orgId, userId)) return;
  throw new ScopeForbidden();
}

/** Owner-only governance (corp tier, membership, accountant assignment). */
export async function assertOwner(
  db: D1Database,
  orgId: string,
  userId: string,
): Promise<void> {
  const role = await memberRole(db, orgId, userId);
  if (role !== "owner") throw new ScopeForbidden();
}
