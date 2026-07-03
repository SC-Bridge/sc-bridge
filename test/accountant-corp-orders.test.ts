import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders } from "./helpers";

// ── fixtures (mirror accountant-corp-ledger/loans) ─────────────────────────────
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
async function createOrder(token: string, body: Record<string, unknown>) {
  return SELF.fetch("http://localhost/api/accountant/orders", {
    method: "POST",
    headers: { ...(await authHeaders(token)), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function createWorkorder(token: string, body: Record<string, unknown>) {
  return SELF.fetch("http://localhost/api/accountant/workorders", {
    method: "POST",
    headers: { ...(await authHeaders(token)), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function listOrders(token: string) {
  return (await (await SELF.fetch("http://localhost/api/accountant/orders", {
    headers: await authHeaders(token),
  })).json()) as { orders: Array<{ id: number; item: string }>; balance: number; lockedInPOs: number };
}

const INCOME = (amount: number) => ({
  amount, category: "trading", occurred_at: "2026-06-02T00:00:00Z", description: "seed income",
});
const PURCHASE = (item: string, total: number) => ({
  type: "purchase", category: "trading", item, quantity: 1, price_per_unit: total,
  start_at: "2026-06-02T00:00:00Z",
});
const SALE = (item: string) => ({
  type: "sale", category: "trading", item, quantity: 1, price_per_unit: 1000,
  start_at: "2026-06-02T00:00:00Z",
});

describe("Corp orders — PO fund guard reads corp balance, scope isolation, manager gating", () => {
  beforeAll(async () => { await setupTestDatabase(env.DB); });

  it("the PO fund guard reads the CORP balance, not the acting member's private balance", async () => {
    const owner = await createTestUser(env.DB);
    const orgId = `org-${crypto.randomUUID().slice(0, 8)}`;
    await makeOrg(orgId);
    await addMember(orgId, owner.userId, "owner");

    // Ample PRIVATE balance — must NOT be reachable by a corp PO.
    await setMode(owner.sessionToken, null);
    await addEntry(owner.sessionToken, INCOME(1_000_000));

    // Corp balance is 0 → a corp purchase must be blocked even though private is ample.
    await setMode(owner.sessionToken, orgId);
    const blocked = await createOrder(owner.sessionToken, PURCHASE("blocked", 500_000));
    expect(blocked.status).toBe(400);
    expect(((await blocked.json()) as { error: string }).error).toBe("Insufficient funds");

    // Fund the CORP wallet, then the same PO succeeds and carries org_id.
    await addEntry(owner.sessionToken, INCOME(1_000_000));
    const ok = await createOrder(owner.sessionToken, PURCHASE("funded", 500_000));
    expect(ok.status).toBe(200);
    const { id } = (await ok.json()) as { id: number };
    const row = await env.DB.prepare("SELECT org_id FROM accountant_orders WHERE id = ?")
      .bind(id).first<{ org_id: string | null }>();
    expect(row?.org_id).toBe(orgId);

    // The corp PO reserve entry is org-scoped too (locks corp funds, not private).
    const reserve = await env.DB.prepare(
      "SELECT org_id, amount FROM accountant_entries WHERE order_id = ? AND source = 'po_reserve'",
    ).bind(id).first<{ org_id: string | null; amount: number }>();
    expect(reserve?.org_id).toBe(orgId);
    expect(reserve?.amount).toBe(-500_000);
  });

  it("a private PO ignores corp funds (corp income cannot fund it; corp expense cannot block it)", async () => {
    const owner = await createTestUser(env.DB);
    const orgId = `org-${crypto.randomUUID().slice(0, 8)}`;
    await makeOrg(orgId);
    await addMember(orgId, owner.userId, "owner");

    // Corp wallet is flush; private is empty.
    await setMode(owner.sessionToken, orgId);
    await addEntry(owner.sessionToken, INCOME(1_000_000));

    await setMode(owner.sessionToken, null);
    const blocked = await createOrder(owner.sessionToken, PURCHASE("priv-blocked", 500_000));
    expect(blocked.status).toBe(400); // corp income cannot fund a private PO

    // Fund private → succeeds regardless of any corp state, and lands private.
    await addEntry(owner.sessionToken, INCOME(600_000));
    const ok = await createOrder(owner.sessionToken, PURCHASE("priv-funded", 500_000));
    expect(ok.status).toBe(200);
    const { id } = (await ok.json()) as { id: number };
    const row = await env.DB.prepare("SELECT org_id FROM accountant_orders WHERE id = ?")
      .bind(id).first<{ org_id: string | null }>();
    expect(row?.org_id).toBeNull();
  });

  it("corp orders are org-wide and isolated from private orders", async () => {
    const owner = await createTestUser(env.DB);
    const orgId = `org-${crypto.randomUUID().slice(0, 8)}`;
    await makeOrg(orgId);
    await addMember(orgId, owner.userId, "owner");

    await setMode(owner.sessionToken, null);
    await createOrder(owner.sessionToken, SALE("private-sale"));

    await setMode(owner.sessionToken, orgId);
    await createOrder(owner.sessionToken, SALE("corp-sale"));

    const corp = await listOrders(owner.sessionToken);
    expect(corp.orders.some((o) => o.item === "corp-sale")).toBe(true);
    expect(corp.orders.some((o) => o.item === "private-sale")).toBe(false);

    await setMode(owner.sessionToken, null);
    const priv = await listOrders(owner.sessionToken);
    expect(priv.orders.some((o) => o.item === "private-sale")).toBe(true);
    expect(priv.orders.some((o) => o.item === "corp-sale")).toBe(false);
  });

  it("corp order/workorder writes are manager-gated; a plain member is 403", async () => {
    const owner = await createTestUser(env.DB);
    const member = await createTestUser(env.DB);
    const orgId = `org-${crypto.randomUUID().slice(0, 8)}`;
    await makeOrg(orgId);
    await addMember(orgId, owner.userId, "owner");
    await addMember(orgId, member.userId, "member");

    await setMode(member.sessionToken, orgId);
    expect((await createOrder(member.sessionToken, SALE("nope"))).status).toBe(403);
    expect((await createWorkorder(member.sessionToken, {
      title: "member wo", orders: [SALE("a"), SALE("b")],
    })).status).toBe(403);

    // Owner (a manager) can write; the order carries org_id.
    await setMode(owner.sessionToken, orgId);
    const ok = await createOrder(owner.sessionToken, SALE("owner-sale"));
    expect(ok.status).toBe(200);
    const { id } = (await ok.json()) as { id: number };
    const row = await env.DB.prepare("SELECT org_id FROM accountant_orders WHERE id = ?")
      .bind(id).first<{ org_id: string | null }>();
    expect(row?.org_id).toBe(orgId);
  });

  it("a corp order fulfilled by a second manager posts an org-scoped fulfilment (org-wide attribution)", async () => {
    const owner = await createTestUser(env.DB);
    const admin = await createTestUser(env.DB);
    const orgId = `org-${crypto.randomUUID().slice(0, 8)}`;
    await makeOrg(orgId);
    await addMember(orgId, owner.userId, "owner");
    await addMember(orgId, admin.userId, "admin");

    // Owner creates a corp sale order.
    await setMode(owner.sessionToken, orgId);
    const created = await createOrder(owner.sessionToken, SALE("crew-haul"));
    const { id } = (await created.json()) as { id: number };

    // A DIFFERENT manager (admin) fulfils it — the fulfilment must still count.
    await setMode(admin.sessionToken, orgId);
    const fulfil = await SELF.fetch(`http://localhost/api/accountant/orders/${id}/fulfillments`, {
      method: "POST",
      headers: { ...(await authHeaders(admin.sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: 1, occurred_at: "2026-06-03T00:00:00Z", amount: 1000 }),
    });
    expect(fulfil.status).toBe(200);

    // The order closes (org-wide fulfilment visible) and the entry is org-scoped.
    const orderRow = await env.DB.prepare("SELECT status FROM accountant_orders WHERE id = ?")
      .bind(id).first<{ status: string }>();
    expect(orderRow?.status).toBe("complete");
    const entry = await env.DB.prepare(
      "SELECT org_id, user_id FROM accountant_entries WHERE order_id = ? AND source = 'order_fulfillment'",
    ).bind(id).first<{ org_id: string | null; user_id: string }>();
    expect(entry?.org_id).toBe(orgId);
    expect(entry?.user_id).toBe(admin.userId); // acting member is stamped for attribution
  });
});
