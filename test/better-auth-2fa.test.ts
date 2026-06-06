import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { createOTP } from "@better-auth/utils/otp";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser } from "./helpers";

/**
 * Better Auth write-path regressions.
 *
 * Each test reproduces the exact DB write better-auth 1.6 performs for a flow
 * that broke in prod due to schema drift. Before the parity migrations (0256,
 * 0257) these writes threw "no such column" and surfaced as user-facing
 * failures ("invalid code", passkey registration failure, org invite failure).
 *
 * Plus a real TOTP generate→verify roundtrip using the same createOTP primitive
 * better-auth uses, so the 2FA mechanism itself is covered.
 */
describe("Better Auth — 2FA / write-path regressions", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  // ── The original incident: twoFactor.verified ──────────────────────────────
  it("verify-TOTP path can flip twoFactor.verified (the original bug)", async () => {
    const { userId } = await createTestUser(env.DB);
    const id = crypto.randomUUID();
    // Row as `enable` creates it: verified starts 0, gets flipped on first verify.
    await env.DB
      .prepare(
        `INSERT INTO "twoFactor" (id, secret, backupCodes, userId, verified)
         VALUES (?, 'enc-secret', 'enc-backup', ?, 0)`,
      )
      .bind(id, userId)
      .run();

    // The exact UPDATE better-auth runs after a successful TOTP check
    // (totp/index.mjs: update { verified: true }). Pre-0256 this threw
    // "no such column: verified".
    await env.DB
      .prepare(`UPDATE "twoFactor" SET verified = 1 WHERE id = ?`)
      .bind(id)
      .run();

    const row = await env.DB
      .prepare(`SELECT verified FROM "twoFactor" WHERE id = ?`)
      .bind(id)
      .first<{ verified: number }>();
    expect(row?.verified).toBe(1);
  });

  // ── A real TOTP roundtrip with better-auth's own primitive ─────────────────
  it("generates and verifies a TOTP with the same createOTP better-auth uses", async () => {
    // A base32 secret (what enable stores / the QR encodes).
    const secret = "JBSWY3DPEHPK3PXP";
    const otp = createOTP(secret, { period: 30, digits: 6 });
    const code = await otp.totp();
    expect(code).toMatch(/^\d{6}$/);
    expect(await otp.verify(code)).toBe(true);
    expect(await otp.verify("000000", { window: 0 })).not.toBe(true);
  });

  // ── passkey.aaguid ─────────────────────────────────────────────────────────
  it("passkey registration insert (with aaguid) succeeds", async () => {
    const { userId } = await createTestUser(env.DB);
    // The exact shape verifyPasskeyRegistration inserts (index.mjs adapter.create).
    await env.DB
      .prepare(
        `INSERT INTO "passkey"
         (id, name, publicKey, userId, credentialID, counter, deviceType, backedUp, transports, createdAt, aaguid)
         VALUES (?, 'My Key', 'pk', ?, 'cred-1', 0, 'singleDevice', 0, 'internal', ?, '00000000-0000-0000-0000-000000000000')`,
      )
      .bind(crypto.randomUUID(), userId, new Date().toISOString())
      .run();

    const row = await env.DB
      .prepare(`SELECT aaguid FROM "passkey" WHERE userId = ?`)
      .bind(userId)
      .first<{ aaguid: string }>();
    expect(row?.aaguid).toBe("00000000-0000-0000-0000-000000000000");
  });

  // ── invitation.createdAt + teamId ──────────────────────────────────────────
  it("org invitation insert (with createdAt + teamId) succeeds", async () => {
    const { userId } = await createTestUser(env.DB);
    const orgId = crypto.randomUUID();
    await env.DB
      .prepare(
        `INSERT INTO "organization" (id, name, slug, createdAt) VALUES (?, 'Org', ?, ?)`,
      )
      .bind(orgId, `org-${orgId.slice(0, 8)}`, new Date().toISOString())
      .run();

    // The exact shape createInvitation inserts (organization/adapter.mjs:
    // status, expiresAt, createdAt, inviterId, teamId).
    const invId = crypto.randomUUID();
    await env.DB
      .prepare(
        `INSERT INTO "invitation"
         (id, organizationId, email, role, status, expiresAt, inviterId, createdAt, teamId)
         VALUES (?, ?, 'invitee@example.com', 'member', 'pending', ?, ?, ?, NULL)`,
      )
      .bind(invId, orgId, new Date(Date.now() + 86400000).toISOString(), userId, new Date().toISOString())
      .run();

    const row = await env.DB
      .prepare(`SELECT createdAt FROM "invitation" WHERE id = ?`)
      .bind(invId)
      .first<{ createdAt: string }>();
    expect(row?.createdAt).toBeTruthy();
  });

  // ── session.impersonatedBy ─────────────────────────────────────────────────
  it("admin impersonation session insert (with impersonatedBy) succeeds", async () => {
    const admin = await createTestUser(env.DB, { role: "super_admin" });
    const target = await createTestUser(env.DB);

    const sid = crypto.randomUUID();
    await env.DB
      .prepare(
        `INSERT INTO "session" (id, expiresAt, token, createdAt, updatedAt, userId, impersonatedBy)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        sid,
        new Date(Date.now() + 3600000).toISOString(),
        `imp-${crypto.randomUUID()}`,
        new Date().toISOString(),
        new Date().toISOString(),
        target.userId,
        admin.userId,
      )
      .run();

    const row = await env.DB
      .prepare(`SELECT impersonatedBy FROM "session" WHERE id = ?`)
      .bind(sid)
      .first<{ impersonatedBy: string }>();
    expect(row?.impersonatedBy).toBe(admin.userId);
  });
});
