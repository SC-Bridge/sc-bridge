import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders } from "./helpers";
import { fulfillmentStatements } from "../src/routes/accountant/order-helpers";

async function post(token: string, path: string, body: Record<string, unknown>) {
  return SELF.fetch(`http://localhost/api/accountant${path}`, {
    method: "POST",
    headers: { ...(await authHeaders(token)), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const get = async (t: string, path: string) =>
  SELF.fetch(`http://localhost/api/accountant${path}`, { headers: await authHeaders(t) });

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

describe("Accountant M5 — order creation + list", () => {
  beforeAll(async () => { await setupTestDatabase(env.DB); });

  it("PO at exactly balance succeeds and books the reserve (guard is >=)", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    await seedBalance(sessionToken, 100000);
    const res = await post(sessionToken, "/orders", PO);
    expect(res.status).toBe(200);
    const { ok, id } = (await res.json()) as { ok: boolean; id: number };
    expect(ok).toBe(true);
    const reserve = await env.DB.prepare(
      "SELECT amount, category, source FROM accountant_entries WHERE order_id = ?",
    ).bind(id).first<{ amount: number; category: string | null; source: string }>();
    expect(reserve?.source).toBe("po_reserve");
    expect(reserve?.amount).toBe(-100000);   // server-computed total = round(100 × 1000)
    expect(reserve?.category).toBeNull();    // reserves are uncategorized earmarks
  });

  it("PO over balance → 400 echoing { balance, lockedInPOs, required }; guarded INSERT wrote ZERO rows", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    await seedBalance(sessionToken, 100000);
    await post(sessionToken, "/orders", PO);              // locks all 100,000
    const res = await post(sessionToken, "/orders", { ...PO, quantity: 1 }); // needs 1,000 more
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; balance: number; lockedInPOs: number; required: number };
    expect(body.balance).toBe(0);            // ledger balance already includes the first reserve
    expect(body.lockedInPOs).toBe(100000);
    expect(body.required).toBe(1000);
    // DB-level pin: no orphan order row, no reserve row from the rejected attempt.
    const counts = await env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM accountant_orders WHERE user_id = ?1) AS orders,
              (SELECT COUNT(*) FROM accountant_entries WHERE user_id = ?1 AND source = 'po_reserve') AS reserves`,
    ).bind(userId).first<{ orders: number; reserves: number }>();
    expect(counts).toEqual({ orders: 1, reserves: 1 });
  });

  it("fund guard sees a CAUGHT-UP balance: pending lazy fine ticks block an over-budget PO (400)", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    await seedBalance(sessionToken, 10000);
    // Backdated sale: deliver_by ~2.5 days ago, flat 2,500 daily → 2 fine ticks
    // (−5,000) accrued but NOT yet materialized (no read ran a catch-up since).
    const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
    const fined = await post(sessionToken, "/orders", {
      type: "sale", category: "trading", item: "Laranite", quantity: 10, price_per_unit: 5000,
      start_at: daysAgo(5), deliver_by: daysAgo(2.5), fine_rate_type: "flat", fine_rate: 2500,
    });
    expect(fined.status).toBe(200);

    // True balance is 10,000 − 5,000 = 5,000 → a 7,000 PO must 400.
    const res = await post(sessionToken, "/orders", { ...PO, quantity: 7 });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { balance: number; required: number };
    expect(body.balance).toBe(5000);          // creation catch-up materialized the fines first
    expect(body.required).toBe(7000);
  });

  it("SALE ORDER NEUTRALITY: ledger, P&L and cash flow are byte-identical before/after creation", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    await seedBalance(sessionToken, 50000);
    const W = "from=2000-01-01T00:00:00Z&to=2099-01-01T00:00:00Z";
    const snap = async () => [
      await (await get(sessionToken, "/ledger")).text(),
      await (await get(sessionToken, `/reports/pl?${W}`)).text(),
      await (await get(sessionToken, `/reports/cash-flow?${W}&interval=monthly`)).text(),
    ];
    const before = await snap();
    const res = await post(sessionToken, "/orders", SALE);
    expect(res.status).toBe(200);
    expect(await snap()).toEqual(before);    // ZERO ledger/cash-flow effect until fulfilment (owner ruling)
  });

  it("computes modified_fields against ORDER_TEMPLATE and stores them", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const res = await post(sessionToken, "/orders", {
      ...SALE, deliver_by: "2026-06-20T00:00:00Z", fine_rate: 1.5, fine_rate_type: "flat",
    });
    const { id } = (await res.json()) as { id: number };
    const row = await env.DB.prepare("SELECT modified_fields FROM accountant_orders WHERE id = ?")
      .bind(id).first<{ modified_fields: string }>();
    expect(JSON.parse(row!.modified_fields).sort()).toEqual(["deliver_by", "fine_rate", "fine_rate_type"]);
  });

  it("an unmodified contract stores an empty modified_fields array", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const res = await post(sessionToken, "/orders", SALE);
    const { id } = (await res.json()) as { id: number };
    const row = await env.DB.prepare("SELECT modified_fields FROM accountant_orders WHERE id = ?")
      .bind(id).first<{ modified_fields: string }>();
    expect(JSON.parse(row!.modified_fields)).toEqual([]);
  });

  it("rejects mission_income category, vis flags, and unknown rate-change conditions with 400", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    expect((await post(sessionToken, "/orders", { ...SALE, category: "mission_income" })).status).toBe(400);
    expect((await post(sessionToken, "/orders", { ...SALE, vis_public: 1 })).status).toBe(400);  // private-only: strict schema
    expect((await post(sessionToken, "/orders", { ...SALE, vis_corp: 1 })).status).toBe(400);
    expect((await post(sessionToken, "/orders", { ...SALE, rate_change_condition: "always" })).status).toBe(400);
  });

  it("GET /orders lists with filters + computed fields + balance/lockedInPOs footer", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    await seedBalance(sessionToken, 500000);
    await post(sessionToken, "/orders", PO);     // purchase, production, 100k locked
    await post(sessionToken, "/orders", SALE);   // sale, trading
    const all = (await (await get(sessionToken, "/orders")).json()) as {
      orders: Array<{ type: string; fulfilledQty: number; remaining: number; accruedFines: number; effectiveRate: number }>;
      total: number; balance: number; lockedInPOs: number;
    };
    expect(all.total).toBe(2);
    expect(all.balance).toBe(400000);            // 500k − 100k reserve (balance ≡ available, §5.0)
    expect(all.lockedInPOs).toBe(100000);
    const sale = all.orders.find((o) => o.type === "sale")!;
    expect(sale.fulfilledQty).toBe(0);
    expect(sale.remaining).toBe(200);
    expect(sale.accruedFines).toBe(0);
    expect(sale.effectiveRate).toBe(3200);       // no condition triggered → base rate
    const filtered = (await (await get(sessionToken, "/orders?type=purchase&status=open")).json()) as { total: number };
    expect(filtered.total).toBe(1);

    // Multi-select type checkboxes: both checked must return BOTH (not just the
    // first param). Mirrors the Market filter's repeatable checkbox groups.
    const bothTypes = (await (await get(sessionToken, "/orders?type=sale&type=purchase")).json()) as { total: number };
    expect(bothTypes.total).toBe(2);
    // Single type still narrows.
    const saleOnly = (await (await get(sessionToken, "/orders?type=sale")).json()) as { total: number };
    expect(saleOnly.total).toBe(1);
    // Category is repeatable too (PO=production, SALE=trading).
    const bothCats = (await (await get(sessionToken, "/orders?category=production&category=trading")).json()) as { total: number };
    expect(bothCats.total).toBe(2);
  });

  it("order entries NEVER reach the Sorting List (source != 'parsed' by construction)", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    await seedBalance(sessionToken, 100000);
    await post(sessionToken, "/orders", PO);
    const sorting = (await (await get(sessionToken, "/sorting")).json()) as { count: number };
    expect(sorting.count).toBe(0);               // pins the design §11 risk-table item
  });

  it("does not leak orders across users (list empty, foreign :id → 404 in Task 4)", async () => {
    const a = await createTestUser(env.DB);
    const b = await createTestUser(env.DB);
    await seedBalance(a.sessionToken, 100000);
    await post(a.sessionToken, "/orders", PO);
    const res = (await (await get(b.sessionToken, "/orders")).json()) as { total: number };
    expect(res.total).toBe(0);
  });
});

describe("M5 — fulfilments, rate change, reserve lifecycle", () => {
  async function fulfil(token: string, id: number, body: Record<string, unknown>) {
    return post(token, `/orders/${id}/fulfillments`, body);
  }
  async function createPO(token: string, over: Record<string, unknown> = {}) {
    await seedBalance(token, 1000000);
    const res = await post(token, "/orders", { ...PO, ...over });
    expect(res.status).toBe(200);
    return ((await res.json()) as { id: number }).id;
  }

  it("posts an order_fulfillment carrying category/tag/qty/rate; first fulfilment → in_progress", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const res = await post(sessionToken, "/orders", SALE);
    const { id } = (await res.json()) as { id: number };
    const f = await fulfil(sessionToken, id, { quantity: 50, occurred_at: "2026-06-12T00:00:00Z", location: "ARC-L1" });
    expect(f.status).toBe(200);
    const e = await env.DB.prepare(
      "SELECT amount, category, tag, quantity, price_per_unit, location, source FROM accountant_entries WHERE order_id = ? AND source = 'order_fulfillment'",
    ).bind(id).first<Record<string, unknown>>();
    expect(e).toMatchObject({
      amount: 160000,          // sale + : round(50 × 3200)
      category: "trading", tag: "minerals", quantity: 50, price_per_unit: 3200, location: "ARC-L1",
    });
    const o = await env.DB.prepare("SELECT status FROM accountant_orders WHERE id = ?").bind(id).first<{ status: string }>();
    expect(o?.status).toBe("in_progress");
  });

  it("reserve rounding PROPERTY: per-step releases round but Σ === reserve; closed → complete", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    await seedBalance(sessionToken, 1000000);
    for (const [qty, ppu] of [[3, 333], [7, 997], [9, 1001], [11, 12345]] as const) {
      const res = await post(sessionToken, "/orders", { ...PO, quantity: qty, price_per_unit: ppu });
      expect(res.status).toBe(200);
      const { id } = (await res.json()) as { id: number };
      for (let i = 0; i < qty; i++) {
        expect((await fulfil(sessionToken, id, { quantity: 1, occurred_at: "2026-06-12T00:00:00Z" })).status).toBe(200);
      }
      const net = await env.DB.prepare(
        `SELECT COALESCE(SUM(amount),0) AS net FROM accountant_entries
         WHERE order_id = ? AND source IN ('po_reserve','po_reserve_release')`,
      ).bind(id).first<{ net: number }>();
      expect(net?.net, `qty=${qty} ppu=${ppu}`).toBe(0);   // closed orders net to EXACTLY 0 (§3 invariant)
      const o = await env.DB.prepare("SELECT status FROM accountant_orders WHERE id = ?").bind(id).first<{ status: string }>();
      expect(o?.status).toBe("complete");                  // remaining 0 → auto-complete
    }
  });

  it("reserve drift golden: qty 7 × ppu 4801 (total 33,607) in 3.5 + 3.5 → releases 16,803 then 16,804", async () => {
    // floor(33607 × 3.5/7) = floor(16803.5) = 16803 — flooring keeps Σ(partials)
    // ≤ total STRUCTURALLY (rounding could overshoot and drive the closing
    // release negative). The CLOSING fulfilment releases the exact open reserve.
    const { sessionToken } = await createTestUser(env.DB);
    const id = await createPO(sessionToken, { quantity: 7, price_per_unit: 4801 });
    await fulfil(sessionToken, id, { quantity: 3.5, occurred_at: "2026-06-12T00:00:00Z" });
    await fulfil(sessionToken, id, { quantity: 3.5, occurred_at: "2026-06-12T01:00:00Z" });
    const releases = (await env.DB.prepare(
      "SELECT amount FROM accountant_entries WHERE order_id = ? AND source = 'po_reserve_release' ORDER BY id",
    ).bind(id).all<{ amount: number }>()).results.map((r) => r.amount);
    expect(releases).toEqual([16803, 16804]);
    const o = await env.DB.prepare("SELECT status FROM accountant_orders WHERE id = ?").bind(id).first<{ status: string }>();
    expect(o?.status).toBe("complete");
  });

  it("fractional-half PROPERTY: four 0.5-qty fulfilments on qty 2 × ppu 1 — no release is ever negative, reserve nets EXACTLY 0", async () => {
    // round() would release 1+1+1 against a reserve of 2, forcing a NEGATIVE
    // closing release; floor() releases 0+0+0 and the closing fulfilment
    // releases the actual open reserve (2).
    const { sessionToken } = await createTestUser(env.DB);
    const id = await createPO(sessionToken, { quantity: 2, price_per_unit: 1 });
    for (let i = 0; i < 4; i++) {
      expect((await fulfil(sessionToken, id, { quantity: 0.5, occurred_at: `2026-06-12T0${i}:00:00Z` })).status).toBe(200);
    }
    const releases = (await env.DB.prepare(
      "SELECT amount FROM accountant_entries WHERE order_id = ? AND source = 'po_reserve_release' ORDER BY id",
    ).bind(id).all<{ amount: number }>()).results.map((r) => r.amount);
    expect(releases.every((a) => a > 0)).toBe(true);   // never negative, no 0-noise rows
    const net = await env.DB.prepare(
      `SELECT COALESCE(SUM(amount),0) AS net FROM accountant_entries
       WHERE order_id = ? AND source IN ('po_reserve','po_reserve_release')`,
    ).bind(id).first<{ net: number }>();
    expect(net?.net).toBe(0);
    const o = await env.DB.prepare("SELECT status FROM accountant_orders WHERE id = ?").bind(id).first<{ status: string }>();
    expect(o?.status).toBe("complete");
  });

  it("duplicate closing request (sequential concurrent-style): second → 400, exactly ONE closing release", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const id = await createPO(sessionToken, {});                       // qty 100, total 100,000
    const body = { quantity: 100, occurred_at: "2026-06-12T00:00:00Z" };
    expect((await fulfil(sessionToken, id, body)).status).toBe(200);
    expect((await fulfil(sessionToken, id, body)).status).toBe(400);   // order is closed
    const releases = (await env.DB.prepare(
      "SELECT amount FROM accountant_entries WHERE order_id = ? AND source = 'po_reserve_release'",
    ).bind(id).all<{ amount: number }>()).results;
    expect(releases).toHaveLength(1);
    expect(releases[0].amount).toBe(100000);
  });

  it("fulfilment occurred_at with a non-Z offset lands NORMALIZED to UTC in the row", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const res = await post(sessionToken, "/orders", SALE);
    const { id } = (await res.json()) as { id: number };
    const f = await fulfil(sessionToken, id, { quantity: 10, occurred_at: "2026-06-12T12:00:00+02:00" });
    expect(f.status).toBe(200);
    const e = await env.DB.prepare(
      "SELECT occurred_at FROM accountant_entries WHERE order_id = ? AND source = 'order_fulfillment'",
    ).bind(id).first<{ occurred_at: string }>();
    expect(e?.occurred_at).toBe("2026-06-12T10:00:00.000Z");
  });

  it("rejects an order whose TOTAL overflows the aUEC ceiling even when both factors pass individually", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const res = await post(sessionToken, "/orders", {
      ...SALE, quantity: 1_000_000_000, price_per_unit: 9_999_999_999_999,
    });
    expect(res.status).toBe(400);
  });

  it("rate change 'late': fulfilment after deliver_by uses price × 1.10 → round(50 × 1100) = 55,000", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const res = await post(sessionToken, "/orders", {
      ...SALE, quantity: 100, price_per_unit: 1000,
      deliver_by: "2026-06-11T00:00:00Z", rate_change_condition: "late", rate_change_pct: 10, fine_rate: 0,
    });
    const { id } = (await res.json()) as { id: number };
    await fulfil(sessionToken, id, { quantity: 50, occurred_at: "2026-06-12T00:00:00Z" }); // late
    const e = await env.DB.prepare(
      "SELECT amount, price_per_unit FROM accountant_entries WHERE order_id = ? AND source='order_fulfillment'",
    ).bind(id).first<{ amount: number; price_per_unit: number }>();
    expect(e?.amount).toBe(55000);
    expect(e?.price_per_unit).toBe(1100);   // entry carries the EFFECTIVE rate (design §3.3 table)
  });

  it("rate change 'partial': first fulfilment at base, second at 1.10×; reserve NOT re-reserved", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const id = await createPO(sessionToken, {
      quantity: 50, price_per_unit: 1000, rate_change_condition: "partial", rate_change_pct: 10,
    }); // total 50,000 reserved
    await fulfil(sessionToken, id, { quantity: 30, occurred_at: "2026-06-12T00:00:00Z" });
    await fulfil(sessionToken, id, { quantity: 20, occurred_at: "2026-06-13T00:00:00Z" });
    const rows = (await env.DB.prepare(
      "SELECT amount, source FROM accountant_entries WHERE order_id = ? ORDER BY id",
    ).bind(id).all<{ amount: number; source: string }>()).results;
    const fulfilments = rows.filter((r) => r.source === "order_fulfillment").map((r) => r.amount);
    expect(fulfilments).toEqual([-30000, -22000]);          // 30×1000 ; round(20 × 1100)
    const reserveNet = rows.filter((r) => r.source.startsWith("po_reserve")).reduce((s, r) => s + r.amount, 0);
    expect(reserveNet).toBe(0);                             // releases track the ORIGINAL 50,000 total
  });

  it("manual amount override wins (recorded as-is, sign applied by type)", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const res = await post(sessionToken, "/orders", SALE);
    const { id } = (await res.json()) as { id: number };
    await fulfil(sessionToken, id, { quantity: 10, amount: 99999, occurred_at: "2026-06-12T00:00:00Z" });
    const e = await env.DB.prepare("SELECT amount FROM accountant_entries WHERE order_id = ? AND source='order_fulfillment'")
      .bind(id).first<{ amount: number }>();
    expect(e?.amount).toBe(99999);                          // sale +; a purchase override books −99999
  });

  it("rejects quantity > remaining with 400 echoing remaining", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const res = await post(sessionToken, "/orders", SALE);  // qty 200
    const { id } = (await res.json()) as { id: number };
    await fulfil(sessionToken, id, { quantity: 150, occurred_at: "2026-06-12T00:00:00Z" });
    const over = await fulfil(sessionToken, id, { quantity: 51, occurred_at: "2026-06-12T01:00:00Z" });
    expect(over.status).toBe(400);
    expect(((await over.json()) as { remaining: number }).remaining).toBe(50);
  });

  it("GET /orders/:id returns contract + fulfilments + fines + reserve state; foreign user → 404", async () => {
    const a = await createTestUser(env.DB);
    const b = await createTestUser(env.DB);
    const id = await createPO(a.sessionToken, {});
    await fulfil(a.sessionToken, id, { quantity: 40, occurred_at: "2026-06-12T00:00:00Z" });
    const detail = (await (await get(a.sessionToken, `/orders/${id}`)).json()) as {
      order: { modified_fields: string[] };
      fulfillments: unknown[]; fines: unknown[];
      reserve: { reserved: number; released: number; open: number };
      computed: { fulfilledQty: number; remaining: number };
    };
    expect(detail.order.modified_fields).toEqual([]);
    expect(detail.fulfillments).toHaveLength(1);
    expect(detail.fines).toEqual([]);
    expect(detail.reserve).toEqual({ reserved: 100000, released: 40000, open: 60000 });
    expect(detail.computed).toMatchObject({ fulfilledQty: 40, remaining: 60 });
    expect((await get(b.sessionToken, `/orders/${id}`)).status).toBe(404);
  });
});

describe("M5 — cancel + notes-only PUT", () => {
  async function cancel(token: string, id: number) {
    // "Content-Length": "0" required by the global M-01 mutation middleware.
    return SELF.fetch(`http://localhost/api/accountant/orders/${id}/cancel`, {
      method: "POST",
      headers: { ...(await authHeaders(token)), "Content-Length": "0" },
    });
  }
  async function put(token: string, id: number, body: Record<string, unknown>) {
    return SELF.fetch(`http://localhost/api/accountant/orders/${id}`, {
      method: "PUT",
      headers: { ...(await authHeaders(token)), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("cancel releases the remaining reserve; partial fulfilments keep their entries", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    await seedBalance(sessionToken, 1000000);
    const res = await post(sessionToken, "/orders", PO);          // 100,000 reserved
    const { id } = (await res.json()) as { id: number };
    const f = await post(sessionToken, `/orders/${id}/fulfillments`, {
      quantity: 40, occurred_at: "2026-06-12T00:00:00Z",          // releases 40,000
    });
    expect(f.status).toBe(200);

    const c = await cancel(sessionToken, id);
    expect(c.status).toBe(200);
    expect(((await c.json()) as { ok: boolean }).ok).toBe(true);

    const rows = (await env.DB.prepare(
      "SELECT amount, source FROM accountant_entries WHERE order_id = ? ORDER BY id",
    ).bind(id).all<{ amount: number; source: string }>()).results;
    const reserveNet = rows
      .filter((r) => r.source.startsWith("po_reserve"))
      .reduce((s, r) => s + r.amount, 0);
    expect(reserveNet).toBe(0);                                   // −100,000 + 40,000 + 60,000
    const releases = rows.filter((r) => r.source === "po_reserve_release").map((r) => r.amount);
    expect(releases).toEqual([40000, 60000]);                     // proportional then remaining-on-cancel
    const fulfilment = rows.find((r) => r.source === "order_fulfillment");
    expect(fulfilment?.amount).toBe(-40000);                      // partial fulfilment entry survives
    const o = await env.DB.prepare("SELECT status FROM accountant_orders WHERE id = ?")
      .bind(id).first<{ status: string }>();
    expect(o?.status).toBe("cancelled");
  });

  it("cancel after fractional partials nets the reserve to EXACTLY 0 (over-release made it permanently +1)", async () => {
    // qty 2 × ppu 1: with round() three 0.5-fulfilments released 3 against a
    // reserve of 2 — openReserve went NEGATIVE, cancel skipped its release, and
    // the +1 corrupted lockedInPOs forever. floor() releases 0 per partial.
    const { sessionToken } = await createTestUser(env.DB);
    await seedBalance(sessionToken, 1000000);
    const res = await post(sessionToken, "/orders", { ...PO, quantity: 2, price_per_unit: 1 });
    const { id } = (await res.json()) as { id: number };
    for (let i = 0; i < 3; i++) {
      expect((await post(sessionToken, `/orders/${id}/fulfillments`, {
        quantity: 0.5, occurred_at: `2026-06-12T0${i}:00:00Z`,
      })).status).toBe(200);
    }
    expect((await cancel(sessionToken, id)).status).toBe(200);
    const net = await env.DB.prepare(
      `SELECT COALESCE(SUM(amount),0) AS net FROM accountant_entries
       WHERE order_id = ? AND source IN ('po_reserve','po_reserve_release')`,
    ).bind(id).first<{ net: number }>();
    expect(net?.net).toBe(0);
    const o = await env.DB.prepare("SELECT status FROM accountant_orders WHERE id = ?")
      .bind(id).first<{ status: string }>();
    expect(o?.status).toBe("cancelled");
  });

  it("cancel on a complete order → 400; cancel a sale order with no reserve just closes it", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    await seedBalance(sessionToken, 1000000);
    const po = await post(sessionToken, "/orders", PO);
    const { id: poId } = (await po.json()) as { id: number };
    const fullFulfil = await post(sessionToken, `/orders/${poId}/fulfillments`, {
      quantity: 100, occurred_at: "2026-06-12T00:00:00Z",         // closes the order → complete
    });
    expect(fullFulfil.status).toBe(200);
    const closed = await cancel(sessionToken, poId);
    expect(closed.status).toBe(400);
    expect(((await closed.json()) as { error: string }).error).toBe("Order already closed");

    // Sale order: zero ledger effect at creation → cancel writes NO entries, only the status flips.
    const sale = await post(sessionToken, "/orders", SALE);
    const { id: saleId } = (await sale.json()) as { id: number };
    const c = await cancel(sessionToken, saleId);
    expect(c.status).toBe(200);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM accountant_entries WHERE order_id = ?")
      .bind(saleId).first<{ n: number }>();
    expect(n?.n).toBe(0);
    const o = await env.DB.prepare("SELECT status FROM accountant_orders WHERE id = ?")
      .bind(saleId).first<{ status: string }>();
    expect(o?.status).toBe("cancelled");
  });

  it("PUT /orders/:id edits notes only; contract terms locked (strict schema → 400 on fine_rate)", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const res = await post(sessionToken, "/orders", SALE);
    const { id } = (await res.json()) as { id: number };

    const ok = await put(sessionToken, id, { notes: "renegotiated" });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { ok: boolean }).ok).toBe(true);
    const row = await env.DB.prepare("SELECT notes, fine_rate FROM accountant_orders WHERE id = ?")
      .bind(id).first<{ notes: string; fine_rate: number }>();
    expect(row?.notes).toBe("renegotiated");
    expect(row?.fine_rate).toBe(0.5);                             // contract term untouched

    const locked = await put(sessionToken, id, { fine_rate: 9 });
    expect(locked.status).toBe(400);                              // hard-locked at creation (owner ruling 10)
  });
});

