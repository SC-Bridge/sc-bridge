import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, seedVehicle } from "./helpers";

// Migration 0288 — per-account Hangar Cleanup buys/state, gift decisions and
// the AI scope columns. The baseline schema already has the post-0288 shape,
// so the tables are put back to their pre-0288 shape, seeded, and the real
// migration statements (env.TEST_MIGRATIONS) are run over them.

const db = () => env.DB as D1Database;

const OLD_SHAPE = [
  `DROP TABLE IF EXISTS user_hangar_cleanup_buys`,
  `DROP TABLE IF EXISTS user_hangar_cleanup_state`,
  `DROP TABLE IF EXISTS user_hangar_cleanup_decisions`,
  `ALTER TABLE ai_analyses DROP COLUMN account_ids_json`,
  `ALTER TABLE ai_chats DROP COLUMN account_ids_json`,
  `CREATE TABLE user_hangar_cleanup_buys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
    price_cents INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    remelt INTEGER NOT NULL DEFAULT 0,
    UNIQUE(user_id, vehicle_id)
  )`,
  `CREATE TABLE user_hangar_cleanup_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL UNIQUE REFERENCES user(id) ON DELETE CASCADE,
    credit_override_cents INTEGER,
    done_steps_json TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE user_hangar_cleanup_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    rsi_pledge_id INTEGER NOT NULL,
    decision TEXT CHECK (decision IN ('keep', 'melt', 'melt-ig', 'iae', 'iae-remelt', 'ins', 'review')),
    buy_ingame INTEGER NOT NULL DEFAULT 0,
    iae_price_cents INTEGER,
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, rsi_pledge_id)
  )`,
];

async function account(userId: string, handle: string, primary: boolean): Promise<number> {
  const row = await db()
    .prepare(
      `INSERT INTO user_rsi_accounts (user_id, rsi_handle, is_primary, is_placeholder)
       VALUES (?, ?, ?, 0) RETURNING id`,
    )
    .bind(userId, handle, primary ? 1 : 0)
    .first<{ id: number }>();
  return row!.id;
}

async function rows<T>(sql: string, ...binds: unknown[]): Promise<T[]> {
  return (await db().prepare(sql).bind(...binds).all<T>()).results;
}

