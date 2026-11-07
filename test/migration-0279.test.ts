import { env, reset } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, seedVehicle } from "./helpers";

// Migration 0279 — Hangar Cleanup: user_pledges columns, three new user
// tables, and the store-credit x100 data fix for pre-0.6.2 extension syncs.
//
// readFileSync does not work inside miniflare's worker runtime, so the data-fix
// statement is inlined here. Must stay in sync with
// src/db/migrations/0279_hangar_cleanup.sql.

const db = () => env.DB as D1Database;

const DATA_FIX = `UPDATE user_rsi_profiles
SET store_credit_cents = store_credit_cents / 100
WHERE store_credit_cents IS NOT NULL
  AND store_credit_cents % 100 = 0
  AND synced_at < '2026-11-07 20:00:00'`;

describe("migration 0279 — store credit x100 fix", () => {
  beforeAll(async () => {
    await reset();
    await db()
      .prepare(
        `CREATE TABLE user_rsi_profiles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL UNIQUE,
          store_credit_cents INTEGER,
          synced_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`,
      )
      .run();
    // synced_at values in the format datetime('now') writes ('YYYY-MM-DD HH:MM:SS').
    const rows: [string, number | null, string][] = [
      ["old", 779500, "2026-10-01 12:00:00"],
      ["cutoff-day-before", 1234500, "2026-11-07 19:59:59"],
      ["cutoff-day-after", 7795, "2026-11-07 20:30:00"], // a 0.6.2 sync — must not change
      ["newer", 5000, "2026-11-08 01:00:00"],
      ["null-credit", null, "2026-10-01 12:00:00"],
      ["not-x100", 7795, "2026-10-01 12:00:00"], // cannot be a x100 value — untouched
    ];
    for (const [u, cents, at] of rows) {
      await db()
        .prepare("INSERT INTO user_rsi_profiles (user_id, store_credit_cents, synced_at) VALUES (?, ?, ?)")
        .bind(u, cents, at)
        .run();
    }
    await db().prepare(DATA_FIX).run();
  });

  async function credit(u: string) {
    return (await db()
      .prepare("SELECT store_credit_cents AS c FROM user_rsi_profiles WHERE user_id = ?")
      .bind(u)
      .first<{ c: number | null }>())!.c;
  }

  it("divides values synced before the 0.6.2 cutoff", async () => {
    expect(await credit("old")).toBe(7795);
    expect(await credit("cutoff-day-before")).toBe(12345);
  });

  it("leaves values synced after the cutoff (same day included) untouched", async () => {
    expect(await credit("cutoff-day-after")).toBe(7795);
    expect(await credit("newer")).toBe(5000);
  });

  it("leaves NULL and non-x100 values untouched", async () => {
    expect(await credit("null-credit")).toBeNull();
    expect(await credit("not-x100")).toBe(7795);
  });
});

describe("migration 0279 — schema", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  it("adds is_warbond / ccu_from_name / ccu_to_name to user_pledges", async () => {
    const cols = await db()
      .prepare(
        `SELECT name, dflt_value FROM pragma_table_info('user_pledges')
         WHERE name IN ('is_warbond', 'ccu_from_name', 'ccu_to_name') ORDER BY name`,
      )
      .all<{ name: string; dflt_value: string | null }>();
    expect(cols.results).toEqual([
      { name: "ccu_from_name", dflt_value: null },
      { name: "ccu_to_name", dflt_value: null },
      { name: "is_warbond", dflt_value: "0" },
    ]);
  });

  it("rejects an unknown decision but allows NULL", async () => {
    const { userId } = await createTestUser(db());
    await expect(
      db()
        .prepare("INSERT INTO user_hangar_cleanup_decisions (user_id, rsi_pledge_id, decision) VALUES (?, 1, 'sell')")
        .bind(userId)
        .run(),
    ).rejects.toThrow();
    await db()
      .prepare("INSERT INTO user_hangar_cleanup_decisions (user_id, rsi_pledge_id, decision, buy_ingame) VALUES (?, 2, NULL, 1)")
      .bind(userId)
      .run();
    const decisions = ["keep", "melt", "melt-ig", "iae", "ins", "review"];
    for (let i = 0; i < decisions.length; i++) {
      await db()
        .prepare("INSERT INTO user_hangar_cleanup_decisions (user_id, rsi_pledge_id, decision) VALUES (?, ?, ?)")
        .bind(userId, 100 + i, decisions[i])
        .run();
    }
  });

  it("enforces one decision per pledge, one buy per vehicle, one state row per user", async () => {
    const { userId } = await createTestUser(db());
    const vehicleId = await seedVehicle(db());
    await db().prepare("INSERT INTO user_hangar_cleanup_decisions (user_id, rsi_pledge_id, decision) VALUES (?, 5, 'keep')").bind(userId).run();
    await expect(
      db().prepare("INSERT INTO user_hangar_cleanup_decisions (user_id, rsi_pledge_id, decision) VALUES (?, 5, 'melt')").bind(userId).run(),
    ).rejects.toThrow();
    await db().prepare("INSERT INTO user_hangar_cleanup_buys (user_id, vehicle_id) VALUES (?, ?)").bind(userId, vehicleId).run();
    await expect(
      db().prepare("INSERT INTO user_hangar_cleanup_buys (user_id, vehicle_id) VALUES (?, ?)").bind(userId, vehicleId).run(),
    ).rejects.toThrow();
    await db().prepare("INSERT INTO user_hangar_cleanup_state (user_id) VALUES (?)").bind(userId).run();
    await expect(
      db().prepare("INSERT INTO user_hangar_cleanup_state (user_id) VALUES (?)").bind(userId).run(),
    ).rejects.toThrow();
  });
});
