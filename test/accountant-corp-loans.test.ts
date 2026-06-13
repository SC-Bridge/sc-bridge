import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders } from "./helpers";

async function makeOrg(id: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO organization (id, name, slug, createdAt) VALUES (?, 'Corp', ?, '2026-06-01T00:00:00Z')`,
  ).bind(id, id).run();
}
async function addMember(orgId: string, userId: string, role: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO member (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, ?, '2026-06-01T00:00:00Z')`,
  ).bind(crypto.randomUUID(), orgId, userId, role).run();
}
async function setMode(token: string, orgId: string | null) {
  return SELF.fetch("http://localhost/api/accountant/mode", {
    method: "PUT",
    headers: { ...(await authHeaders(token)), "Content-Type": "application/json" },
    body: JSON.stringify({ orgId }),
  });
}
async function createLoan(token: string) {
  return SELF.fetch("http://localhost/api/accountant/loans", {
    method: "POST",
    headers: { ...(await authHeaders(token)), "Content-Type": "application/json" },
    body: JSON.stringify({
      direction: "outgoing", counterparty: "@corp-debtor", principal: 100000,
      interest_rate: 0, interest_interval: "monthly", started_at: "2026-06-01T00:00:00Z",
    }),
  });
}
async function listLoans(token: string) {
  return (await (await SELF.fetch("http://localhost/api/accountant/loans", {
    headers: await authHeaders(token),
  })).json()) as { loans: Array<{ id: number; counterparty: string; outstanding: number }> };
}

describe("Corp loans — scope isolation + access control", () => {
  beforeAll(async () => { await setupTestDatabase(env.DB); });

  it("a manager creates a corp loan; it is org-scoped, org-wide, and absent from private", async () => {
    const owner = await createTestUser(env.DB);
    const orgId = `org-${crypto.randomUUID().slice(0, 8)}`;
    await makeOrg(orgId);
    await addMember(orgId, owner.userId, "owner");

    // Private loan for the same user (must NOT bleed into corp).
    await setMode(owner.sessionToken, null);
    expect((await createLoan(owner.sessionToken)).status).toBe(200);

    // Switch to corp, create a corp loan.
    await setMode(owner.sessionToken, orgId);
    const res = await createLoan(owner.sessionToken);
    expect(res.status).toBe(200);
    const { id } = (await res.json()) as { id: number };

    // The corp loan row carries org_id; the private loan does not.
    const row = await env.DB.prepare("SELECT org_id FROM accountant_loans WHERE id = ?")
      .bind(id).first<{ org_id: string | null }>();
    expect(row?.org_id).toBe(orgId);

    // Corp list shows the corp loan; private list shows the private loan only.
    const corpList = await listLoans(owner.sessionToken);
    expect(corpList.loans.some((l) => l.id === id)).toBe(true);
    await setMode(owner.sessionToken, null);
    const privList = await listLoans(owner.sessionToken);
    expect(privList.loans.some((l) => l.id === id)).toBe(false);
  });

  it("a plain member reads the corp ledger but cannot write; becoming the accountant grants write (D13)", async () => {
    const owner = await createTestUser(env.DB);
    const member = await createTestUser(env.DB);
    const orgId = `org-${crypto.randomUUID().slice(0, 8)}`;
    await makeOrg(orgId);
    await addMember(orgId, owner.userId, "owner");
    await addMember(orgId, member.userId, "member");

    // Owner seeds a corp loan.
    await setMode(owner.sessionToken, orgId);
    await createLoan(owner.sessionToken);

    // Member switches to corp: can READ.
    await setMode(member.sessionToken, orgId);
    const seen = await listLoans(member.sessionToken);
    expect(seen.loans.length).toBeGreaterThan(0);

    // ...but cannot WRITE (not a manager).
    expect((await createLoan(member.sessionToken)).status).toBe(403);

    // Owner designates the member as accountant → member can now write (D13).
    await env.DB.prepare("UPDATE organization SET accountant_user_id = ? WHERE id = ?")
      .bind(member.userId, orgId).run();
    expect((await createLoan(member.sessionToken)).status).toBe(200);
  });

  it("a non-member cannot enter corp scope (mode switch 403)", async () => {
    const stranger = await createTestUser(env.DB);
    const orgId = `org-${crypto.randomUUID().slice(0, 8)}`;
    await makeOrg(orgId);
    expect((await setMode(stranger.sessionToken, orgId)).status).toBe(403);
  });
});
