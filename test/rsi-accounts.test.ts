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
  resolveAccountId,
  claimSyncSlot,
  ACCOUNT_COLORS,
  nextAccountColor,
  releaseSyncSlot,
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

  it("needs mapping (partial) instead of filling a referral another account already holds", () => {
    const noRef = acct({ id: 1, rsi_handle: "Foo", is_primary: 1 });
    const holder = acct({ id: 2, rsi_handle: "Bar", referral_code: "STAR-7" });
    expect(resolveSyncAccount({ handle: "Foo", referralCode: "STAR-7" }, [noRef, holder])).toEqual({
      kind: "needs_mapping",
      reason: "partial",
      candidateId: 1,
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
    const unverified = acct({ id: 3, rsi_handle: "Bar" });
    expect(canMapOnto(unverified, { handle: null, referralCode: null })).toBe(false);
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

describe("claimSyncSlot / releaseSyncSlot", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  async function syncedAt(accountId: number) {
    const row = await env.DB
      .prepare("SELECT synced_at FROM user_rsi_accounts WHERE id = ?")
      .bind(accountId)
      .first<{ synced_at: string | null }>();
    return row!.synced_at;
  }

  it("lets exactly one of two simultaneous claims through", async () => {
    const { userId } = await createTestUser(env.DB);
    const accountId = await getOrCreatePrimaryAccountId(env.DB, userId);
    const claims = await Promise.all([
      claimSyncSlot(env.DB, userId, accountId),
      claimSyncSlot(env.DB, userId, accountId),
    ]);
    expect(claims.filter((c) => c.claimed)).toHaveLength(1);
    expect(await syncedAt(accountId)).not.toBeNull();
  });

  it("refuses a claim within 5 minutes of the last sync and allows one after", async () => {
    const { userId } = await createTestUser(env.DB);
    const accountId = await getOrCreatePrimaryAccountId(env.DB, userId);
    await env.DB
      .prepare("UPDATE user_rsi_accounts SET synced_at = datetime('now', '-4 minutes') WHERE id = ?")
      .bind(accountId)
      .run();
    expect((await claimSyncSlot(env.DB, userId, accountId)).claimed).toBe(false);
    await env.DB
      .prepare("UPDATE user_rsi_accounts SET synced_at = datetime('now', '-6 minutes') WHERE id = ?")
      .bind(accountId)
      .run();
    expect((await claimSyncSlot(env.DB, userId, accountId)).claimed).toBe(true);
  });

  it("reads an ISO-format last sync time correctly", async () => {
    const { userId } = await createTestUser(env.DB);
    const accountId = await getOrCreatePrimaryAccountId(env.DB, userId);
    await env.DB
      .prepare("UPDATE user_rsi_accounts SET synced_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 minutes') WHERE id = ?")
      .bind(accountId)
      .run();
    expect((await claimSyncSlot(env.DB, userId, accountId)).claimed).toBe(false);
  });

  it("does not claim another user's account", async () => {
    const owner = await createTestUser(env.DB);
    const other = await createTestUser(env.DB);
    const accountId = await getOrCreatePrimaryAccountId(env.DB, owner.userId);
    expect((await claimSyncSlot(env.DB, other.userId, accountId)).claimed).toBe(false);
    expect(await syncedAt(accountId)).toBeNull();
  });

  it("release puts the previous sync time back so a failed sync can be retried", async () => {
    const { userId } = await createTestUser(env.DB);
    const accountId = await getOrCreatePrimaryAccountId(env.DB, userId);
    await env.DB
      .prepare("UPDATE user_rsi_accounts SET synced_at = '2026-01-01 00:00:00' WHERE id = ?")
      .bind(accountId)
      .run();
    const claim = await claimSyncSlot(env.DB, userId, accountId);
    expect(claim).toEqual({ claimed: true, previous: "2026-01-01 00:00:00" });
    await releaseSyncSlot(env.DB, userId, accountId, claim.previous);
    expect(await syncedAt(accountId)).toBe("2026-01-01 00:00:00");
    expect((await claimSyncSlot(env.DB, userId, accountId)).claimed).toBe(true);
  });
});

describe("account colours", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  it("nextAccountColor picks the first unused palette colour", () => {
    expect(ACCOUNT_COLORS).toEqual([
      "#22d3ee", "#f97316", "#a855f7", "#84cc16", "#f43f5e",
      "#eab308", "#3b82f6", "#10b981", "#ec4899", "#94a3b8",
    ]);
    expect(nextAccountColor([])).toBe("#22d3ee");
    expect(nextAccountColor(["#22d3ee", "#a855f7"])).toBe("#f97316");
    expect(nextAccountColor([null, "#22d3ee"])).toBe("#f97316");
    expect(nextAccountColor([...ACCOUNT_COLORS])).toBe(ACCOUNT_COLORS[0]);
    expect(nextAccountColor([...ACCOUNT_COLORS, "#22d3ee"])).toBe(ACCOUNT_COLORS[1]);
  });

  it("createRsiAccount gives each new account a different colour", async () => {
    const { userId } = await createTestUser(env.DB);
    const real = { referralCode: null, placeholder: false };
    await createRsiAccount(env.DB, userId, { handle: "A", ...real });
    await createRsiAccount(env.DB, userId, { handle: "B", ...real });
    await createRsiAccount(env.DB, userId, { handle: "C", ...real });
    const { results } = await env.DB
      .prepare("SELECT color FROM user_rsi_accounts WHERE user_id = ? ORDER BY id")
      .bind(userId)
      .all<{ color: string | null }>();
    expect(results.map((r) => r.color)).toEqual(ACCOUNT_COLORS.slice(0, 3));
  });

  it("createRsiAccount refills a colour freed by a deleted account", async () => {
    const { userId } = await createTestUser(env.DB);
    const real = { referralCode: null, placeholder: false };
    await createRsiAccount(env.DB, userId, { handle: "A", ...real });
    const b = await createRsiAccount(env.DB, userId, { handle: "B", ...real });
    await createRsiAccount(env.DB, userId, { handle: "C", ...real });
    await deleteRsiAccount(env.DB, userId, b);
    const d = await createRsiAccount(env.DB, userId, { handle: "D", ...real });
    const row = await env.DB.prepare("SELECT color FROM user_rsi_accounts WHERE id = ?").bind(d).first<{ color: string }>();
    expect(row!.color).toBe(ACCOUNT_COLORS[1]);
  });

  it("getOrCreatePrimaryAccountId gives the placeholder the first colour", async () => {
    const { userId } = await createTestUser(env.DB);
    const id = await getOrCreatePrimaryAccountId(env.DB, userId);
    const row = await env.DB.prepare("SELECT color FROM user_rsi_accounts WHERE id = ?").bind(id).first<{ color: string }>();
    expect(row!.color).toBe("#22d3ee");
  });

  // readFileSync does not work in the worker runtime, so the 0285 backfill is
  // inlined. Must match src/db/migrations/0285_rsi_account_color.sql.
  const BACKFILL = `UPDATE user_rsi_accounts SET color = (
    SELECT CASE (r.rn - 1) % 10
      WHEN 0 THEN '#22d3ee' WHEN 1 THEN '#f97316' WHEN 2 THEN '#a855f7' WHEN 3 THEN '#84cc16'
      WHEN 4 THEN '#f43f5e' WHEN 5 THEN '#eab308' WHEN 6 THEN '#3b82f6' WHEN 7 THEN '#10b981'
      WHEN 8 THEN '#ec4899' WHEN 9 THEN '#94a3b8' END
    FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY id) AS rn FROM user_rsi_accounts) r
    WHERE r.id = user_rsi_accounts.id
  ) WHERE color IS NULL`;

  it("0285 backfill colours existing accounts per user by id order", async () => {
    const u1 = (await createTestUser(env.DB)).userId;
    const u2 = (await createTestUser(env.DB)).userId;
    const ins = async (u: string) =>
      (await env.DB.prepare("INSERT INTO user_rsi_accounts (user_id, color) VALUES (?, NULL) RETURNING id").bind(u).first<{ id: number }>())!.id;
    const a1 = await ins(u1);
    const a2 = await ins(u1);
    const a3 = await ins(u1);
    const b1 = await ins(u2);
    await env.DB.prepare(BACKFILL).run();
    const colour = async (id: number) =>
      (await env.DB.prepare("SELECT color FROM user_rsi_accounts WHERE id = ?").bind(id).first<{ color: string }>())!.color;
    expect([await colour(a1), await colour(a2), await colour(a3)]).toEqual(ACCOUNT_COLORS.slice(0, 3));
    expect(await colour(b1)).toBe(ACCOUNT_COLORS[0]);
  });
});

describe("resolveAccountId", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  it("returns primary for no value, the id for an owned one, null for a foreign or bad id", async () => {
    const { userId } = await createTestUser(env.DB);
    const other = await createTestUser(env.DB);
    const primaryId = await createRsiAccount(env.DB, userId, { handle: "RA1", referralCode: null, placeholder: false });
    const second = await createRsiAccount(env.DB, userId, { handle: "RA2", referralCode: null, placeholder: false });
    const foreign = await createRsiAccount(env.DB, other.userId, { handle: "RA3", referralCode: null, placeholder: false });

    expect(await resolveAccountId(env.DB, userId, undefined)).toBe(primaryId);
    expect(await resolveAccountId(env.DB, userId, null)).toBe(primaryId);
    expect(await resolveAccountId(env.DB, userId, second)).toBe(second);
    expect(await resolveAccountId(env.DB, userId, String(second))).toBe(second);
    expect(await resolveAccountId(env.DB, userId, foreign)).toBeNull();
    expect(await resolveAccountId(env.DB, userId, "abc")).toBeNull();
    expect(await resolveAccountId(env.DB, userId, "1.5")).toBeNull();
    expect(await resolveAccountId(env.DB, userId, 0)).toBeNull();
    expect(await resolveAccountId(env.DB, userId, 987654321)).toBeNull();
  });
});

describe("deleteRsiAccount vehicle settings", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  it("removes the account's loaner loadouts, module selections and ship order", async () => {
    const { userId } = await createTestUser(env.DB);
    const a = await createRsiAccount(env.DB, userId, { handle: "DV1", referralCode: null, placeholder: false });
    const b = await createRsiAccount(env.DB, userId, { handle: "DV2", referralCode: null, placeholder: false });
    const veh = await seedVehicle(env.DB, { slug: "zzdv-ship", name: "Zzdv Ship" });
    await env.DB
      .prepare("INSERT INTO vehicle_ports (uuid, vehicle_id, name, port_type, game_version_id) VALUES ('zzdv-p', ?, 'p', 'shield', 1)")
      .bind(veh)
      .run();
    const port = (await env.DB.prepare("SELECT id FROM vehicle_ports WHERE uuid = 'zzdv-p'").first<{ id: number }>())!.id;
    await env.DB
      .prepare(
        `INSERT INTO vehicle_components (uuid, name, slug, type, size, grade, game_version_id, created_at, updated_at)
         VALUES ('zzdv-c', 'C', 'zzdv-c', 'shield', 1, 1, 1, datetime('now'), datetime('now'))`,
      )
      .run();
    const comp = (await env.DB.prepare("SELECT id FROM vehicle_components WHERE uuid = 'zzdv-c'").first<{ id: number }>())!.id;

    for (const acct of [a, b]) {
      await env.DB
        .prepare("INSERT INTO user_loaner_loadout (user_id, rsi_account_id, loaner_vehicle_id, port_id, component_id) VALUES (?, ?, ?, ?, ?)")
        .bind(userId, acct, veh, port, comp)
        .run();
      await env.DB
        .prepare("INSERT INTO user_module_selection (user_id, rsi_account_id, owner_kind, owner_id, port_name, module_uuid) VALUES (?, ?, 'loaner', ?, 'bay', 'm')")
        .bind(userId, acct, veh)
        .run();
      await env.DB
        .prepare("INSERT INTO user_localization_ship_order (user_id, rsi_account_id, vehicle_id, sort_position) VALUES (?, ?, ?, 1)")
        .bind(userId, acct, veh)
        .run();
    }

    await deleteRsiAccount(env.DB, userId, a);

    for (const t of ["user_loaner_loadout", "user_module_selection", "user_localization_ship_order"]) {
      const left = await env.DB
        .prepare(`SELECT rsi_account_id FROM ${t} WHERE user_id = ?`)
        .bind(userId)
        .all<{ rsi_account_id: number }>();
      expect(left.results.map((r) => r.rsi_account_id)).toEqual([b]);
    }
  });
});

