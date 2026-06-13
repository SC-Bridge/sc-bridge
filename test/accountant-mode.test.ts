import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders } from "./helpers";

async function makeOrg(id: string, tier = "easy"): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO organization (id, name, slug, createdAt, accountant_tier)
     VALUES (?, 'Corp', ?, '2026-06-01T00:00:00Z', ?)`,
  ).bind(id, id, tier).run();
}
async function addMember(orgId: string, userId: string, role: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO member (id, organizationId, userId, role, createdAt)
     VALUES (?, ?, ?, ?, '2026-06-01T00:00:00Z')`,
  ).bind(crypto.randomUUID(), orgId, userId, role).run();
}
async function getMode(token: string) {
  return (await (await SELF.fetch("http://localhost/api/accountant/mode", {
    headers: await authHeaders(token),
  })).json()) as { orgId: string | null; effectiveTier: string; orgs: Array<{ id: string; role: string }> };
}
async function putMode(token: string, orgId: string | null) {
  return SELF.fetch("http://localhost/api/accountant/mode", {
    method: "PUT",
    headers: { ...(await authHeaders(token)), "Content-Type": "application/json" },
    body: JSON.stringify({ orgId }),
  });
}

describe("Accountant ledger mode", () => {
  beforeAll(async () => { await setupTestDatabase(env.DB); });

  it("defaults to private (null) with the user's personal tier", async () => {
    const { sessionToken, userId } = await createTestUser(env.DB);
    await env.DB.prepare(
      "INSERT INTO user_settings (user_id, key, value) VALUES (?, 'accountantTier', 'industrial')",
    ).bind(userId).run();
    const mode = await getMode(sessionToken);
    expect(mode.orgId).toBeNull();
    expect(mode.effectiveTier).toBe("industrial");
  });

  it("a member can switch to corp mode; effectiveTier becomes the corp tier", async () => {
    const { sessionToken, userId } = await createTestUser(env.DB);
    const orgId = `org-${crypto.randomUUID().slice(0, 8)}`;
    await makeOrg(orgId, "advanced");
    await addMember(orgId, userId, "member");

    const res = await putMode(sessionToken, orgId);
    expect(res.status).toBe(200);

    const mode = await getMode(sessionToken);
    expect(mode.orgId).toBe(orgId);
    expect(mode.effectiveTier).toBe("advanced");           // corp tier overrides personal
    expect(mode.orgs.map((o) => o.id)).toContain(orgId);
  });

  it("switching to a non-member org is rejected (403)", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const orgId = `org-${crypto.randomUUID().slice(0, 8)}`;
    await makeOrg(orgId);
    const res = await putMode(sessionToken, orgId);
    expect(res.status).toBe(403);
    expect((await getMode(sessionToken)).orgId).toBeNull(); // unchanged
  });

  it("orgId:null returns to private", async () => {
    const { sessionToken, userId } = await createTestUser(env.DB);
    const orgId = `org-${crypto.randomUUID().slice(0, 8)}`;
    await makeOrg(orgId);
    await addMember(orgId, userId, "admin");
    await putMode(sessionToken, orgId);
    expect((await getMode(sessionToken)).orgId).toBe(orgId);
    const res = await putMode(sessionToken, null);
    expect(res.status).toBe(200);
    expect((await getMode(sessionToken)).orgId).toBeNull();
  });

  it("a lapsed membership falls back to private (no 403 storm)", async () => {
    const { sessionToken, userId } = await createTestUser(env.DB);
    const orgId = `org-${crypto.randomUUID().slice(0, 8)}`;
    await makeOrg(orgId);
    await addMember(orgId, userId, "member");
    await putMode(sessionToken, orgId);
    // Remove membership (kicked from the corp) — stored pref is now stale.
    await env.DB.prepare("DELETE FROM member WHERE organizationId = ? AND userId = ?").bind(orgId, userId).run();
    const mode = await getMode(sessionToken);
    expect(mode.orgId).toBeNull();        // transparently private
  });
});
