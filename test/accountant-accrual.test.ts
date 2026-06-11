import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser } from "./helpers";
import {
  INTERVAL_SECONDS,
  elapsedTicks,
  nextTickAt,
  catchUpAccruals,
} from "../src/lib/accountant/accrual";

// Insert a loan row directly (loans.ts endpoints come in Task 2). Returns its id.
async function seedLoan(
  userId: string,
  overrides: Partial<{
    direction: string; principal: number; interest_rate: number;
    interest_interval: string; fee_multiplier: number; started_at: string;
  }> = {},
): Promise<number> {
  const o = {
    direction: "outgoing", principal: 100000, interest_rate: 10,
    interest_interval: "daily", fee_multiplier: 0,
    started_at: "2026-06-01T00:00:00Z", ...overrides,
  };
  const res = await env.DB.prepare(
    `INSERT INTO accountant_loans
       (user_id, direction, counterparty, principal, interest_rate, interest_interval, fee_multiplier, started_at)
     VALUES (?, ?, '@cp', ?, ?, ?, ?, ?)`,
  ).bind(userId, o.direction, o.principal, o.interest_rate, o.interest_interval, o.fee_multiplier, o.started_at).run();
  const id = res.meta.last_row_id as number;
  // The principal entry is what outstanding is computed from. Same sign as a
  // receivable for an outgoing loan (positive). loan_id links it; no tick_index.
  await env.DB.prepare(
    `INSERT INTO accountant_entries (user_id, occurred_at, amount, category, source, loan_id)
     VALUES (?, ?, ?, 'financial', 'loan_principal', ?)`,
  ).bind(userId, o.started_at, o.principal, id).run();
  return id;
}

function ticks(userId: string, loanId: number) {
  return env.DB.prepare(
    `SELECT tick_index, amount, occurred_at FROM accountant_entries
     WHERE user_id = ? AND loan_id = ? AND source = 'accrual_tick'
     ORDER BY tick_index ASC`,
  ).bind(userId, loanId).all<{ tick_index: number; amount: number; occurred_at: string }>();
}

