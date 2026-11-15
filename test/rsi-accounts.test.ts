import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders, seedVehicle } from "./helpers";
import {
  getOrCreatePrimaryAccountId,
  identityFromPayload,
  resolveSyncAccount,
  canAddAccount,
  canMapOnto,
  multiAccountEnabled,
  listRsiAccounts,
  createRsiAccount,
  deleteRsiAccount,
  type RsiAccountRow,
} from "../src/lib/rsi-accounts";

/**
 * Multi-account support (migration 0284): every hangar row belongs to one of
 * the user's RSI accounts. Until account matching lands, each user has one
 * primary account, created as a placeholder on first need.
 */

describe("getOrCreatePrimaryAccountId", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  it("creates a placeholder primary account for a user who has none", async () => {
    const { userId } = await createTestUser(env.DB);

    const id = await getOrCreatePrimaryAccountId(env.DB, userId);

    const row = await env.DB
      .prepare(
        `SELECT id, user_id, is_primary, is_placeholder, label, rsi_handle, referral_code
         FROM user_rsi_accounts WHERE user_id = ?`,
      )
      .bind(userId)
      .all();
    expect(row.results).toEqual([
      {
        id,
        user_id: userId,
        is_primary: 1,
        is_placeholder: 1,
        label: "Imported hangar",
        rsi_handle: null,
        referral_code: null,
      },
    ]);
  });

  it("returns the same id on a second call", async () => {
    const { userId } = await createTestUser(env.DB);

    const first = await getOrCreatePrimaryAccountId(env.DB, userId);
    const second = await getOrCreatePrimaryAccountId(env.DB, userId);

    expect(second).toBe(first);
    const count = await env.DB
      .prepare("SELECT COUNT(*) AS n FROM user_rsi_accounts WHERE user_id = ?")
      .bind(userId)
      .first<{ n: number }>();
    expect(count!.n).toBe(1);
  });
});

describe("POST /api/import/hangar-sync — rsi_account_id stamping", () => {
  let paintId = 0;
  let defaultPaintId = 0;

  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    const vehicleId = await seedVehicle(env.DB, { slug: "zzacct-testship", name: "Zzacct Testship" });
    await env.DB
      .prepare("INSERT INTO paints (name, class_name, is_base_variant) VALUES ('Zzacct Blue Livery', 'zzacct_blue', 0)")
      .run();
    await env.DB
      .prepare("INSERT INTO paints (name, class_name, is_base_variant) VALUES ('Zzacct Default Livery', 'zzacct_default', 0)")
      .run();
    paintId = (await env.DB.prepare("SELECT id FROM paints WHERE class_name = 'zzacct_blue'").first<{ id: number }>())!.id;
    defaultPaintId = (await env.DB.prepare("SELECT id FROM paints WHERE class_name = 'zzacct_default'").first<{ id: number }>())!.id;
    await env.DB
      .prepare("INSERT INTO paint_vehicles (paint_id, vehicle_id, is_default_for_vehicle) VALUES (?, ?, 1)")
      .bind(defaultPaintId, vehicleId)
      .run();
  });

  it("stamps every user_fleet, user_pledges and user_paints row with the primary account id", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const body = {
      pledges: [
        {
          id: 8101,
          name: "Standalone Ship - Zzacct Testship",
          value: "$50.00 USD",
          valueCents: 5000,
          currency: "New Money",
          date: "May 1, 2023",
          isUpgraded: false,
          isReclaimable: true,
          isGiftable: true,
          isWarbond: false,
          items: [
            { title: "Zzacct Testship", kind: "Ship" },
            { title: "Zzacct Blue Paint", kind: "Skin" },
          ],
          upgradeData: null,
        },
      ],
      buyback_pledges: [],
      upgrades: [],
      account: { nickname: "acct-tester", displayname: "Acct Tester" },
      named_ships: [],
      sync_meta: { extension_version: "0.6.2", synced_at: "2026-11-15T00:00:00Z" },
    };

    const res = await SELF.fetch("http://localhost/api/import/hangar-sync", {
      method: "POST",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(200);

    const accountId = await getOrCreatePrimaryAccountId(env.DB, userId);

    const fleet = await env.DB
      .prepare("SELECT rsi_account_id FROM user_fleet WHERE user_id = ?")
      .bind(userId)
      .all<{ rsi_account_id: number | null }>();
    expect(fleet.results.length).toBe(1);
    expect(fleet.results.every((r) => r.rsi_account_id === accountId)).toBe(true);

    const pledges = await env.DB
      .prepare("SELECT rsi_account_id FROM user_pledges WHERE user_id = ?")
      .bind(userId)
      .all<{ rsi_account_id: number | null }>();
    expect(pledges.results.length).toBe(1);
    expect(pledges.results.every((r) => r.rsi_account_id === accountId)).toBe(true);

    const paints = await env.DB
      .prepare("SELECT paint_id, rsi_account_id FROM user_paints WHERE user_id = ? ORDER BY paint_id")
      .bind(userId)
      .all<{ paint_id: number; rsi_account_id: number | null }>();
    expect(paints.results.map((r) => r.paint_id).sort()).toEqual([paintId, defaultPaintId].sort());
    expect(paints.results.every((r) => r.rsi_account_id === accountId)).toBe(true);
  });
});

