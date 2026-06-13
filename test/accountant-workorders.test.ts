import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders } from "./helpers";
import { catchUp } from "../src/lib/accountant/catchup";
import { privateScope } from "../src/lib/accountant/scope";
import { attachOrder } from "../src/routes/accountant/order-helpers";

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
  // Generated text lives in `description` — the same column convention as every
  // other engine-written row (fines, accruals, fulfilments); `notes` is user prose.
  return env.DB.prepare(
    `SELECT amount, category, source, workorder_id, description FROM accountant_entries
     WHERE workorder_id = ? AND source = 'workorder_summary'`,
  ).bind(woId).all<{ amount: number; category: string | null; workorder_id: number; description: string }>();
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

  it("inline order fund guard sees a CAUGHT-UP balance: pending fine ticks block creation (400, no orphans)", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    await seedBalance(sessionToken, 10000);
    // Backdated standalone sale: 2 daily flat ticks of −2,500 accrued but not
    // yet materialized — only a catch-up before the §5.0 guard surfaces them.
    expect((await post(sessionToken, "/orders", FINED_SALE)).status).toBe(200);

    // True balance 5,000 < the inline PO's 7,000 → whole creation rejected.
    const res = await post(sessionToken, "/workorders", {
      title: "Underwater run", orders: [{ ...PO, quantity: 7 }],
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { balance: number }).balance).toBe(5000);
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM accountant_workorders WHERE user_id = ?",
    ).bind(userId).first<{ n: number }>();
    expect(count?.n).toBe(0);
  });

  it("inline component on an EXISTING workorder also fund-checks the caught-up balance", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    await seedBalance(sessionToken, 10000);
    const woId = await createWO(sessionToken, { title: "Existing WO" });
    expect((await post(sessionToken, "/orders", FINED_SALE)).status).toBe(200);  // −5,000 pending lazily
    const res = await post(sessionToken, `/workorders/${woId}/orders`, { order: { ...PO, quantity: 7 } });
    expect(res.status).toBe(400);            // 5,000 < 7,000 once the fines materialize
  });

  it("TOCTOU: duplicate order_ids in one creation lose at the hardened UPDATE → 400 + full rollback", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const saleId = await createOrder(sessionToken, SALE);
    // Same id twice: the read-only pre-validation passes both, but the second
    // attach UPDATE (workorder_id IS NULL guard) changes 0 rows — exactly what
    // a raced concurrent attach looks like. The whole creation must compensate.
    const res = await post(sessionToken, "/workorders", {
      title: "Raced", orders: [SALE], order_ids: [saleId, saleId],
    });
    expect(res.status).toBe(400);
    const order = await env.DB.prepare(
      "SELECT workorder_id, status FROM accountant_orders WHERE id = ?",
    ).bind(saleId).first<{ workorder_id: number | null; status: string }>();
    expect(order).toEqual({ workorder_id: null, status: "open" });  // detached again, NOT deleted
    const counts = await env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM accountant_workorders WHERE user_id = ?1) AS workorders,
              (SELECT COUNT(*) FROM accountant_orders WHERE user_id = ?1) AS orders`,
    ).bind(userId).first<{ workorders: number; orders: number }>();
    expect(counts).toEqual({ workorders: 0, orders: 1 });           // inline sibling rolled back too
  });

  it("hardened attach UPDATE refuses even with the pre-read bypassed (already-attached / non-open)", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const takenId = await createOrder(sessionToken, SALE);
    const homeWo = await createWO(sessionToken, { title: "Home", order_ids: [takenId] });
    const rivalWo = await createWO(sessionToken, { title: "Rival" });

    // Direct helper call = the friendly pre-validation read never ran (raced path).
    expect(await attachOrder(env.DB, userId, takenId, rivalWo)).toBe(false);
    const row = await env.DB.prepare("SELECT workorder_id FROM accountant_orders WHERE id = ?")
      .bind(takenId).first<{ workorder_id: number | null }>();
    expect(row?.workorder_id).toBe(homeWo);                         // silent re-parent impossible

    // A no-longer-open order is equally unattachable at the UPDATE itself.
    const startedId = await createOrder(sessionToken, SALE);
    expect((await fulfil(sessionToken, startedId, { quantity: 10, occurred_at: "2026-06-12T00:00:00Z" })).status).toBe(200);
    expect(await attachOrder(env.DB, userId, startedId, rivalWo)).toBe(false);
  });

  it("fulfilment on a DRAFT workorder's component → 400; publish → fulfil works (master-doc lifecycle)", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const woId = await createWO(sessionToken, { title: "Still drafting", orders: [SALE, SALE] });
    const [first] = (await components(woId)).results;

    const blocked = await fulfil(sessionToken, first.id, { quantity: 10, occurred_at: "2026-06-12T00:00:00Z" });
    expect(blocked.status).toBe(400);
    expect(((await blocked.json()) as { error: string }).error).toBe(
      "Workorder is draft - publish it before recording work",
    );
    expect((await woRow(woId))?.status).toBe("draft");              // untouched — no partial work on drafts

    expect((await post(sessionToken, `/workorders/${woId}/publish`, {})).status).toBe(200);
    expect((await fulfil(sessionToken, first.id, { quantity: 10, occurred_at: "2026-06-12T00:00:00Z" })).status).toBe(200);
    expect((await woRow(woId))?.status).toBe("in_progress");
  });

  it("CreateWorkorderSchema is strict: vis_corp / vis_public → 400 (private market only)", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    expect((await post(sessionToken, "/workorders", { title: "Vis", vis_public: 1 })).status).toBe(400);
    expect((await post(sessionToken, "/workorders", { title: "Vis", vis_corp: 1 })).status).toBe(400);
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

  it("publish counts only OPEN components: a dead (cancelled) component does not satisfy the ≥2 gate", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const woId = await createWO(sessionToken, { title: "Half dead", orders: [SALE, SALE] });
    const [first] = (await components(woId)).results;
    // Simulate the legacy/corrupt state directly — the API no longer allows
    // cancelling a draft component, but rows written before that gate exist.
    await env.DB.prepare("UPDATE accountant_orders SET status = 'cancelled' WHERE id = ?")
      .bind(first.id).run();

    const thin = await post(sessionToken, `/workorders/${woId}/publish`, {});
    expect(thin.status).toBe(400);
    expect((await woRow(woId))?.status).toBe("draft");

    // A replacement open component restores the gate.
    expect((await post(sessionToken, `/workorders/${woId}/orders`, { order: SALE })).status).toBe(200);
    expect((await post(sessionToken, `/workorders/${woId}/publish`, {})).status).toBe(200);
  });

  it("cancelling a DRAFT workorder's component → 400 (detach is the draft-time tool); publish then proceeds", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const woId = await createWO(sessionToken, { title: "Still drafting", orders: [SALE, SALE] });
    const [first] = (await components(woId)).results;

    const blocked = await post(sessionToken, `/orders/${first.id}/cancel`, {});
    expect(blocked.status).toBe(400);
    expect(((await blocked.json()) as { error: string }).error).toMatch(/draft/i);
    const order = await env.DB.prepare("SELECT status FROM accountant_orders WHERE id = ?")
      .bind(first.id).first<{ status: string }>();
    expect(order?.status).toBe("open");                           // untouched

    // The previously-untested hole: cancel-then-publish can no longer shrink
    // the component count below the gate — both components are still open.
    expect((await post(sessionToken, `/workorders/${woId}/publish`, {})).status).toBe(200);
    // After publish (open WO) the component becomes cancellable again.
    expect((await post(sessionToken, `/orders/${first.id}/cancel`, {})).status).toBe(200);
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
      description: `W-${String(woId).padStart(4, "0")} · 2 orders · net +412,000`,  // −80,000 + 492,000
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
    expect(rows[0].description).toBe(`W-${String(woId).padStart(4, "0")} · 2 orders · net +10,000`);
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
      workorders: Array<{ id: number; status: string; componentCount: number; completedCount: number; netTotal: number }>;
      total: number;
    };
    expect(list.total).toBe(2);
    const row = list.workorders.find((w) => w.id === woId)!;
    expect(row.componentCount).toBe(2);
    expect(row.completedCount).toBe(0);         // PO only partially fulfilled (40/100)
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

    // Closing the PO (remaining 60) flips the list's completedCount — the
    // Workorders page renders this as "1/2" component progress.
    expect((await fulfil(a.sessionToken, poId, { quantity: 60, occurred_at: "2026-06-12T01:00:00Z" })).status).toBe(200);
    const after = (await (await get(a.sessionToken, "/workorders")).json()) as {
      workorders: Array<{ id: number; componentCount: number; completedCount: number }>;
    };
    const afterRow = after.workorders.find((w) => w.id === woId)!;
    expect(afterRow.componentCount).toBe(2);
    expect(afterRow.completedCount).toBe(1);

    // cross-user isolation: list empty, foreign detail 404
    expect(((await (await get(b.sessionToken, "/workorders")).json()) as { total: number }).total).toBe(0);
    expect((await get(b.sessionToken, `/workorders/${woId}`)).status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Task 9 — termination settlement (design §5.4)
// ---------------------------------------------------------------------------

// Route-time catchUp runs at REAL now, so the fined sale's deliver_by must be
// relative: ~2.5 days ago → exactly 2 daily flat ticks of −2,500 (you paid 5,000).
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

function settlements(woId: number) {
  return env.DB.prepare(
    `SELECT amount, category, source, workorder_id, notes, description FROM accountant_entries
     WHERE workorder_id = ? AND source = 'wo_settlement' ORDER BY id`,
  ).bind(woId).all<{
    amount: number; category: string | null; workorder_id: number; notes: string; description: string;
  }>();
}
function fineTicks(userId: string, orderId: number) {
  return env.DB.prepare(
    `SELECT tick_index, amount FROM accountant_entries
     WHERE user_id = ? AND order_id = ? AND source = 'contract_fine' ORDER BY tick_index`,
  ).bind(userId, orderId).all<{ tick_index: number; amount: number }>();
}
function woTermRow(id: number) {
  return env.DB.prepare(
    `SELECT status, terminated_by, termination_note, completed_at
     FROM accountant_workorders WHERE id = ?`,
  ).bind(id).first<{
    status: string; terminated_by: string | null; termination_note: string | null; completed_at: string | null;
  }>();
}

// Golden fixture (plan Task 9): in_progress WO with
//   purchase: qty 80 × 1,000 = 80,000 — fulfilled twice (40 + 40) → −40,000 ×2, reserve net 0, complete
//   sale:     qty 10 × 5,000, deliver_by ~2.5 days ago, FLAT 2,500 daily → 2 ticks of −2,500
// Incurred costs on YOUR books = 80,000 + 5,000 = 85,000.
const FINED_SALE = {
  type: "sale", category: "trading", item: "Laranite", quantity: 10, price_per_unit: 5000,
  start_at: daysAgo(5), deliver_by: daysAgo(2.5), fine_rate_type: "flat", fine_rate: 2500,
};
async function goldenFixture() {
  const { userId, sessionToken: token } = await createTestUser(env.DB);
  await seedBalance(token, 80000);
  const purchase = {
    type: "purchase", category: "production", item: "Ore", quantity: 80, price_per_unit: 1000,
    start_at: daysAgo(5),
  };
  const woId = await createWO(token, { title: "Doomed contract", orders: [purchase, FINED_SALE] });
  expect((await post(token, `/workorders/${woId}/publish`, {})).status).toBe(200);
  const comps = (await components(woId)).results;
  const purchaseId = comps.find((o) => o.type === "purchase")!.id;
  const saleId = comps.find((o) => o.type === "sale")!.id;
  expect((await fulfil(token, purchaseId, { quantity: 40, occurred_at: daysAgo(2) })).status).toBe(200);
  expect((await fulfil(token, purchaseId, { quantity: 40, occurred_at: daysAgo(1) })).status).toBe(200);
  expect((await woRow(woId))?.status).toBe("in_progress");
  return { userId, token, woId, purchaseId, saleId };
}

// Cheap in_progress WO: two plain sales, first one partially fulfilled.
async function plainInProgressWO(token: string, extraSales = 0) {
  const sale = { ...SALE, quantity: 10, price_per_unit: 1000 };
  const woId = await createWO(token, {
    title: "Plain run", orders: Array.from({ length: 2 + extraSales }, () => sale),
  });
  expect((await post(token, `/workorders/${woId}/publish`, {})).status).toBe(200);
  const comps = (await components(woId)).results.map((o) => o.id);
  expect((await fulfil(token, comps[0], { quantity: 4, occurred_at: daysAgo(1) })).status).toBe(200);
  expect((await woRow(woId))?.status).toBe("in_progress");
  return { woId, comps };
}

describe("M5 — termination settlement (full + partial)", () => {
  beforeAll(async () => { await setupTestDatabase(env.DB); });

  it("mandatory note: missing/empty/whitespace note → 400; nothing changes", async () => {
    const { token, woId, saleId } = await goldenFixture();
    for (const body of [
      { terminated_by: "counterparty" },                          // missing
      { note: "", terminated_by: "counterparty" },                // empty
      { note: "   ", terminated_by: "counterparty" },             // whitespace-only
    ]) {
      expect((await post(token, `/workorders/${woId}/terminate`, body)).status).toBe(400);
    }
    expect((await woRow(woId))?.status).toBe("in_progress");      // untouched
    expect((await settlements(woId)).results).toHaveLength(0);
    const sale = (await components(woId)).results.find((o) => o.id === saleId)!;
    expect(sale.status).toBe("open");
  });

  it("terminate only from in_progress (draft/open/complete/cancelled → 400)", async () => {
    const { sessionToken: token } = await createTestUser(env.DB);
    const body = { note: "valid note", terminated_by: "counterparty" };

    const draftId = await createWO(token, { title: "Draft" });
    expect((await post(token, `/workorders/${draftId}/terminate`, body)).status).toBe(400);

    const openId = await createWO(token, { title: "Open", orders: [SALE, SALE] });
    expect((await post(token, `/workorders/${openId}/publish`, {})).status).toBe(200);
    expect((await post(token, `/workorders/${openId}/terminate`, body)).status).toBe(400);

    const cancelledId = await createWO(token, { title: "Cancelled" });
    expect((await post(token, `/workorders/${cancelledId}/cancel`, {})).status).toBe(200);
    expect((await post(token, `/workorders/${cancelledId}/terminate`, body)).status).toBe(400);

    const small = { ...SALE, quantity: 5 };
    const completeId = await createWO(token, { title: "Complete", orders: [small, small] });
    expect((await post(token, `/workorders/${completeId}/publish`, {})).status).toBe(200);
    for (const o of (await components(completeId)).results) {
      expect((await fulfil(token, o.id, { quantity: 5, occurred_at: daysAgo(1) })).status).toBe(200);
    }
    expect((await woRow(completeId))?.status).toBe("complete");
    expect((await post(token, `/workorders/${completeId}/terminate`, body)).status).toBe(400);
  });

  it("FULL termination by counterparty: suggestion 85,000; +85,000 wo_settlement; WO 'terminated' with stamped note + terminated_by", async () => {
    const { token, woId, saleId } = await goldenFixture();

    // The detail preview already carries the suggestion (Task 8).
    const detail = (await (await get(token, `/workorders/${woId}`)).json()) as {
      settlementPreview: { suggestion: number };
    };
    expect(detail.settlementPreview.suggestion).toBe(85000);

    const res = await post(token, `/workorders/${woId}/terminate`, {
      note: "they pulled out", terminated_by: "counterparty",     // settlement_amount omitted → suggestion
    });
    expect(res.status).toBe(200);
    const out = (await res.json()) as {
      ok: boolean; settlement: number; suggestion: number; scope: number[]; workorderStatus: string;
    };
    expect(out).toMatchObject({ ok: true, settlement: 85000, suggestion: 85000, workorderStatus: "terminated" });

    const rows = (await settlements(woId)).results;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      amount: 85000, category: "financial", source: "wo_settlement",
      workorder_id: woId, notes: "they pulled out",
      description: "Termination settlement · counterparty",
    });
    const sale = (await components(woId)).results.find((o) => o.id === saleId)!;
    expect(sale.status).toBe("cancelled");                        // open → cancelled
    expect(await woTermRow(woId)).toMatchObject({
      status: "terminated", terminated_by: "counterparty", termination_note: "they pulled out",
    });
  });

  it("FULL termination by you: settlement_amount REQUIRED (400 without); −30,000 entry when given", async () => {
    const { token, woId } = await goldenFixture();

    const missing = await post(token, `/workorders/${woId}/terminate`, {
      note: "I bailed", terminated_by: "you",
    });
    expect(missing.status).toBe(400);
    expect(((await missing.json()) as { error: string }).error).toMatch(/settlement_amount/);
    expect((await woRow(woId))?.status).toBe("in_progress");      // nothing changed

    const res = await post(token, `/workorders/${woId}/terminate`, {
      note: "I bailed", terminated_by: "you", settlement_amount: 30000,
    });
    expect(res.status).toBe(200);
    const out = (await res.json()) as { settlement: number; suggestion: number | null; workorderStatus: string };
    expect(out.settlement).toBe(30000);
    expect(out.suggestion).toBeNull();                            // counterparty costs aren't on your books
    expect(out.workorderStatus).toBe("terminated");
    const rows = (await settlements(woId)).results;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amount: -30000, notes: "I bailed" });  // you compensate → −
    expect(await woTermRow(woId)).toMatchObject({ status: "terminated", terminated_by: "you" });
  });

  it("settlement override wins for counterparty too; 0 is legal and still posts the noted entry", async () => {
    const { token, woId } = await goldenFixture();
    const res = await post(token, `/workorders/${woId}/terminate`, {
      note: "settled amicably", terminated_by: "counterparty", settlement_amount: 0,
    });
    expect(res.status).toBe(200);
    const out = (await res.json()) as { settlement: number; suggestion: number };
    expect(out.settlement).toBe(0);                               // the override wins...
    expect(out.suggestion).toBe(85000);                           // ...over the still-reported suggestion
    const rows = (await settlements(woId)).results;
    expect(rows).toHaveLength(1);                                 // 0-amount entry still posts the note
    expect(rows[0]).toMatchObject({ amount: 0, notes: "settled amicably" });
  });

  it("PARTIAL termination closes ONLY the selected components; WO stays in_progress; suggestion scoped to the subset", async () => {
    // 3 components: the purchase (complete), the fined sale (open), a second sale (open).
    const { userId, sessionToken: token } = await createTestUser(env.DB);
    await seedBalance(token, 80000);
    const purchase = {
      type: "purchase", category: "production", item: "Ore", quantity: 80, price_per_unit: 1000,
      start_at: daysAgo(5),
    };
    const woId = await createWO(token, { title: "Three legs", orders: [purchase, FINED_SALE, SALE] });
    expect((await post(token, `/workorders/${woId}/publish`, {})).status).toBe(200);
    const comps = (await components(woId)).results;
    const purchaseId = comps.find((o) => o.type === "purchase")!.id;
    const [finedSaleId, secondSaleId] = comps.filter((o) => o.type === "sale").map((o) => o.id);
    expect((await fulfil(token, purchaseId, { quantity: 80, occurred_at: daysAgo(2) })).status).toBe(200);
    expect((await woRow(woId))?.status).toBe("in_progress");

    const res = await post(token, `/workorders/${woId}/terminate`, {
      order_ids: [finedSaleId], terminated_by: "counterparty", note: "dropped this leg",
    });
    expect(res.status).toBe(200);
    const out = (await res.json()) as {
      settlement: number; suggestion: number; scope: number[]; workorderStatus: string;
    };
    // Scope suggestion = the fined sale's paid fines only (5,000) — NOT the purchase's 80,000.
    expect(out).toMatchObject({
      settlement: 5000, suggestion: 5000, scope: [finedSaleId], workorderStatus: "in_progress",
    });
    const rows = (await settlements(woId)).results;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amount: 5000, notes: "dropped this leg" });

    const after = (await components(woId)).results;
    expect(after.find((o) => o.id === finedSaleId)?.status).toBe("cancelled");
    expect(after.find((o) => o.id === secondSaleId)?.status).toBe("open");     // untouched
    expect((await woTermRow(woId))).toMatchObject({ status: "in_progress", terminated_by: null });
    expect((await fineTicks(userId, finedSaleId)).results).toHaveLength(2);    // accrued fines survive

    // Test variant: partially-fulfilled targets close as 'complete' (§5.4) —
    // separate WO so the main one's in_progress assertion stays clean.
    const { woId: vWoId, comps: vComps } = await plainInProgressWO(token, 1);  // 3 sales, first partially fulfilled
    const vRes = await post(token, `/workorders/${vWoId}/terminate`, {
      order_ids: [vComps[0]], terminated_by: "you", settlement_amount: 1000, note: "half done is done",
    });
    expect(vRes.status).toBe(200);
    const vAfter = (await components(vWoId)).results;
    expect(vAfter.find((o) => o.id === vComps[0])?.status).toBe("complete");   // complete-as-is, NOT cancelled
    expect((await woRow(vWoId))?.status).toBe("in_progress");                  // two sales still open
  });

  it("multiple partial terminations each post their OWN noted wo_settlement (audit trail = the entry sequence)", async () => {
    const { sessionToken: token } = await createTestUser(env.DB);
    const { woId, comps } = await plainInProgressWO(token, 2);    // 4 sales: comps[0] in_progress, rest open
    const first = await post(token, `/workorders/${woId}/terminate`, {
      order_ids: [comps[1]], terminated_by: "you", settlement_amount: 1000, note: "first leg dropped",
    });
    expect(first.status).toBe(200);
    const second = await post(token, `/workorders/${woId}/terminate`, {
      order_ids: [comps[2]], terminated_by: "you", settlement_amount: 2000, note: "second leg dropped",
    });
    expect(second.status).toBe(200);

    const rows = (await settlements(woId)).results;
    expect(rows).toHaveLength(2);                                 // one entry PER event, in sequence
    expect(rows.map((r) => [r.amount, r.notes])).toEqual([
      [-1000, "first leg dropped"],
      [-2000, "second leg dropped"],
    ]);
    expect((await woRow(woId))?.status).toBe("in_progress");      // comps[0] and comps[3] still running
  });

  it("partial termination of the LAST open component completes the WO normally — summary entry, NOT 'terminated'", async () => {
    const { sessionToken: token } = await createTestUser(env.DB);
    const { woId, comps } = await plainInProgressWO(token);       // 2 sales
    // Close the first component normally; the second stays the last open one.
    expect((await fulfil(token, comps[0], { quantity: 6, occurred_at: daysAgo(0.5) })).status).toBe(200);
    expect((await woRow(woId))?.status).toBe("in_progress");

    const res = await post(token, `/workorders/${woId}/terminate`, {
      order_ids: [comps[1]], terminated_by: "counterparty", note: "last leg forgiven",
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { workorderStatus: string }).workorderStatus).toBe("complete");

    const wo = await woTermRow(woId);
    expect(wo?.status).toBe("complete");                          // 'terminated' is reserved for FULL termination
    expect(wo?.terminated_by).toBeNull();
    expect(wo?.completed_at).toBeTruthy();
    expect((await summaries(woId)).results).toHaveLength(1);      // the normal completion summary posted
    expect((await settlements(woId)).results).toHaveLength(1);    // alongside the event's settlement entry
  });

  it("order_ids validation: not in this WO / already closed / unknown → 400", async () => {
    const { sessionToken: token } = await createTestUser(env.DB);
    const { woId, comps } = await plainInProgressWO(token);
    const standaloneId = await createOrder(token, SALE);          // mine, but NOT in this WO
    const body = { terminated_by: "counterparty", note: "scope check" };

    expect((await post(token, `/workorders/${woId}/terminate`, { ...body, order_ids: [standaloneId] })).status).toBe(400);
    expect((await post(token, `/workorders/${woId}/terminate`, { ...body, order_ids: [999999] })).status).toBe(400);

    // Close comps[0], then target it → already closed → 400.
    expect((await fulfil(token, comps[0], { quantity: 6, occurred_at: daysAgo(0.5) })).status).toBe(200);
    expect((await post(token, `/workorders/${woId}/terminate`, { ...body, order_ids: [comps[0]] })).status).toBe(400);

    expect((await settlements(woId)).results).toHaveLength(0);    // nothing posted
    expect((await woRow(woId))?.status).toBe("in_progress");
  });

  it("terminated components stop accruing fines (eligibility excludes closed statuses)", async () => {
    const { userId, sessionToken: token } = await createTestUser(env.DB);
    const woId = await createWO(token, { title: "Fined run", orders: [FINED_SALE, SALE] });
    expect((await post(token, `/workorders/${woId}/publish`, {})).status).toBe(200);
    const comps = (await components(woId)).results;
    const finedId = comps[0].id;
    expect((await fulfil(token, comps[1].id, { quantity: 20, occurred_at: daysAgo(1) })).status).toBe(200);

    const res = await post(token, `/workorders/${woId}/terminate`, {
      order_ids: [finedId], terminated_by: "counterparty", note: "stop the bleeding",
    });
    expect(res.status).toBe(200);
    expect((await fineTicks(userId, finedId)).results).toHaveLength(2);  // accrued while open

    // Ten days later the closed component must NOT tick (injectable-clock idiom).
    await catchUp(env.DB, privateScope(userId), Date.now() + 10 * 86_400_000);
    expect((await fineTicks(userId, finedId)).results).toHaveLength(2);
  });
});