describe("deleteRsiAccount cleanup buys, state and gifts", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  it("removes its buys and state and clears gifts aimed at it", async () => {
    const { userId } = await createTestUser(env.DB);
    const a = await createRsiAccount(env.DB, userId, { handle: "CG1", referralCode: null, placeholder: false });
    const b = await createRsiAccount(env.DB, userId, { handle: "CG2", referralCode: null, placeholder: false });
    const veh = await seedVehicle(env.DB);

    for (const acct of [a, b]) {
      await env.DB
        .prepare("INSERT INTO user_hangar_cleanup_buys (user_id, rsi_account_id, vehicle_id) VALUES (?, ?, ?)")
        .bind(userId, acct, veh)
        .run();
      await env.DB
        .prepare("INSERT INTO user_hangar_cleanup_state (user_id, rsi_account_id, credit_override_cents) VALUES (?, ?, 5)")
        .bind(userId, acct)
        .run();
    }
    const gift = (pledge: number, target: number) =>
      env.DB
        .prepare(
          "INSERT INTO user_hangar_cleanup_decisions (user_id, rsi_pledge_id, decision, gift_to_account_id) VALUES (?, ?, 'gift', ?)",
        )
        .bind(userId, pledge, target)
        .run();
    await gift(7001, a);
    await gift(7002, b);
    // 7001 also carries an in-game buy flag, so it survives the reset (an empty row would not).
    await env.DB
      .prepare("UPDATE user_hangar_cleanup_decisions SET buy_ingame = 1 WHERE user_id = ? AND rsi_pledge_id = 7001")
      .bind(userId)
      .run();

    await deleteRsiAccount(env.DB, userId, a);

    for (const t of ["user_hangar_cleanup_buys", "user_hangar_cleanup_state"]) {
      const left = await env.DB
        .prepare(`SELECT rsi_account_id FROM ${t} WHERE user_id = ?`)
        .bind(userId)
        .all<{ rsi_account_id: number }>();
      expect(left.results.map((r) => r.rsi_account_id)).toEqual([b]);
    }
    const dec = await env.DB
      .prepare(
        "SELECT rsi_pledge_id, decision, gift_to_account_id FROM user_hangar_cleanup_decisions WHERE user_id = ? ORDER BY rsi_pledge_id",
      )
      .bind(userId)
      .all<{ rsi_pledge_id: number; decision: string | null; gift_to_account_id: number | null }>();
    expect(dec.results).toEqual([
      { rsi_pledge_id: 7001, decision: null, gift_to_account_id: null },
      { rsi_pledge_id: 7002, decision: "gift", gift_to_account_id: b },
    ]);
  });

  it("deletes a gift-target row that carries nothing else once the target is gone", async () => {
    const { userId } = await createTestUser(env.DB);
    const a = await createRsiAccount(env.DB, userId, { handle: "CE1", referralCode: null, placeholder: false });
    const b = await createRsiAccount(env.DB, userId, { handle: "CE2", referralCode: null, placeholder: false });
    const insert = (pledge: number, target: number, price: number | null) =>
      env.DB
        .prepare(
          `INSERT INTO user_hangar_cleanup_decisions (user_id, rsi_pledge_id, decision, gift_to_account_id, iae_price_cents)
           VALUES (?, ?, 'gift', ?, ?)`,
        )
        .bind(userId, pledge, target, price)
        .run();
    await insert(7101, a, null); // nothing but the gift: row goes
    await insert(7102, a, 5000); // an IAE price too: row stays
    await insert(7103, b, null); // aimed elsewhere: untouched

    await deleteRsiAccount(env.DB, userId, a);

    const rows = await env.DB
      .prepare(
        "SELECT rsi_pledge_id, decision, iae_price_cents FROM user_hangar_cleanup_decisions WHERE user_id = ? ORDER BY rsi_pledge_id",
      )
      .bind(userId)
      .all();
    expect(rows.results).toEqual([
      { rsi_pledge_id: 7102, decision: null, iae_price_cents: 5000 },
      { rsi_pledge_id: 7103, decision: "gift", iae_price_cents: null },
    ]);
  });
});
