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
async function addEntry(token: string, body: Record<string, unknown>) {
  return SELF.fetch("http://localhost/api/accountant/ledger", {
    method: "POST",
    headers: { ...(await authHeaders(token)), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function ledger(token: string) {
  return (await (await SELF.fetch("http://localhost/api/accountant/ledger", {
    headers: await authHeaders(token),
  })).json()) as { entries: Array<{ id: number; description: string }>; balance: number };
}

const ENTRY = { amount: 5000, category: "trading", occurred_at: "2026-06-02T00:00:00Z", description: "Corp sale" };

describe("Corp ledger — scope isolation, access control, ingestion stays private", () => {
  beforeAll(async () => { await setupTestDatabase(env.DB); });

  it("corp ledger is org-wide and isolated from private", async () => {
    const owner = await createTestUser(env.DB);
    const orgId = `org-${crypto.randomUUID().slice(0, 8)}`;
    await makeOrg(orgId);
    await addMember(orgId, owner.userId, "owner");

    // private entry
    await setMode(owner.sessionToken, null);
    await addEntry(owner.sessionToken, { amount: -100, category: "running_cost", occurred_at: "2026-06-01T00:00:00Z", description: "Private fuel" });

    // corp entry
    await setMode(owner.sessionToken, orgId);
    const res = await addEntry(owner.sessionToken, ENTRY);
    expect(res.status).toBe(200);
    const { id } = (await res.json()) as { id: number };
    const row = await env.DB.prepare("SELECT org_id FROM accountant_entries WHERE id = ?").bind(id).first<{ org_id: string | null }>();
    expect(row?.org_id).toBe(orgId);

    const corp = await ledger(owner.sessionToken);
    expect(corp.entries.some((e) => e.description === "Corp sale")).toBe(true);
    expect(corp.entries.some((e) => e.description === "Private fuel")).toBe(false);
    expect(corp.balance).toBe(5000); // org-wide; private fuel not counted

    await setMode(owner.sessionToken, null);
    const priv = await ledger(owner.sessionToken);
    expect(priv.entries.some((e) => e.description === "Private fuel")).toBe(true);
    expect(priv.entries.some((e) => e.description === "Corp sale")).toBe(false);
  });

  it("a plain member reads the corp ledger but cannot post (403)", async () => {
    const owner = await createTestUser(env.DB);
    const member = await createTestUser(env.DB);
    const orgId = `org-${crypto.randomUUID().slice(0, 8)}`;
    await makeOrg(orgId);
    await addMember(orgId, owner.userId, "owner");
    await addMember(orgId, member.userId, "member");
    await setMode(owner.sessionToken, orgId);
    await addEntry(owner.sessionToken, ENTRY);

    await setMode(member.sessionToken, orgId);
    expect((await ledger(member.sessionToken)).entries.length).toBeGreaterThan(0); // read ok
    expect((await addEntry(member.sessionToken, ENTRY)).status).toBe(403);          // write denied
  });

  it("ingestion ALWAYS lands private even when corp mode is active (D8)", async () => {
    const owner = await createTestUser(env.DB);
    const orgId = `org-${crypto.randomUUID().slice(0, 8)}`;
    await makeOrg(orgId);
    await addMember(orgId, owner.userId, "owner");
    await setMode(owner.sessionToken, orgId); // active = corp

    const res = await SELF.fetch("http://localhost/api/accountant/ingest", {
      method: "POST",
      headers: { ...(await authHeaders(owner.sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ entries: [{ event_id: "evt-d8-1", occurred_at: "2026-06-03T00:00:00Z", amount: -250, hint: "fuel" }] }),
    });
    expect(res.status).toBe(200);

    // The parsed entry must be private (org_id NULL) despite corp mode.
    const row = await env.DB.prepare(
      "SELECT org_id FROM accountant_entries WHERE user_id = ? AND source_ref = 'evt-d8-1'",
    ).bind(owner.userId).first<{ org_id: string | null }>();
    expect(row).not.toBeNull();
    expect(row?.org_id).toBeNull();
  });
});
