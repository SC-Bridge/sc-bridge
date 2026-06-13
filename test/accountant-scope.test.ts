import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser } from "./helpers";
import {
  resolveScope,
  assertMember,
  assertManager,
  assertOwner,
  isAccountant,
  ScopeForbidden,
} from "../src/lib/accountant/scope";

/** Insert an organization + optional membership row. */
async function makeOrg(id: string, accountantUserId: string | null = null): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO organization (id, name, slug, createdAt, accountant_user_id)
     VALUES (?, 'Corp', ?, '2026-06-01T00:00:00Z', ?)`,
  ).bind(id, id, accountantUserId).run();
}
async function addMember(orgId: string, userId: string, role: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO member (id, organizationId, userId, role, createdAt)
     VALUES (?, ?, ?, ?, '2026-06-01T00:00:00Z')`,
  ).bind(crypto.randomUUID(), orgId, userId, role).run();
}

describe("accountant scope resolver", () => {
  beforeAll(async () => { await setupTestDatabase(env.DB); });

  it("private scope (null org) → user_id + org_id IS NULL, no membership needed", async () => {
    const { userId } = await createTestUser(env.DB);
    const scope = await resolveScope(env.DB, userId, null);
    expect(scope).toEqual({ sql: "user_id = ? AND org_id IS NULL", binds: [userId], orgId: null });
  });

  it("corp scope for a member → org_id = ?", async () => {
    const { userId } = await createTestUser(env.DB);
    const orgId = `org-${crypto.randomUUID().slice(0, 8)}`;
    await makeOrg(orgId);
    await addMember(orgId, userId, "member");
    const scope = await resolveScope(env.DB, userId, orgId);
    expect(scope).toEqual({ sql: "org_id = ?", binds: [orgId], orgId });
  });

  it("corp scope for a non-member → ScopeForbidden", async () => {
    const { userId } = await createTestUser(env.DB);
    const orgId = `org-${crypto.randomUUID().slice(0, 8)}`;
    await makeOrg(orgId);
    await expect(resolveScope(env.DB, userId, orgId)).rejects.toBeInstanceOf(ScopeForbidden);
  });

  it("assertManager: owner/admin pass, plain member rejected", async () => {
    const owner = await createTestUser(env.DB);
    const admin = await createTestUser(env.DB);
    const plain = await createTestUser(env.DB);
    const orgId = `org-${crypto.randomUUID().slice(0, 8)}`;
    await makeOrg(orgId);
    await addMember(orgId, owner.userId, "owner");
    await addMember(orgId, admin.userId, "admin");
    await addMember(orgId, plain.userId, "member");
    await expect(assertManager(env.DB, orgId, owner.userId)).resolves.toBeUndefined();
    await expect(assertManager(env.DB, orgId, admin.userId)).resolves.toBeUndefined();
    await expect(assertManager(env.DB, orgId, plain.userId)).rejects.toBeInstanceOf(ScopeForbidden);
  });

  it("assertManager: a plain member who IS the accountant passes (D13)", async () => {
    const plain = await createTestUser(env.DB);
    const orgId = `org-${crypto.randomUUID().slice(0, 8)}`;
    await makeOrg(orgId, plain.userId); // accountant_user_id = the member
    await addMember(orgId, plain.userId, "member");
    expect(await isAccountant(env.DB, orgId, plain.userId)).toBe(true);
    await expect(assertManager(env.DB, orgId, plain.userId)).resolves.toBeUndefined();
  });

  it("assertOwner: only owner passes", async () => {
    const owner = await createTestUser(env.DB);
    const admin = await createTestUser(env.DB);
    const orgId = `org-${crypto.randomUUID().slice(0, 8)}`;
    await makeOrg(orgId);
    await addMember(orgId, owner.userId, "owner");
    await addMember(orgId, admin.userId, "admin");
    await expect(assertOwner(env.DB, orgId, owner.userId)).resolves.toBeUndefined();
    await expect(assertOwner(env.DB, orgId, admin.userId)).rejects.toBeInstanceOf(ScopeForbidden);
  });

  it("assertMember returns the role; non-member throws", async () => {
    const { userId } = await createTestUser(env.DB);
    const orgId = `org-${crypto.randomUUID().slice(0, 8)}`;
    await makeOrg(orgId);
    await addMember(orgId, userId, "admin");
    expect(await assertMember(env.DB, orgId, userId)).toBe("admin");
    const stranger = await createTestUser(env.DB);
    await expect(assertMember(env.DB, orgId, stranger.userId)).rejects.toBeInstanceOf(ScopeForbidden);
  });
});
