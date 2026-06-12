import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser } from "./helpers";
import { catchUp } from "../src/lib/accountant/catchup";

// Insert an order row directly (the engine is pure of HTTP — the M2
// accountant-accrual.test.ts pattern). Returns the order id.
async function seedOrder(userId: string, over: Partial<Record<string, unknown>> = {}): Promise<number> {
  const o = {
    type: "purchase", category: "production", item: "Laranite", quantity: 100,
    price_per_unit: 1000, total: 100000, status: "open",
    start_at: "2026-05-30T00:00:00Z", deliver_by: "2026-06-01T00:00:00Z",
    fine_interval: "daily", fine_rate_type: "percent", fine_rate: 0.5, ...over,
  };
  const res = await env.DB.prepare(
    `INSERT INTO accountant_orders (user_id, type, category, item, quantity, price_per_unit, total, status,
       start_at, deliver_by, fine_interval, fine_rate_type, fine_rate)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(userId, o.type, o.category, o.item, o.quantity, o.price_per_unit, o.total, o.status,
         o.start_at, o.deliver_by, o.fine_interval, o.fine_rate_type, o.fine_rate).run();
  return res.meta.last_row_id as number;
}

async function seedFulfillment(userId: string, orderId: number, quantity: number, occurred_at: string) {
  await env.DB.prepare(
    `INSERT INTO accountant_entries (user_id, occurred_at, amount, category, source, order_id, quantity)
     VALUES (?, ?, -1, 'production', 'order_fulfillment', ?, ?)`,
  ).bind(userId, occurred_at, orderId, quantity).run();
}

function ticks(userId: string, orderId: number) {
  return env.DB.prepare(
    `SELECT tick_index, amount, occurred_at FROM accountant_entries
     WHERE user_id = ? AND order_id = ? AND source = 'contract_fine' ORDER BY tick_index`,
  ).bind(userId, orderId).all<{ tick_index: number; amount: number; occurred_at: string }>();
}

// Loan seed (accountant-accrual.test.ts pattern) for the combined catch-up test.
async function seedLoan(userId: string): Promise<number> {
  const res = await env.DB.prepare(
    `INSERT INTO accountant_loans
       (user_id, direction, counterparty, principal, interest_rate, interest_interval, fee_multiplier, started_at)
     VALUES (?, 'outgoing', '@cp', 100000, 10, 'daily', 0, '2026-06-01T00:00:00Z')`,
  ).bind(userId).run();
  const id = res.meta.last_row_id as number;
  await env.DB.prepare(
    `INSERT INTO accountant_entries (user_id, occurred_at, amount, category, source, loan_id)
     VALUES (?, '2026-06-01T00:00:00Z', 100000, 'financial', 'loan_principal', ?)`,
  ).bind(userId, id).run();
  return id;
}

const T = (s: string) => new Date(s).getTime();

describe("M5 fine engine — lazy ticks, editable, never compounding", () => {
  beforeAll(async () => { await setupTestDatabase(env.DB); });

  it("percent/daily golden: 0.5% of 100,000 → 500/tick; sign + on a purchase order", async () => {
    const { userId } = await createTestUser(env.DB);
    const id = await seedOrder(userId);
    await catchUp(env.DB, userId, T("2026-06-04T00:00:01Z"));      // 3 days past deliver_by
    const rows = (await ticks(userId, id)).results;
    expect(rows.map((r) => [r.tick_index, r.amount])).toEqual([[1, 500], [2, 500], [3, 500]]);
    expect(rows.map((r) => r.occurred_at)).toEqual([
      "2026-06-02T00:00:00.000Z", "2026-06-03T00:00:00.000Z", "2026-06-04T00:00:00.000Z",  // deliver_by + i×24h
    ]);
  });

  it("NO COMPOUNDING pin: three percent ticks are 500/500/500, NOT 500/503/505", async () => {
    // Same fixture as the golden — the explicit assertion IS the pin ('we are not loan sharks').
    // If a tick's base ever included prior fines, tick 2 would be round(100500×0.5%)=503
    // and tick 3 round(101003×0.5%)=505. The flat 500s prove the base is fulfilment-only.
    const { userId } = await createTestUser(env.DB);
    const id = await seedOrder(userId);
    await catchUp(env.DB, userId, T("2026-06-04T00:00:01Z"));
    const amounts = (await ticks(userId, id)).results.map((r) => r.amount);
    expect(amounts).toEqual([500, 500, 500]);
    expect(amounts).not.toEqual([500, 503, 505]);
  });

  it("percent base = unfulfilled remainder AS OF the tick timestamp (recomputed after partials)", async () => {
    const { userId } = await createTestUser(env.DB);
    const id = await seedOrder(userId);
    await seedFulfillment(userId, id, 40, "2026-06-02T06:00:00Z"); // between tick 1 (06-02T00) and tick 2 (06-03T00)
    await catchUp(env.DB, userId, T("2026-06-04T00:00:01Z"));
    expect((await ticks(userId, id)).results.map((r) => r.amount)).toEqual([500, 300, 300]); // 100k→500; 60k→300
  });

  it("flat ticks are constant regardless of remainder; sale order fines are negative", async () => {
    const { userId } = await createTestUser(env.DB);
    const id = await seedOrder(userId, { type: "sale", fine_rate_type: "flat", fine_rate: 2500 });
    await seedFulfillment(userId, id, 90, "2026-06-02T06:00:00Z");
    await catchUp(env.DB, userId, T("2026-06-03T00:00:01Z"));      // 2 ticks
    expect((await ticks(userId, id)).results.map((r) => r.amount)).toEqual([-2500, -2500]);
  });

  it("fine entries are category 'financial' with order_id + tick_index set", async () => {
    const { userId } = await createTestUser(env.DB);
    const id = await seedOrder(userId);
    await catchUp(env.DB, userId, T("2026-06-02T00:00:01Z"));      // 1 tick
    const row = await env.DB.prepare(
      `SELECT category, source, order_id, tick_index FROM accountant_entries
       WHERE user_id = ? AND order_id = ? AND source = 'contract_fine'`,
    ).bind(userId, id).first<{ category: string; source: string; order_id: number; tick_index: number }>();
    expect(row).toMatchObject({
      category: "financial", source: "contract_fine", order_id: id, tick_index: 1,
    });
  });

  it("DETERMINISM PROPERTY: one catch-up after 5 intervals ≡ 5 on-time catch-ups — both rate types × ALL FOUR intervals", async () => {
    for (const interval of ["hourly", "daily", "weekly", "monthly"] as const) {
      for (const rateType of ["percent", "flat"] as const) {
        const a = await createTestUser(env.DB);
        const b = await createTestUser(env.DB);
        const over = { fine_interval: interval, fine_rate_type: rateType, fine_rate: rateType === "flat" ? 2500 : 0.5 };
        const idA = await seedOrder(a.userId, over);
        const idB = await seedOrder(b.userId, over);
        const sec = { hourly: 3600, daily: 86400, weekly: 604800, monthly: 2592000 }[interval];
        const base = T("2026-06-01T00:00:00Z");
        await catchUp(env.DB, a.userId, base + 5 * sec * 1000 + 1000);            // once
        for (let i = 1; i <= 5; i++) await catchUp(env.DB, b.userId, base + i * sec * 1000 + 1000); // stepwise
        const rowsA = (await ticks(a.userId, idA)).results;
        const rowsB = (await ticks(b.userId, idB)).results;
        expect(rowsA.length, `${interval}/${rateType}`).toBe(5);
        expect(rowsA.map((r) => [r.tick_index, r.amount, r.occurred_at]))
          .toEqual(rowsB.map((r) => [r.tick_index, r.amount, r.occurred_at]));    // byte-identical
      }
    }
  });

  it("zero-amount ticks ARE written (gapless sequence, anomaly flag — M2 doctrine)", async () => {
    const { userId } = await createTestUser(env.DB);
    const id = await seedOrder(userId, { quantity: 1, price_per_unit: 50, total: 50 }); // 0.5% of 50 → round(0.25) = 0
    await catchUp(env.DB, userId, T("2026-06-02T00:00:01Z"));
    const rows = (await ticks(userId, id)).results;
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(0);
  });

  it("percent rounding: remainder 2,331 × 0.5% → round(11.655) = 12", async () => {
    const { userId } = await createTestUser(env.DB);
    const id = await seedOrder(userId, { quantity: 7, price_per_unit: 333, total: 2331 });
    await catchUp(env.DB, userId, T("2026-06-02T00:00:01Z"));
    expect((await ticks(userId, id)).results[0].amount).toBe(12);
  });

  it("ineligible orders never tick: no deliver_by / fine_rate 0 / closed statuses", async () => {
    const { userId } = await createTestUser(env.DB);
    const a = await seedOrder(userId, { deliver_by: null });
    const b = await seedOrder(userId, { fine_rate: 0 });
    const c2 = await seedOrder(userId, { status: "complete" });
    const d = await seedOrder(userId, { status: "cancelled" });
    await catchUp(env.DB, userId, T("2026-07-01T00:00:00Z"));
    for (const id of [a, b, c2, d]) expect((await ticks(userId, id)).results).toHaveLength(0);
  });

  it("fines STOP at close: ticks accrued while open survive, no new ticks after completion", async () => {
    const { userId } = await createTestUser(env.DB);
    const id = await seedOrder(userId);
    await catchUp(env.DB, userId, T("2026-06-03T00:00:01Z"));      // 2 ticks while open
    await env.DB.prepare("UPDATE accountant_orders SET status = 'complete' WHERE id = ?").bind(id).run();
    await catchUp(env.DB, userId, T("2026-06-10T00:00:00Z"));
    expect((await ticks(userId, id)).results).toHaveLength(2);
  });

  it("idempotent within one now(); loan accrual still runs in the SAME combined catchUp", async () => {
    const { userId } = await createTestUser(env.DB);
    const loanId = await seedLoan(userId);                          // 10%/daily from 2026-06-01
    const orderId = await seedOrder(userId);                        // overdue from 2026-06-01
    const now = T("2026-06-03T00:00:01Z");                          // 2 intervals past both anchors

    await catchUp(env.DB, userId, now);                             // ONE combined call → both engines run
    const loanTicks = () => env.DB.prepare(
      `SELECT tick_index, amount FROM accountant_entries
       WHERE user_id = ? AND loan_id = ? AND source = 'accrual_tick' ORDER BY tick_index`,
    ).bind(userId, loanId).all<{ tick_index: number; amount: number }>();

    const loanRows1 = (await loanTicks()).results;
    const fineRows1 = (await ticks(userId, orderId)).results;
    expect(loanRows1.map((r) => r.amount)).toEqual([10000, 11000]); // compounding loan engine untouched
    expect(fineRows1.map((r) => r.amount)).toEqual([500, 500]);     // non-compounding fine engine

    await catchUp(env.DB, userId, now);                             // same now → idempotent, adds neither
    expect((await loanTicks()).results).toHaveLength(2);
    expect((await ticks(userId, orderId)).results).toHaveLength(2);
  });
});
