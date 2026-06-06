import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";

/**
 * Better Auth schema-parity guardrail.
 *
 * Better Auth manages its own tables (user, session, account, verification,
 * organization, member, invitation, twoFactor, passkey). These are created at
 * runtime / bootstrapped out-of-band — NOT owned by our migration files — so a
 * better-auth version bump that adds a column drifts silently and breaks prod
 * (twoFactor.verified → "invalid code"; passkey.aaguid → passkey registration
 * fails; invitation.createdAt/teamId → org invites fail; session.impersonatedBy
 * → admin impersonation fails).
 *
 * This test asserts every column better-auth 1.6 + our active plugins
 * (admin, organization, twoFactor, passkey) expect actually exists. When you
 * bump better-auth, diff its schema (node_modules/better-auth/dist/**​/schema.*)
 * against this list and add a migration for any new column — then update this
 * list. See memory: betterauth-16-twofactor-verified-column-missing.
 */

// Columns better-auth 1.6.13 + active plugins require on each managed table.
// Extra columns (SC Bridge app columns, legacy webauthnUserID) are allowed.
const REQUIRED_BA_COLUMNS: Record<string, string[]> = {
  user: [
    "id", "name", "email", "emailVerified", "image", "createdAt", "updatedAt",
    // admin plugin
    "role", "banned", "banReason", "banExpires",
    // twoFactor plugin
    "twoFactorEnabled",
  ],
  session: [
    "id", "expiresAt", "token", "createdAt", "updatedAt", "ipAddress",
    "userAgent", "userId",
    // admin plugin
    "impersonatedBy",
    // organization plugin
    "activeOrganizationId",
  ],
  account: [
    "id", "accountId", "providerId", "userId", "accessToken", "refreshToken",
    "idToken", "accessTokenExpiresAt", "refreshTokenExpiresAt", "scope",
    "password", "createdAt", "updatedAt",
  ],
  verification: ["id", "identifier", "value", "expiresAt", "createdAt", "updatedAt"],
  // organization plugin
  organization: ["id", "name", "slug", "logo", "createdAt", "metadata"],
  member: ["id", "organizationId", "userId", "role", "createdAt"],
  invitation: [
    "id", "organizationId", "email", "role", "status", "expiresAt",
    "inviterId", "createdAt", "teamId",
  ],
  // twoFactor plugin
  twoFactor: ["id", "secret", "backupCodes", "userId", "verified"],
  // passkey plugin
  passkey: [
    "id", "name", "publicKey", "userId", "credentialID", "counter",
    "deviceType", "backedUp", "transports", "createdAt", "aaguid",
  ],
};

async function tableColumns(table: string): Promise<Set<string>> {
  const res = await env.DB
    .prepare(`PRAGMA table_info("${table}")`)
    .all<{ name: string }>();
  return new Set(res.results.map((r) => r.name));
}

describe("Better Auth — schema parity", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  for (const [table, required] of Object.entries(REQUIRED_BA_COLUMNS)) {
    it(`${table} has every column better-auth 1.6 expects`, async () => {
      const actual = await tableColumns(table);
      const missing = required.filter((c) => !actual.has(c));
      expect(missing, `${table} is missing better-auth columns: ${missing.join(", ")}`).toEqual([]);
    });
  }
});
