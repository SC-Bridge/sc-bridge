// ---------------------------------------------------------------------------
// QA note, for whoever reads test suites for fun (hi, Gavin):
//
// This suite is a worked example of the "5FF" method — 5 Fabulous Fuckups.
// When you are SURE something works, that certainty is the trigger: name the
// 5 parts that can fuck up, then 5 ways EACH can fuck up (the 4th and 5th are
// the expensive ones to find — that's the point), score every way
// likelihood × consequence (1–5 each), handle the top 5, and iterate until
// nothing scores 3 or above. It's what the ways are for.
//
// The engine below was "done" and provably deterministic. Its fabulous five,
// all pinned by the tests in this file: the unbounded catch-up batch (one
// backdated hourly loan ≈ 57k INSERTs in a single db.batch), the concurrent-
// read tick race on the (loan_id, tick_index) unique index, zero-amount tick
// noise, bookmark drift on a partial commit, and wall-clock time bombs in the
// test fixtures themselves. Being sure is where the hunt starts, not where it
// ends. ;)
// ---------------------------------------------------------------------------
import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser } from "./helpers";
import {
  INTERVAL_SECONDS,
  elapsedTicks,
  nextTickAt,
  catchUpAccruals,
  collectAccrualWork,
  runCatchUpWork,
  MAX_TICKS_PER_CATCHUP,
} from "../src/lib/accountant/accrual";
import { privateScope } from "../src/lib/accountant/scope";