// ---------------------------------------------------------------------------
// Fulfilment SQL guards (TOCTOU): the route's pre-reads are friendly errors
// only — every statement in the batch re-validates in SQL. These pins drive
// the guarded statements DIRECTLY, exactly like a request whose pre-read won
// the race but whose batch lost it.
// ---------------------------------------------------------------------------
describe("M5 — fulfilment SQL guards (raced-batch pins)", () => {
  interface GuardOrder {
    id: number; type: string; category: string; tag: string | null; quantity: number; total: number;
  }
  async function orderRow(id: number): Promise<GuardOrder> {
    return (await env.DB.prepare(
      "SELECT id, type, category, tag, quantity, total FROM accountant_orders WHERE id = ?",
    ).bind(id).first<GuardOrder>())!;
  }
  async function entryCounts(id: number) {
    return env.DB.prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN source = 'order_fulfillment' THEN 1 ELSE 0 END), 0) AS fulfilments,
         COALESCE(SUM(CASE WHEN source = 'po_reserve_release' THEN 1 ELSE 0 END), 0) AS releases
       FROM accountant_entries WHERE order_id = ?`,
    ).bind(id).first<{ fulfilments: number; releases: number }>();
  }

  it("status gate: a batch against an already-CLOSED order writes zero rows (raced cancel/closing fulfilment)", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    await seedBalance(sessionToken, 1000000);
    const res = await post(sessionToken, "/orders", PO);
    const { id } = (await res.json()) as { id: number };
    expect((await post(sessionToken, `/orders/${id}/fulfillments`, {
      quantity: 100, occurred_at: "2026-06-12T00:00:00Z",
    })).status).toBe(200);                                        // order now 'complete'
    const before = await entryCounts(id);

    const { stmts, fulfilmentIndex } = fulfillmentStatements(env.DB, userId, await orderRow(id), {
      quantity: 10, occurredAt: "2026-06-12T01:00:00Z", amount: -10000, rate: 1000,
      location: null, closing: false,
    });
    const results = await env.DB.batch(stmts);
    expect(results[fulfilmentIndex].meta.changes ?? 0).toBe(0);
    expect(await entryCounts(id)).toEqual(before);                // releases guarded out too
    const o = await env.DB.prepare("SELECT status FROM accountant_orders WHERE id = ?")
      .bind(id).first<{ status: string }>();
    expect(o?.status).toBe("complete");
  });

  it("remaining gate: a closing batch whose quantity no longer fits writes zero rows — no orphan release", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    await seedBalance(sessionToken, 1000000);
    const res = await post(sessionToken, "/orders", PO);
    const { id } = (await res.json()) as { id: number };
    expect((await post(sessionToken, `/orders/${id}/fulfillments`, {
      quantity: 50, occurred_at: "2026-06-12T00:00:00Z",
    })).status).toBe(200);                                        // in_progress, remaining 50
    const before = await entryCounts(id);

    // A raced request that pre-validated against remaining=100 and now tries
    // to CLOSE with qty 100: the gate must refuse fulfilment AND release.
    const { stmts, fulfilmentIndex } = fulfillmentStatements(env.DB, userId, await orderRow(id), {
      quantity: 100, occurredAt: "2026-06-12T01:00:00Z", amount: -100000, rate: 1000,
      location: null, closing: true,
    });
    const results = await env.DB.batch(stmts);
    expect(results[fulfilmentIndex].meta.changes ?? 0).toBe(0);
    expect(await entryCounts(id)).toEqual(before);
    const o = await env.DB.prepare("SELECT status FROM accountant_orders WHERE id = ?")
      .bind(id).first<{ status: string }>();
    expect(o?.status).toBe("in_progress");                        // status untouched by the lost batch
  });
});