function acct(over: Partial<RsiAccountRow> & { id: number }): RsiAccountRow {
  return {
    rsi_handle: null,
    referral_code: null,
    label: null,
    is_primary: 0,
    is_placeholder: 0,
    verified_at: null,
    synced_at: null,
    ...over,
  };
}

describe("resolveSyncAccount", () => {
  const foo = acct({ id: 1, rsi_handle: "Foo", referral_code: "STAR-1", is_primary: 1 });

  it("returns first when the user has no accounts", () => {
    expect(resolveSyncAccount({ handle: "Foo", referralCode: "STAR-1" }, [])).toEqual({ kind: "first" });
  });

  it("matches on handle (case-insensitive) and referral", () => {
    expect(resolveSyncAccount({ handle: "foo", referralCode: "STAR-1" }, [foo])).toEqual({
      kind: "matched",
      accountId: 1,
      fillReferral: false,
    });
  });

  it("matches on handle and asks to fill a missing stored referral", () => {
    const noRef = acct({ id: 1, rsi_handle: "Foo", is_primary: 1 });
    expect(resolveSyncAccount({ handle: "Foo", referralCode: "STAR-1" }, [noRef])).toEqual({
      kind: "matched",
      accountId: 1,
      fillReferral: true,
    });
  });

  it("needs mapping (partial) when referral matches but handle differs", () => {
    expect(resolveSyncAccount({ handle: "Bar", referralCode: "STAR-1" }, [foo])).toEqual({
      kind: "needs_mapping",
      reason: "partial",
      candidateId: 1,
    });
  });

  it("needs mapping (partial) when handle matches but referral differs", () => {
    expect(resolveSyncAccount({ handle: "Foo", referralCode: "STAR-2" }, [foo])).toEqual({
      kind: "needs_mapping",
      reason: "partial",
      candidateId: 1,
    });
  });

  it("needs mapping (unknown) when nothing matches", () => {
    expect(resolveSyncAccount({ handle: "Bar", referralCode: "STAR-9" }, [foo])).toEqual({
      kind: "needs_mapping",
      reason: "unknown",
      candidateId: null,
    });
  });

  it("needs mapping (no_identity) when the payload has no identity", () => {
    expect(resolveSyncAccount({ handle: null, referralCode: null }, [foo])).toEqual({
      kind: "needs_mapping",
      reason: "no_identity",
      candidateId: null,
    });
  });

  it("never matches a placeholder account", () => {
    const placeholder = acct({ id: 2, rsi_handle: "Foo", referral_code: "STAR-1", is_placeholder: 1, is_primary: 1 });
    const res = resolveSyncAccount({ handle: "Foo", referralCode: "STAR-1" }, [placeholder]);
    expect(res.kind).toBe("needs_mapping");
  });
});