describe("migration 0288 - per-account cleanup, gifts, AI scope", () => {
  let u1 = "";
  let u2 = ""; // cleanup state, no account row
  let a1 = 0;
  let b1 = 0;
  let v1 = 0;
  let v2 = 0;

  beforeAll(async () => {
    await setupTestDatabase(db());
    u1 = (await createTestUser(db())).userId;
    u2 = (await createTestUser(db())).userId;
    a1 = await account(u1, "CleanA", true);
    b1 = await account(u1, "CleanB", false);
    v1 = await seedVehicle(db());
    v2 = await seedVehicle(db());

    for (const sql of OLD_SHAPE) await db().prepare(sql).run();

    await db()
      .prepare("INSERT INTO user_hangar_cleanup_buys (user_id, vehicle_id, price_cents, remelt) VALUES (?, ?, 1500, 1)")
      .bind(u1, v1)
      .run();
    await db()
      .prepare("INSERT INTO user_hangar_cleanup_buys (user_id, vehicle_id, price_cents, remelt) VALUES (?, ?, NULL, 0)")
      .bind(u1, v2)
      .run();
    await db()
      .prepare("INSERT INTO user_hangar_cleanup_state (user_id, credit_override_cents, done_steps_json) VALUES (?, 4200, ?)")
      .bind(u1, '["s1"]')
      .run();
    await db()
      .prepare("INSERT INTO user_hangar_cleanup_state (user_id, credit_override_cents, done_steps_json) VALUES (?, 900, ?)")
      .bind(u2, '["x"]')
      .run();
    const dec = (pledge: number, decision: string | null, buy: number, iae: number | null) =>
      db()
        .prepare(
          "INSERT INTO user_hangar_cleanup_decisions (user_id, rsi_pledge_id, decision, buy_ingame, iae_price_cents) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(u1, pledge, decision, buy, iae)
        .run();
    await dec(101, "melt", 1, null);
    await dec(102, "iae-remelt", 0, 7700);
    await dec(103, null, 0, null);

    const migration = env.TEST_MIGRATIONS.find((m) => m.name === "0288_rsi_account_cleanup_ai.sql");
    expect(migration).toBeDefined();
    for (const q of migration!.queries) await db().prepare(q).run();
  });

  it("stamps existing buys and state with the primary account", async () => {
    const buys = await rows<{ rsi_account_id: number; vehicle_id: number; price_cents: number | null; remelt: number }>(
      "SELECT rsi_account_id, vehicle_id, price_cents, remelt FROM user_hangar_cleanup_buys WHERE user_id = ? ORDER BY vehicle_id",
      u1,
    );
    expect(buys).toEqual([
      { rsi_account_id: a1, vehicle_id: v1, price_cents: 1500, remelt: 1 },
      { rsi_account_id: a1, vehicle_id: v2, price_cents: null, remelt: 0 },
    ]);
    const state = await rows<{ rsi_account_id: number; credit_override_cents: number; done_steps_json: string }>(
      "SELECT rsi_account_id, credit_override_cents, done_steps_json FROM user_hangar_cleanup_state WHERE user_id = ?",
      u1,
    );
    expect(state).toEqual([{ rsi_account_id: a1, credit_override_cents: 4200, done_steps_json: '["s1"]' }]);
  });

  it("allows the same buy vehicle on two accounts", async () => {
    const ins = (acct: number) =>
      db()
        .prepare("INSERT INTO user_hangar_cleanup_buys (user_id, rsi_account_id, vehicle_id) VALUES (?, ?, ?)")
        .bind(u1, acct, v2)
        .run();
    await expect(ins(b1)).resolves.toBeDefined();
    await expect(ins(a1)).rejects.toThrow();
  });

  it("allows one state row per account", async () => {
    const ins = () =>
      db().prepare("INSERT INTO user_hangar_cleanup_state (user_id, rsi_account_id) VALUES (?, ?)").bind(u1, b1).run();
    await expect(ins()).resolves.toBeDefined();
    await expect(ins()).rejects.toThrow();
  });

  it("accepts a gift decision with a target account", async () => {
    await db()
      .prepare(
        "INSERT INTO user_hangar_cleanup_decisions (user_id, rsi_pledge_id, decision, gift_to_account_id) VALUES (?, 104, 'gift', ?)",
      )
      .bind(u1, b1)
      .run();
    const r = await rows<{ decision: string; gift_to_account_id: number }>(
      "SELECT decision, gift_to_account_id FROM user_hangar_cleanup_decisions WHERE rsi_pledge_id = 104 AND user_id = ?",
      u1,
    );
    expect(r).toEqual([{ decision: "gift", gift_to_account_id: b1 }]);
  });

  it("keeps existing decisions unchanged", async () => {
    const r = await rows<Record<string, unknown>>(
      `SELECT rsi_pledge_id, decision, buy_ingame, iae_price_cents, gift_to_account_id
       FROM user_hangar_cleanup_decisions WHERE user_id = ? AND rsi_pledge_id < 104 ORDER BY rsi_pledge_id`,
      u1,
    );
    expect(r).toEqual([
      { rsi_pledge_id: 101, decision: "melt", buy_ingame: 1, iae_price_cents: null, gift_to_account_id: null },
      { rsi_pledge_id: 102, decision: "iae-remelt", buy_ingame: 0, iae_price_cents: 7700, gift_to_account_id: null },
      { rsi_pledge_id: 103, decision: null, buy_ingame: 0, iae_price_cents: null, gift_to_account_id: null },
    ]);
  });

  it("gives a user with cleanup state and no account a placeholder primary, keeping the state", async () => {
    const acct = await rows<{ id: number; is_primary: number; is_placeholder: number; color: string; label: string }>(
      "SELECT id, is_primary, is_placeholder, color, label FROM user_rsi_accounts WHERE user_id = ?",
      u2,
    );
    expect(acct).toHaveLength(1);
    expect(acct[0]).toMatchObject({ is_primary: 1, is_placeholder: 1, color: "#22d3ee", label: "Imported hangar" });
    const state = await rows<{ rsi_account_id: number; credit_override_cents: number }>(
      "SELECT rsi_account_id, credit_override_cents FROM user_hangar_cleanup_state WHERE user_id = ?",
      u2,
    );
    expect(state).toEqual([{ rsi_account_id: acct[0].id, credit_override_cents: 900 }]);
  });

  it("adds account_ids_json to ai_analyses and ai_chats, NULL by default", async () => {
    await db()
      .prepare("INSERT INTO ai_analyses (user_id, provider, model, vehicle_count, analysis) VALUES (?, 'p', 'm', 1, 'a')")
      .bind(u1)
      .run();
    await db().prepare("INSERT INTO ai_chats (user_id, provider, model) VALUES (?, 'p', 'm')").bind(u1).run();
    const a = await rows<{ account_ids_json: string | null }>("SELECT account_ids_json FROM ai_analyses WHERE user_id = ?", u1);
    const c = await rows<{ account_ids_json: string | null }>("SELECT account_ids_json FROM ai_chats WHERE user_id = ?", u1);
    expect(a).toEqual([{ account_ids_json: null }]);
    expect(c).toEqual([{ account_ids_json: null }]);
  });
});
