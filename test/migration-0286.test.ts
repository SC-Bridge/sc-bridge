import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, seedVehicle } from "./helpers";

// Migration 0286 — per-account loaner loadouts, module selections and ship
// order. The baseline schema already has the post-0286 shape, so the three
// tables are put back to their pre-0286 shape, seeded, and the real migration
// statements (env.TEST_MIGRATIONS) are run over them.

const db = () => env.DB as D1Database;

const OLD_SHAPE = [
  `DROP TABLE IF EXISTS user_loaner_loadout`,
  `DROP TABLE IF EXISTS user_module_selection`,
  `DROP TABLE IF EXISTS user_localization_ship_order`,
  `CREATE TABLE user_loaner_loadout (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    loaner_vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
    port_id INTEGER NOT NULL REFERENCES vehicle_ports(id),
    component_id INTEGER NOT NULL REFERENCES vehicle_components(id),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, loaner_vehicle_id, port_id)
  )`,
  `CREATE TABLE user_module_selection (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    owner_kind TEXT NOT NULL CHECK (owner_kind IN ('fleet', 'loaner')),
    owner_id INTEGER NOT NULL,
    port_name TEXT NOT NULL,
    module_uuid TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    module_kind TEXT NOT NULL DEFAULT 'bay',
    UNIQUE(user_id, owner_kind, owner_id, port_name)
  )`,
  `CREATE TABLE user_localization_ship_order (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
    sort_position INTEGER NOT NULL,
    custom_label TEXT,
    UNIQUE(user_id, vehicle_id),
    UNIQUE(user_id, sort_position)
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

async function fleet(userId: string, vehicleId: number, accountId: number): Promise<number> {
  const row = await db()
    .prepare(
      `INSERT INTO user_fleet (user_id, vehicle_id, is_loaner, rsi_account_id, imported_at)
       VALUES (?, ?, 0, ?, datetime('now')) RETURNING id`,
    )
    .bind(userId, vehicleId, accountId)
    .first<{ id: number }>();
  return row!.id;
}

async function rows<T>(sql: string, ...binds: unknown[]): Promise<T[]> {
  return (await db().prepare(sql).bind(...binds).all<T>()).results;
}

describe("migration 0286 - per-account vehicle settings", () => {
  let u1 = "";
  let u2 = "";
  let u3 = "";
  let a1 = 0;
  let b1 = 0; // user 1: primary A, other B
  let a2 = 0; // user 2: single primary
  let a3 = 0; // user 3: single primary, no entitlement
  let plain = 0;
  let fleetOnB = 0;

  beforeAll(async () => {
    await setupTestDatabase(db());
    u1 = (await createTestUser(db())).userId;
    u2 = (await createTestUser(db())).userId;
    u3 = (await createTestUser(db())).userId;
    a1 = await account(u1, "OneA", true);
    b1 = await account(u1, "OneB", false);
    a2 = await account(u2, "TwoA", true);
    a3 = await account(u3, "ThreeA", true);

    const concept = await seedVehicle(db(), { production_status_id: 3 });
    const loaner = await seedVehicle(db());
    const loaner2 = await seedVehicle(db());
    plain = await seedVehicle(db());
    await db().prepare("INSERT INTO vehicle_loaners (vehicle_id, loaner_id) VALUES (?, ?)").bind(concept, loaner).run();

    // user 1: the concept ship sits on both A and B -> loaner entitled on both.
    await fleet(u1, concept, a1);
    fleetOnB = await fleet(u1, plain, b1);
    await fleet(u1, concept, b1);
    // user 2: concept ship on its only account.
    await fleet(u2, concept, a2);
    // user 3: owns only a flight-ready ship -> entitled to nothing.
    await fleet(u3, plain, a3);

    await db()
      .prepare(`INSERT INTO vehicle_ports (uuid, vehicle_id, name, port_type, game_version_id) VALUES ('m286-p', ?, 'p', 'shield', 1)`)
      .bind(loaner)
      .run();
    await db()
      .prepare(`INSERT INTO vehicle_ports (uuid, vehicle_id, name, port_type, game_version_id) VALUES ('m286-p2', ?, 'p', 'shield', 1)`)
      .bind(loaner2)
      .run();
    const portId = (await db().prepare("SELECT id FROM vehicle_ports WHERE uuid = 'm286-p'").first<{ id: number }>())!.id;
    const port2Id = (await db().prepare("SELECT id FROM vehicle_ports WHERE uuid = 'm286-p2'").first<{ id: number }>())!.id;
    await db()
      .prepare(
        `INSERT INTO vehicle_components (uuid, name, slug, type, size, grade, game_version_id, created_at, updated_at)
         VALUES ('m286-c', 'C', 'm286-c', 'shield', 1, 1, 1, datetime('now'), datetime('now'))`,
      )
      .run();
    const componentId = (await db().prepare("SELECT id FROM vehicle_components WHERE uuid = 'm286-c'").first<{ id: number }>())!.id;

    // Pre-0286 shape, then seed.
    for (const sql of OLD_SHAPE) await db().prepare(sql).run();
    const ll = (user: string, vehicle: number, port: number) =>
      db()
        .prepare("INSERT INTO user_loaner_loadout (user_id, loaner_vehicle_id, port_id, component_id) VALUES (?, ?, ?, ?)")
        .bind(user, vehicle, port, componentId)
        .run();
    await ll(u1, loaner, portId); // entitled on A and B
    await ll(u3, loaner2, port2Id); // nobody entitled -> primary

    const ms = (user: string, kind: string, owner: number, port: string) =>
      db()
        .prepare(
          "INSERT INTO user_module_selection (user_id, owner_kind, owner_id, port_name, module_uuid, module_kind) VALUES (?, ?, ?, ?, 'mod', 'mining_gadget')",
        )
        .bind(user, kind, owner, port)
        .run();
    await ms(u1, "fleet", fleetOnB, "bay1"); // ship on B
    await ms(u1, "loaner", loaner, "bay2"); // entitled on A and B
    await ms(u1, "fleet", 999999, "gone"); // ship does not exist -> dropped

    const so = (user: string, vehicle: number, pos: number) =>
      db()
        .prepare("INSERT INTO user_localization_ship_order (user_id, vehicle_id, sort_position, custom_label) VALUES (?, ?, ?, ?)")
        .bind(user, vehicle, pos, `L${pos}`)
        .run();
    await so(u1, concept, 1);
    await so(u1, loaner, 2);
    await so(u1, plain, 3);

    const migration = env.TEST_MIGRATIONS.find((m) => m.name === "0286_rsi_account_vehicle_settings.sql");
    expect(migration).toBeDefined();
    for (const q of migration!.queries) await db().prepare(q).run();
  });

  it("stamps fleet module selections with the ship's account", async () => {
    const r = await rows<{ rsi_account_id: number; module_kind: string }>(
      "SELECT rsi_account_id, module_kind FROM user_module_selection WHERE user_id = ? AND owner_kind = 'fleet'",
      u1,
    );
    expect(r).toEqual([{ rsi_account_id: b1, module_kind: "mining_gadget" }]);
  });

  it("copies a loaner loadout to every entitled account", async () => {
    const expected = [a1, b1].sort((x, y) => x - y);
    const r = await rows<{ rsi_account_id: number }>(
      "SELECT rsi_account_id FROM user_loaner_loadout WHERE user_id = ? ORDER BY rsi_account_id",
      u1,
    );
    expect(r.map((x) => x.rsi_account_id)).toEqual(expected);
    const m = await rows<{ rsi_account_id: number }>(
      "SELECT rsi_account_id FROM user_module_selection WHERE user_id = ? AND owner_kind = 'loaner' ORDER BY rsi_account_id",
      u1,
    );
    expect(m.map((x) => x.rsi_account_id)).toEqual(expected);
  });

  it("puts a loaner loadout with no entitled account on the primary", async () => {
    const r = await rows<{ rsi_account_id: number }>(
      "SELECT rsi_account_id FROM user_loaner_loadout WHERE user_id = ?",
      u3,
    );
    expect(r).toEqual([{ rsi_account_id: a3 }]);
  });

  it("moves ship order to the primary account", async () => {
    const r = await rows<{ rsi_account_id: number; sort_position: number; custom_label: string }>(
      "SELECT rsi_account_id, sort_position, custom_label FROM user_localization_ship_order WHERE user_id = ? ORDER BY sort_position",
      u1,
    );
    expect(r).toEqual([
      { rsi_account_id: a1, sort_position: 1, custom_label: "L1" },
      { rsi_account_id: a1, sort_position: 2, custom_label: "L2" },
      { rsi_account_id: a1, sort_position: 3, custom_label: "L3" },
    ]);
  });

  it("allows the same vehicle in two accounts' orders", async () => {
    const ins = (acct: number) =>
      db()
        .prepare("INSERT INTO user_localization_ship_order (user_id, rsi_account_id, vehicle_id, sort_position) VALUES (?, ?, ?, 1)")
        .bind(u2, acct, plain)
        .run();
    await ins(a2);
    const other = await account(u2, "TwoB", false);
    await expect(ins(other)).resolves.toBeDefined();
  });
});