// Insert a loan row + principal entry directly. Returns the loan id.
// The loan row always stores the absolute principal (production shape).
// The entry carries the sign: positive for outgoing (receivable), negative for incoming (liability).
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
  const absPrincipal = Math.abs(o.principal);
  const entrySign = o.direction === "incoming" ? -1 : 1;
  const res = await env.DB.prepare(
    `INSERT INTO accountant_loans
       (user_id, direction, counterparty, principal, interest_rate, interest_interval, fee_multiplier, started_at)
     VALUES (?, ?, '@cp', ?, ?, ?, ?, ?)`,
  ).bind(userId, o.direction, absPrincipal, o.interest_rate, o.interest_interval, o.fee_multiplier, o.started_at).run();
  const id = res.meta.last_row_id as number;
  // Entry carries the sign: positive for outgoing (receivable), negative for incoming (liability).
  await env.DB.prepare(
    `INSERT INTO accountant_entries (user_id, occurred_at, amount, category, source, loan_id)
     VALUES (?, ?, ?, 'financial', 'loan_principal', ?)`,
  ).bind(userId, o.started_at, entrySign * absPrincipal, id).run();
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

  it("skips zero-amount ticks but advances the bookmark over them", async () => {
    const { userId } = await createTestUser(env.DB);
    const loanId = await seedLoan(userId, { interest_rate: 10, interest_interval: "daily", principal: 100000 });
    // fully repay before any tick → every tick's base is 0 → round(0) = 0
    await env.DB.prepare(
      `INSERT INTO accountant_entries (user_id, occurred_at, amount, category, source, loan_id)
       VALUES (?, '2026-06-01T00:00:00Z', -100000, 'financial', 'loan_repayment', ?)`,
    ).bind(userId, loanId).run();
    await catchUpAccruals(env.DB, userId, new Date("2026-06-02T00:00:01Z").getTime());
    const rows = (await ticks(userId, loanId)).results;
    expect(rows.length).toBe(0); // 0 aUEC row is ledger noise — skipped, not written
    // bookmark still advances OVER the skipped tick so it never re-materializes
    const loan = await env.DB.prepare("SELECT last_accrued_tick FROM accountant_loans WHERE id = ?")
      .bind(loanId).first<{ last_accrued_tick: number }>();
    expect(loan?.last_accrued_tick).toBe(1);
  });

  it("rate-0 loan: elapsed ticks write no entries; repeated reads stay byte-identical", async () => {
    const { userId } = await createTestUser(env.DB);
    // rate 0 → every tick is round(outstanding * 0) = 0 → all skipped.
    const loanId = await seedLoan(userId, { interest_rate: 0, interest_interval: "daily" });
    const now = new Date("2026-06-06T00:00:01Z").getTime(); // 5 intervals elapsed
    await catchUpAccruals(env.DB, userId, now);
    const first = (await ticks(userId, loanId)).results;
    expect(first).toHaveLength(0); // no zero rows materialized
    const bm = await env.DB.prepare("SELECT last_accrued_tick FROM accountant_loans WHERE id = ?")
      .bind(loanId).first<{ last_accrued_tick: number }>();
    expect(bm?.last_accrued_tick).toBe(5); // bookmark advanced over all 5 skipped ticks
    // A second read at the same now is a byte-identical no-op (determinism holds).
    await catchUpAccruals(env.DB, userId, now);
    expect((await ticks(userId, loanId)).results).toEqual(first);
  });

  it("caps catch-up at MAX_TICKS_PER_CATCHUP and converges to the exact total over reads", async () => {
    const { userId } = await createTestUser(env.DB);
    // Tiny rate keeps each hourly tick a bounded, NONZERO amount
    // (round(100000 * 0.001/100) = 1) so compounding can't explode while the loan
    // still owes thousands of REAL ticks — the self-DoS shape (backdated + hourly).
    const started = "2026-01-01T00:00:00Z";
    const startedMs = new Date(started).getTime();
    const loanId = await seedLoan(userId, { interest_rate: 0.001, interest_interval: "hourly", started_at: started });
    const totalDue = MAX_TICKS_PER_CATCHUP + 250; // owe more than one full cap
    const now = startedMs + totalDue * 3600_000 + 1000;

    // First read must NOT exceed the cap and must NOT throw despite the huge backlog.
    await catchUpAccruals(env.DB, userId, now);
    const firstRows = (await ticks(userId, loanId)).results;
    expect(firstRows.length).toBeLessThanOrEqual(MAX_TICKS_PER_CATCHUP);
    expect(firstRows.length).toBe(MAX_TICKS_PER_CATCHUP); // every hour ticks (nonzero)

    // A subsequent read closes the remaining gap — convergence to the exact total.
    await catchUpAccruals(env.DB, userId, now);
    const rows = (await ticks(userId, loanId)).results;
    expect(rows.length).toBe(totalDue);
    const bm = await env.DB.prepare("SELECT last_accrued_tick FROM accountant_loans WHERE id = ?")
      .bind(loanId).first<{ last_accrued_tick: number }>();
    expect(bm?.last_accrued_tick).toBe(totalDue);
    // Contiguous 1..totalDue — no gaps (every tick was nonzero) and no duplicates.
    expect(rows.map((r) => r.tick_index)).toEqual(Array.from({ length: totalDue }, (_, k) => k + 1));
  });

  it("chunk ordering: a partial commit never leaves the bookmark ahead of materialized ticks, and resumes cleanly", async () => {
    const { userId } = await createTestUser(env.DB);
    // 250 nonzero hourly ticks → several BATCH_CHUNK (100) batches in one collection.
    const started = "2026-03-01T00:00:00Z";
    const startedMs = new Date(started).getTime();
    const loanId = await seedLoan(userId, { interest_rate: 0.001, interest_interval: "hourly", started_at: started });
    const now = startedMs + 250 * 3600_000 + 1000;

    const work = await collectAccrualWork(env.DB, privateScope(userId), now);
    expect(work.batches.length).toBeGreaterThan(1); // chunked across multiple batches

    // Simulate a crash after ONLY the first chunk commits.
    await env.DB.batch(work.batches[0]);
    const bm1 = await env.DB.prepare("SELECT last_accrued_tick FROM accountant_loans WHERE id = ?")
      .bind(loanId).first<{ last_accrued_tick: number }>();
    const rows1 = (await ticks(userId, loanId)).results;
    // Bookmark must NOT run ahead of committed ticks: it equals the max materialized
    // index, and every tick up to it exists (all nonzero here).
    expect(bm1?.last_accrued_tick).toBe(rows1.length);
    expect(rows1[rows1.length - 1].tick_index).toBe(bm1?.last_accrued_tick);

    // Resume: a fresh catch-up converges to the exact total, no dupes, no gaps.
    await catchUpAccruals(env.DB, userId, now);
    const rows2 = (await ticks(userId, loanId)).results;
    expect(rows2.length).toBe(250);
    expect(rows2.map((r) => r.tick_index)).toEqual(Array.from({ length: 250 }, (_, k) => k + 1));
  });

  it("concurrent catch-up: two collections of the same pending work — the second commit is a clean no-op", async () => {
    const { userId } = await createTestUser(env.DB);
    const loanId = await seedLoan(userId, { interest_rate: 10, interest_interval: "daily", started_at: "2026-06-01T00:00:00Z" });
    const now = new Date("2026-06-04T00:00:01Z").getTime(); // 3 ticks

    // Two readers cross the same boundary before either commits: both snapshot
    // last_accrued_tick = 0 and collect the identical three ticks.
    const workA = await collectAccrualWork(env.DB, privateScope(userId), now);
    const workB = await collectAccrualWork(env.DB, privateScope(userId), now);

    await runCatchUpWork(env.DB, workA);
    const afterA = (await ticks(userId, loanId)).results;
    expect(afterA.map((r) => r.amount)).toEqual([10000, 11000, 12100]);

    // The loser's identical INSERTs hit the unique (loan_id, tick_index) index and are
    // ignored (INSERT OR IGNORE) — no throw, no new/duplicate rows.
    await runCatchUpWork(env.DB, workB);
    expect((await ticks(userId, loanId)).results).toEqual(afterA);
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
    // direction "incoming" → seedLoan writes the entry as -100000 (liability), matching
    // what loans.ts writes (sign = -1 for incoming, entry = sign * principal).
    // The loan row principal column stores the absolute value (100000), matching production shape.
    const loanId = await seedLoan(userId, {
      direction: "incoming",
      principal: 100000,
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
