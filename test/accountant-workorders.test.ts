import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders } from "./helpers";

async function post(token: string, path: string, body: Record<string, unknown>) {
  return SELF.fetch(`http://localhost/api/accountant${path}`, {
    method: "POST",
    headers: { ...(await authHeaders(token)), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const get = async (t: string, path: string) =>
  SELF.fetch(`http://localhost/api/accountant${path}`, { headers: await authHeaders(t) });
// "Content-Length": "0" required by the global M-01 mutation middleware (ledger-test idiom).
const del = async (t: string, path: string) =>
  SELF.fetch(`http://localhost/api/accountant${path}`, {
    method: "DELETE", headers: { ...(await authHeaders(t)), "Content-Length": "0" },
  });

// Seed cash via a balance adjustment (M1 endpoint) so the fund check has something to bite.
async function seedBalance(token: string, amount: number) {
  const res = await post(token, "/ledger", { amount, occurred_at: "2026-06-01T00:00:00Z", adjustment: true });
  expect(res.status).toBe(200);
}

const PO = {
  type: "purchase", category: "production", item: "Laranite (raw)",
  quantity: 100, price_per_unit: 1000,                    // total 100,000
  counterparty: "@vendor", start_at: "2026-06-10T00:00:00Z",
};
const SALE = {
  type: "sale", category: "trading", tag: "minerals", item: "Laranite",
  quantity: 200, price_per_unit: 3200,                    // total 640,000
  start_at: "2026-06-10T00:00:00Z",
};

async function createOrder(token: string, body: Record<string, unknown>): Promise<number> {
  const res = await post(token, "/orders", body);
  expect(res.status).toBe(200);
  return ((await res.json()) as { id: number }).id;
}
async function createWO(token: string, body: Record<string, unknown>): Promise<number> {
  const res = await post(token, "/workorders", body);
  expect(res.status).toBe(200);
  return ((await res.json()) as { id: number }).id;
}
async function fulfil(token: string, orderId: number, body: Record<string, unknown>) {
  return post(token, `/orders/${orderId}/fulfillments`, body);
}
function woRow(id: number) {
  return env.DB.prepare(
    "SELECT status, completed_at FROM accountant_workorders WHERE id = ?",
  ).bind(id).first<{ status: string; completed_at: string | null }>();
}
function components(woId: number) {
  return env.DB.prepare(
    "SELECT id, type, status, workorder_id FROM accountant_orders WHERE workorder_id = ? ORDER BY id",
  ).bind(woId).all<{ id: number; type: string; status: string; workorder_id: number }>();
}
function summaries(woId: number) {
  return env.DB.prepare(
    `SELECT amount, category, source, workorder_id, notes FROM accountant_entries
     WHERE workorder_id = ? AND source = 'workorder_summary'`,
  ).bind(woId).all<{ amount: number; category: string | null; workorder_id: number; notes: string }>();
}

describe("M5 — workorder lifecycle", () => {
  beforeAll(async () => { await setupTestDatabase(env.DB); });

  it("POST /workorders creates a draft with inline orders AND attached existing standalone orders", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    await seedBalance(sessionToken, 100000);              // inline PURCHASE goes through the fund check
    const saleId = await createOrder(sessionToken, SALE); // existing standalone open order
    const woId = await createWO(sessionToken, {
      title: "Laranite hauling run", orders: [PO], order_ids: [saleId],
    });
    expect((await woRow(woId))?.status).toBe("draft");
    const comps = (await components(woId)).results;
    expect(comps).toHaveLength(2);
    expect(comps.find((o) => o.type === "sale")?.id).toBe(saleId);   // attach kept the existing row
    const inlineId = comps.find((o) => o.type === "purchase")!.id;
    const reserve = await env.DB.prepare(
      "SELECT amount, source FROM accountant_entries WHERE order_id = ?",
    ).bind(inlineId).first<{ amount: number; source: string }>();
    expect(reserve).toMatchObject({ source: "po_reserve", amount: -100000 });
  });

  it("inline purchase order under-funds → whole creation rejected 400 with the fund echo, no orphan rows", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    await seedBalance(sessionToken, 50000);
    // First inline PO succeeds (40,000), second needs 100,000 with only 10,000 left —
    // the WHOLE creation must compensate: WO row + first inline order + its reserve all gone.
    const res = await post(sessionToken, "/workorders", {
      title: "Doomed run", orders: [{ ...PO, quantity: 40 }, PO],
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; balance: number; lockedInPOs: number; required: number };
    expect(body.balance).toBe(10000);        // decision-time echo: first sibling's reserve already counted
    expect(body.lockedInPOs).toBe(40000);
    expect(body.required).toBe(100000);
    const counts = await env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM accountant_workorders WHERE user_id = ?1) AS workorders,
              (SELECT COUNT(*) FROM accountant_orders WHERE user_id = ?1) AS orders,
              (SELECT COUNT(*) FROM accountant_entries WHERE user_id = ?1 AND source = 'po_reserve') AS reserves`,
    ).bind(userId).first<{ workorders: number; orders: number; reserves: number }>();
    expect(counts).toEqual({ workorders: 0, orders: 0, reserves: 0 });
  });

  it("attach validates: order must be open, mine, and not already in another workorder (one WO per order)", async () => {
    const a = await createTestUser(env.DB);
    const b = await createTestUser(env.DB);
    const woId = await createWO(a.sessionToken, { title: "Target WO" });

    // in_progress order → 400
    const started = await createOrder(a.sessionToken, SALE);
    expect((await fulfil(a.sessionToken, started, { quantity: 10, occurred_at: "2026-06-12T00:00:00Z" })).status).toBe(200);
    expect((await post(a.sessionToken, `/workorders/${woId}/orders`, { order_id: started })).status).toBe(400);

    // another WO's order → 400 (one workorder per order)
    const taken = await createOrder(a.sessionToken, SALE);
    await createWO(a.sessionToken, { title: "Other WO", order_ids: [taken] });
    expect((await post(a.sessionToken, `/workorders/${woId}/orders`, { order_id: taken })).status).toBe(400);

    // cross-user → 404
    const foreign = await createOrder(b.sessionToken, SALE);
    expect((await post(a.sessionToken, `/workorders/${woId}/orders`, { order_id: foreign })).status).toBe(404);
  });

  it("DELETE /workorders/:id/orders/:orderId detaches on draft only; order survives standalone", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const s1 = await createOrder(sessionToken, SALE);
    const draftId = await createWO(sessionToken, { title: "Draft WO", order_ids: [s1] });
    expect((await del(sessionToken, `/workorders/${draftId}/orders/${s1}`)).status).toBe(200);
    const order = await env.DB.prepare(
      "SELECT workorder_id, status FROM accountant_orders WHERE id = ?",
    ).bind(s1).first<{ workorder_id: number | null; status: string }>();
    expect(order).toEqual({ workorder_id: null, status: "open" });

    // detach on a published (open) WO → 400
    const s2 = await createOrder(sessionToken, SALE);
    const s3 = await createOrder(sessionToken, SALE);
    const openId = await createWO(sessionToken, { title: "Published WO", order_ids: [s2, s3] });
    expect((await post(sessionToken, `/workorders/${openId}/publish`, {})).status).toBe(200);
    expect((await del(sessionToken, `/workorders/${openId}/orders/${s2}`)).status).toBe(400);
  });

  it("publish requires ≥ 2 component orders (master doc) and draft status", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const s1 = await createOrder(sessionToken, SALE);
    const woId = await createWO(sessionToken, { title: "Thin WO", order_ids: [s1] });
    const thin = await post(sessionToken, `/workorders/${woId}/publish`, {});
    expect(thin.status).toBe(400);
    expect(((await thin.json()) as { error: string }).error).toBeTruthy();

    // second component via inline create on POST /:id/orders, then publish succeeds
    expect((await post(sessionToken, `/workorders/${woId}/orders`, { order: SALE })).status).toBe(200);
    expect((await post(sessionToken, `/workorders/${woId}/publish`, {})).status).toBe(200);
    expect((await woRow(woId))?.status).toBe("open");

    // publish again → 400 (not a draft anymore)
    expect((await post(sessionToken, `/workorders/${woId}/publish`, {})).status).toBe(400);
  });

  it("first component fulfilment flips the WO open → in_progress (inside the fulfilment batch)", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const woId = await createWO(sessionToken, { title: "Two sales", orders: [SALE, SALE] });
    expect((await post(sessionToken, `/workorders/${woId}/publish`, {})).status).toBe(200);
    const [first] = (await components(woId)).results;
    expect((await fulfil(sessionToken, first.id, { quantity: 50, occurred_at: "2026-06-12T00:00:00Z" })).status).toBe(200);
    expect((await woRow(woId))?.status).toBe("in_progress");
  });

  it("completing the LAST component posts exactly ONE 0-amount workorder_summary and stamps completed_at", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    await seedBalance(sessionToken, 80000);
    const purchase = { type: "purchase", category: "trading", item: "Fuel", quantity: 80, price_per_unit: 1000, start_at: "2026-06-10T00:00:00Z" };  // 80,000
    const sale = { type: "sale", category: "trading", item: "Laranite", quantity: 120, price_per_unit: 4100, start_at: "2026-06-10T00:00:00Z" };     // 492,000
    const woId = await createWO(sessionToken, { title: "Golden run", orders: [purchase, sale] });
    expect((await post(sessionToken, `/workorders/${woId}/publish`, {})).status).toBe(200);
    const comps = (await components(woId)).results;
    const purchaseId = comps.find((o) => o.type === "purchase")!.id;
    const saleId = comps.find((o) => o.type === "sale")!.id;

    // First component closes — no summary yet, WO merely in_progress.
    expect((await fulfil(sessionToken, purchaseId, { quantity: 80, occurred_at: "2026-06-12T00:00:00Z" })).status).toBe(200);
    expect((await summaries(woId)).results).toHaveLength(0);
    expect((await woRow(woId))?.status).toBe("in_progress");

    // Last component closes — ONE 0-amount summary, complete + completed_at.
    expect((await fulfil(sessionToken, saleId, { quantity: 120, occurred_at: "2026-06-12T01:00:00Z" })).status).toBe(200);
    const rows = (await summaries(woId)).results;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      amount: 0,                               // a valued summary would double-count (M3 trap)
      category: null,
      workorder_id: woId,
      notes: `W-${String(woId).padStart(4, "0")} · 2 orders · net +412,000`,  // −80,000 + 492,000
    });
    const wo = await woRow(woId);
    expect(wo?.status).toBe("complete");
    expect(wo?.completed_at).toBeTruthy();

    // A re-read posts NO second summary (idempotent — status guard).
    expect((await get(sessionToken, `/workorders/${woId}`)).status).toBe(200);
    expect((await summaries(woId)).results).toHaveLength(1);
  });

  it("cancelling the last open component ALSO completes the workorder (finding 18)", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const saleA = { type: "sale", category: "trading", item: "Quantanium", quantity: 10, price_per_unit: 1000, start_at: "2026-06-10T00:00:00Z" };
    const woId = await createWO(sessionToken, { title: "Half-done run", orders: [saleA, SALE] });
    expect((await post(sessionToken, `/workorders/${woId}/publish`, {})).status).toBe(200);
    const comps = (await components(woId)).results;     // ordered by id: [saleA, SALE]
    const doneId = comps[0].id;
    const droppedId = comps[1].id;

    expect((await fulfil(sessionToken, doneId, { quantity: 10, occurred_at: "2026-06-12T00:00:00Z" })).status).toBe(200);
    expect((await woRow(woId))?.status).toBe("in_progress");

    // Cancel the last open component via the ORDER route — must advance the parent too.
    expect((await post(sessionToken, `/orders/${droppedId}/cancel`, {})).status).toBe(200);
    const wo = await woRow(woId);
    expect(wo?.status).toBe("complete");
    expect(wo?.completed_at).toBeTruthy();
    const rows = (await summaries(woId)).results;
    expect(rows).toHaveLength(1);
    expect(rows[0].notes).toBe(`W-${String(woId).padStart(4, "0")} · 2 orders · net +10,000`);
  });

  it("workorder cancel: draft/open only; cancels open components and releases their reserves", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    await seedBalance(sessionToken, 200000);
    const woId = await createWO(sessionToken, { title: "Cold feet", orders: [PO, SALE] });
    expect((await post(sessionToken, `/workorders/${woId}/publish`, {})).status).toBe(200);

    expect((await post(sessionToken, `/workorders/${woId}/cancel`, {})).status).toBe(200);
    expect((await woRow(woId))?.status).toBe("cancelled");
    const comps = (await components(woId)).results;
    expect(comps.map((o) => o.status)).toEqual(["cancelled", "cancelled"]);
    const poId = comps.find((o) => o.type === "purchase")!.id;
    const net = await env.DB.prepare(
      `SELECT COALESCE(SUM(amount), 0) AS net FROM accountant_entries
       WHERE order_id = ? AND source IN ('po_reserve', 'po_reserve_release')`,
    ).bind(poId).first<{ net: number }>();
    expect(net?.net).toBe(0);                  // unfulfilled PO reserve fully released

    // in_progress WO → 400 (terminate instead, Task 9)
    const busyId = await createWO(sessionToken, { title: "Busy", orders: [SALE, SALE] });
    expect((await post(sessionToken, `/workorders/${busyId}/publish`, {})).status).toBe(200);
    const [firstComp] = (await components(busyId)).results;
    expect((await fulfil(sessionToken, firstComp.id, { quantity: 5, occurred_at: "2026-06-12T00:00:00Z" })).status).toBe(200);
    const blocked = await post(sessionToken, `/workorders/${busyId}/cancel`, {});
    expect(blocked.status).toBe(400);
    expect(((await blocked.json()) as { error: string }).error).toMatch(/terminate/i);
  });

  it("GET /workorders lists with component counts + net contract total; GET /workorders/:id returns components w/ progress + incurred + settlement preview", async () => {
    const a = await createTestUser(env.DB);
    const b = await createTestUser(env.DB);
    await seedBalance(a.sessionToken, 500000);
    const woId = await createWO(a.sessionToken, { title: "Big haul", orders: [PO, SALE] });
    expect((await post(a.sessionToken, `/workorders/${woId}/publish`, {})).status).toBe(200);
    const poId = (await components(woId)).results.find((o) => o.type === "purchase")!.id;
    expect((await fulfil(a.sessionToken, poId, { quantity: 40, occurred_at: "2026-06-12T00:00:00Z" })).status).toBe(200);
    await createWO(a.sessionToken, { title: "Empty draft" });

    const list = (await (await get(a.sessionToken, "/workorders")).json()) as {
      workorders: Array<{ id: number; status: string; componentCount: number; netTotal: number }>;
      total: number;
    };
    expect(list.total).toBe(2);
    const row = list.workorders.find((w) => w.id === woId)!;
    expect(row.componentCount).toBe(2);
    expect(row.netTotal).toBe(540000);          // sale 640,000 − purchase 100,000
    expect(row.status).toBe("in_progress");
    const drafts = (await (await get(a.sessionToken, "/workorders?status=draft")).json()) as { total: number };
    expect(drafts.total).toBe(1);

    const detail = (await (await get(a.sessionToken, `/workorders/${woId}`)).json()) as {
      workorder: { modified_fields: string[] };
      components: Array<{ type: string; fulfilledQty: number; remaining: number; incurred: number }>;
      summaryPreview: { netFulfilled: number };
      settlementPreview: { suggestion: number };
    };
    expect(detail.workorder.modified_fields).toEqual([]);
    const purchase = detail.components.find((o) => o.type === "purchase")!;
    expect(purchase).toMatchObject({ fulfilledQty: 40, remaining: 60, incurred: 40000 });
    const sale = detail.components.find((o) => o.type === "sale")!;
    expect(sale).toMatchObject({ fulfilledQty: 0, remaining: 200, incurred: 0 });
    expect(detail.summaryPreview).toEqual({ netFulfilled: -40000 });   // only the purchase fulfilment posted
    expect(detail.settlementPreview).toEqual({ suggestion: 40000 });   // full-scope incurred sum

    // cross-user isolation: list empty, foreign detail 404
    expect(((await (await get(b.sessionToken, "/workorders")).json()) as { total: number }).total).toBe(0);
    expect((await get(b.sessionToken, `/workorders/${woId}`)).status).toBe(404);
  });
});