describe("accrual engine — pure tick math", () => {
  beforeAll(async () => { await setupTestDatabase(env.DB); });

  it("INTERVAL_SECONDS uses fixed durations incl. monthly = 30 days flat", () => {
    expect(INTERVAL_SECONDS.hourly).toBe(3600);
    expect(INTERVAL_SECONDS.daily).toBe(86400);
    expect(INTERVAL_SECONDS.weekly).toBe(604800);
    expect(INTERVAL_SECONDS.monthly).toBe(2592000); // 30 * 86400, no calendar math
  });

  it("elapsedTicks floors (now - started_at) / interval", () => {
    const started = "2026-06-01T00:00:00Z";
    // 3.5 daily intervals elapsed → 3 ticks
    const now = new Date("2026-06-04T12:00:00Z").getTime();
    expect(elapsedTicks({ started_at: started, interest_interval: "daily" }, now)).toBe(3);
  });

  it("nextTickAt returns the timestamp of last_accrued_tick + 1", () => {
    const loan = { started_at: "2026-06-01T00:00:00Z", interest_interval: "daily", last_accrued_tick: 2 };
    expect(nextTickAt(loan)).toBe(new Date("2026-06-04T00:00:00Z").toISOString());
  });

  it("compounds on outstanding: 10%/day on 100000 → 10000, then 11000 …", async () => {
    const { userId } = await createTestUser(env.DB);
    const loanId = await seedLoan(userId, { interest_rate: 10, interest_interval: "daily" });
    // 2 full days elapsed since start.
    const now = new Date("2026-06-03T00:00:01Z").getTime();
    await catchUpAccruals(env.DB, userId, now);
    const rows = (await ticks(userId, loanId)).results;
    expect(rows.map((r) => r.amount)).toEqual([10000, 11000]); // round(100000*.1)=10000; round(110000*.1)=11000
    expect(rows.map((r) => r.tick_index)).toEqual([1, 2]);
    // bookmark advanced
    const loan = await env.DB.prepare("SELECT last_accrued_tick FROM accountant_loans WHERE id = ?")
      .bind(loanId).first<{ last_accrued_tick: number }>();
    expect(loan?.last_accrued_tick).toBe(2);
  });

  it("DETERMINISM: catch-up once after N intervals == N on-time catch-ups (byte-identical rows)", async () => {
    const a = await createTestUser(env.DB);
    const b = await createTestUser(env.DB);
    const startA = "2026-06-01T00:00:00Z";
    const loanA = await seedLoan(a.userId, { interest_rate: 7, interest_interval: "daily", started_at: startA });
    const loanB = await seedLoan(b.userId, { interest_rate: 7, interest_interval: "daily", started_at: startA });

    // A: one catch-up 5 days later.
    await catchUpAccruals(env.DB, a.userId, new Date("2026-06-06T00:00:01Z").getTime());
    // B: five on-time catch-ups, one per day.
    for (let d = 2; d <= 6; d++) {
      await catchUpAccruals(env.DB, b.userId, new Date(`2026-06-0${d}T00:00:01Z`).getTime());
    }

    const rowsA = (await ticks(a.userId, loanA)).results;
    const rowsB = (await ticks(b.userId, loanB)).results;
    expect(rowsA.length).toBe(5);
    // amounts AND occurred_at timestamps must match index-for-index
    expect(rowsA.map((r) => [r.tick_index, r.amount, r.occurred_at]))
      .toEqual(rowsB.map((r) => [r.tick_index, r.amount, r.occurred_at]));
  });

  it("compounds net of an interleaved repayment as of the tick timestamp", async () => {
    const { userId } = await createTestUser(env.DB);
    const loanId = await seedLoan(userId, { interest_rate: 10, interest_interval: "daily" });
    // tick 1 day 1: 10%*100000 = 10000 (outstanding now 110000)
    await catchUpAccruals(env.DB, userId, new Date("2026-06-02T00:00:01Z").getTime());
    // a repayment lands AFTER tick 1 but BEFORE tick 2's timestamp
    await env.DB.prepare(
      `INSERT INTO accountant_entries (user_id, occurred_at, amount, category, source, loan_id)
       VALUES (?, '2026-06-02T06:00:00Z', ?, 'financial', 'loan_repayment', ?)`,
    ).bind(userId, -50000, loanId).run(); // repayment reduces outstanding by 50000
    // tick 2 day 2: outstanding = 110000 - 50000 = 60000 → 10% = 6000
    await catchUpAccruals(env.DB, userId, new Date("2026-06-03T00:00:01Z").getTime());
    const rows = (await ticks(userId, loanId)).results;
    expect(rows.map((r) => r.amount)).toEqual([10000, 6000]);
  });

  it("writes zero-amount ticks (does not skip them)", async () => {
    const { userId } = await createTestUser(env.DB);
    const loanId = await seedLoan(userId, { interest_rate: 10, interest_interval: "daily", principal: 100000 });
    // fully repay before any tick
    await env.DB.prepare(
      `INSERT INTO accountant_entries (user_id, occurred_at, amount, category, source, loan_id)
       VALUES (?, '2026-06-01T00:00:00Z', -100000, 'financial', 'loan_repayment', ?)`,
    ).bind(userId, loanId).run();
    await catchUpAccruals(env.DB, userId, new Date("2026-06-02T00:00:01Z").getTime());
    const rows = (await ticks(userId, loanId)).results;
    expect(rows.length).toBe(1);
    expect(rows[0].amount).toBe(0); // outstanding 0 → round(0)=0, STILL written (anomaly flag)
  });

  it("is idempotent within one now() — a second call posts no new ticks", async () => {
    const { userId } = await createTestUser(env.DB);
    const loanId = await seedLoan(userId, { interest_interval: "daily" });
    const now = new Date("2026-06-04T00:00:01Z").getTime();
    await catchUpAccruals(env.DB, userId, now);
    const after1 = (await ticks(userId, loanId)).results.length;
    await catchUpAccruals(env.DB, userId, now);
    const after2 = (await ticks(userId, loanId)).results.length;
    expect(after2).toBe(after1);
  });

  it("ignores settled loans (no new ticks once status='settled')", async () => {
    const { userId } = await createTestUser(env.DB);
    const loanId = await seedLoan(userId, { interest_interval: "daily" });
    await env.DB.prepare("UPDATE accountant_loans SET status = 'settled' WHERE id = ?").bind(loanId).run();
    await catchUpAccruals(env.DB, userId, new Date("2026-07-01T00:00:00Z").getTime());
    expect((await ticks(userId, loanId)).results.length).toBe(0);
  });

  it("compounds an incoming loan with NEGATIVE ticks: −100000 @10%/day → [−10000, −11000]", async () => {
    const { userId } = await createTestUser(env.DB);
    // seedLoan writes o.principal as-is into accountant_entries; for incoming the principal
    // must be negative (liability) — loans.ts does sign * principal where sign = -1 for incoming.
    const loanId = await seedLoan(userId, {
      direction: "incoming",
      principal: -100000, // negative principal entry matches what loans.ts writes for incoming
      interest_rate: 10,
      interest_interval: "daily",
    });
    // 2 full days elapsed since start.
    const now = new Date("2026-06-03T00:00:01Z").getTime();
    await catchUpAccruals(env.DB, userId, now);
    const rows = (await ticks(userId, loanId)).results;
    // Outstanding starts at −100000; 10% → −10000 (tick 1); −110000 * 10% → −11000 (tick 2).
    expect(rows.map((r) => r.amount)).toEqual([-10000, -11000]);
    expect(rows.map((r) => r.tick_index)).toEqual([1, 2]);
  });
});
