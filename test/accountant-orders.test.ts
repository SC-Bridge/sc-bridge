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