describe("canAddAccount / canMapOnto / multiAccountEnabled / identityFromPayload", () => {
  it("canAddAccount enforces the cap", () => {
    expect(canAddAccount({ enabled: false, accountCount: 0 })).toBe(true);
    expect(canAddAccount({ enabled: false, accountCount: 1 })).toBe(false);
    expect(canAddAccount({ enabled: true, accountCount: 9 })).toBe(true);
    expect(canAddAccount({ enabled: true, accountCount: 10 })).toBe(false);
  });

  it("canMapOnto refuses a placeholder only when the identity is empty", () => {
    const placeholder = acct({ id: 1, is_placeholder: 1 });
    const verified = acct({ id: 2, rsi_handle: "Foo", verified_at: "2026-01-01" });
    expect(canMapOnto(placeholder, { handle: null, referralCode: null })).toBe(false);
    expect(canMapOnto(placeholder, { handle: "Foo", referralCode: null })).toBe(true);
    expect(canMapOnto(verified, { handle: null, referralCode: null })).toBe(true);
  });

  it("multiAccountEnabled is false only in production", () => {
    expect(multiAccountEnabled({ ENVIRONMENT: "production" })).toBe(false);
    expect(multiAccountEnabled({ ENVIRONMENT: "staging" })).toBe(true);
    expect(multiAccountEnabled({})).toBe(true);
  });

  it("identityFromPayload trims and nulls empties", () => {
    expect(identityFromPayload({ nickname: " Foo ", referral_code: "STAR-1" })).toEqual({
      handle: "Foo",
      referralCode: "STAR-1",
    });
    expect(identityFromPayload(null)).toEqual({ handle: null, referralCode: null });
    expect(identityFromPayload({ nickname: "  ", referral_code: "" })).toEqual({
      handle: null,
      referralCode: null,
    });
  });
});

describe("createRsiAccount / listRsiAccounts / deleteRsiAccount", () => {
  let vehicleId = 0;
  let paintA = 0;
  let paintB = 0;

  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    vehicleId = await seedVehicle(env.DB, { slug: "zzdel-testship", name: "Zzdel Testship" });
    await env.DB.prepare("INSERT INTO paints (name, class_name, is_base_variant) VALUES ('Zzdel A', 'zzdel_a', 0)").run();
    await env.DB.prepare("INSERT INTO paints (name, class_name, is_base_variant) VALUES ('Zzdel B', 'zzdel_b', 0)").run();
    paintA = (await env.DB.prepare("SELECT id FROM paints WHERE class_name = 'zzdel_a'").first<{ id: number }>())!.id;
    paintB = (await env.DB.prepare("SELECT id FROM paints WHERE class_name = 'zzdel_b'").first<{ id: number }>())!.id;
  });

  it("makes the first account primary and later ones not, listed by id", async () => {
    const { userId } = await createTestUser(env.DB);
    const a = await createRsiAccount(env.DB, userId, { handle: "One", referralCode: "STAR-A", placeholder: false });
    const b = await createRsiAccount(env.DB, userId, { handle: "Two", referralCode: null, placeholder: false });
    const p = await createRsiAccount(env.DB, userId, { handle: null, referralCode: null, placeholder: true });

    const rows = await listRsiAccounts(env.DB, userId);
    expect(rows.map((r) => r.id)).toEqual([a, b, p]);
    expect(rows.map((r) => r.is_primary)).toEqual([1, 0, 0]);
    expect(rows[2].is_placeholder).toBe(1);
    expect(rows[2].label).toBe("Imported hangar");
  });

  async function seedAccountRows(userId: string, accountId: number, pledgeId: number, paintId: number) {
    const sync = await env.DB
      .prepare("INSERT INTO user_hangar_syncs (user_id, rsi_account_id) VALUES (?, ?) RETURNING id")
      .bind(userId, accountId)
      .first<{ id: number }>();
    const pledge = await env.DB
      .prepare(
        "INSERT INTO user_pledges (user_id, sync_id, rsi_pledge_id, name, rsi_account_id) VALUES (?, ?, ?, 'P', ?) RETURNING id",
      )
      .bind(userId, sync!.id, pledgeId, accountId)
      .first<{ id: number }>();
    await env.DB
      .prepare("INSERT INTO user_pledge_items (user_id, user_pledge_id, title, rsi_account_id) VALUES (?, ?, 'Item', ?)")
      .bind(userId, pledge!.id, accountId)
      .run();
    const fleet = await env.DB
      .prepare("INSERT INTO user_fleet (user_id, vehicle_id, rsi_account_id) VALUES (?, ?, ?) RETURNING id")
      .bind(userId, vehicleId, accountId)
      .first<{ id: number }>();
    await env.DB
      .prepare("INSERT INTO user_paints (user_id, rsi_account_id, paint_id) VALUES (?, ?, ?)")
      .bind(userId, accountId, paintId)
      .run();
    await env.DB
      .prepare(
        "INSERT INTO user_module_selection (user_id, owner_kind, owner_id, port_name, module_uuid) VALUES (?, 'fleet', ?, 'bay', 'u')",
      )
      .bind(userId, fleet!.id)
      .run();
    await env.DB
      .prepare("INSERT INTO user_hangar_cleanup_decisions (user_id, rsi_pledge_id, decision) VALUES (?, ?, 'keep')")
      .bind(userId, pledgeId)
      .run();
    return fleet!.id;
  }

  it("deletes only the target account's rows and promotes the other to primary", async () => {
    const { userId } = await createTestUser(env.DB);
    const a = await createRsiAccount(env.DB, userId, { handle: "One", referralCode: null, placeholder: false });
    const b = await createRsiAccount(env.DB, userId, { handle: "Two", referralCode: null, placeholder: false });
    const fleetA = await seedAccountRows(userId, a, 9001, paintA);
    await seedAccountRows(userId, b, 9002, paintB);

    // An org op ship pointing at the doomed fleet row has no cascade and must not block deletion.
    await env.DB.prepare("INSERT OR IGNORE INTO op_types (key, label) VALUES ('zzdel', 'Zzdel')").run();
    const opType = await env.DB.prepare("SELECT id FROM op_types WHERE key = 'zzdel'").first<{ id: number }>();
    const op = await env.DB
      .prepare("INSERT INTO org_ops (org_id, name, op_type_id, created_by) VALUES ('zzdel-org', 'Op', ?, ?) RETURNING id")
      .bind(opType!.id, userId)
      .first<{ id: number }>();
    await env.DB
      .prepare("INSERT INTO org_op_ships (org_op_id, user_fleet_id, owner_user_id) VALUES (?, ?, ?)")
      .bind(op!.id, fleetA, userId)
      .run();

    await deleteRsiAccount(env.DB, userId, a);

    const count = async (table: string, accountId: number) =>
      (await env.DB
        .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ? AND rsi_account_id = ?`)
        .bind(userId, accountId)
        .first<{ n: number }>())!.n;
    for (const t of ["user_fleet", "user_pledges", "user_pledge_items", "user_paints", "user_hangar_syncs"]) {
      expect(await count(t, a)).toBe(0);
      expect(await count(t, b)).toBe(1);
    }

    const ships = await env.DB
      .prepare("SELECT COUNT(*) AS n FROM org_op_ships WHERE user_fleet_id = ?")
      .bind(fleetA)
      .first<{ n: number }>();
    expect(ships!.n).toBe(0);
    const decisions = await env.DB
      .prepare("SELECT rsi_pledge_id FROM user_hangar_cleanup_decisions WHERE user_id = ?")
      .bind(userId)
      .all<{ rsi_pledge_id: number }>();
    expect(decisions.results.map((r) => r.rsi_pledge_id)).toEqual([9002]);
    const mods = await env.DB
      .prepare("SELECT COUNT(*) AS n FROM user_module_selection WHERE user_id = ?")
      .bind(userId)
      .first<{ n: number }>();
    expect(mods!.n).toBe(1);

    const accounts = await listRsiAccounts(env.DB, userId);
    expect(accounts.map((r) => [r.id, r.is_primary])).toEqual([[b, 1]]);
  });

  it("refuses to delete another user's account", async () => {
    const { userId } = await createTestUser(env.DB);
    const { userId: other } = await createTestUser(env.DB);
    const theirs = await createRsiAccount(env.DB, other, { handle: "Theirs", referralCode: null, placeholder: false });

    await expect(deleteRsiAccount(env.DB, userId, theirs)).rejects.toThrow("RSI account not found");
    expect((await listRsiAccounts(env.DB, other)).length).toBe(1);
  });
});
