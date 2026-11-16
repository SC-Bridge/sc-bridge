import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders, seedVehicle } from "./helpers";
import { getOrCreatePrimaryAccountId, MAX_RSI_ACCOUNTS } from "../src/lib/rsi-accounts";

/**
 * Multi-account hangar sync: /api/import/hangar-sync resolves which of the
 * user's RSI accounts a payload belongs to, and every write, delete and sweep
 * is confined to that account.
 */

const HANGAR_TABLES = [
  "user_fleet",
  "user_pledges",
  "user_pledge_items",
  "user_pledge_upgrades",
  "user_buyback_pledges",
  "user_paints",
  "user_hangar_syncs",
] as const;

interface PayloadOpts {
  handle?: string | null;
  referral?: string | null;
  pledgeIds: number[];
  shipTitle?: string;
  paintTitle?: string;
  storeCredit?: number;
  displayName?: string;
  noAccount?: boolean;
  target?: { mode: "new" } | { mode: "map"; rsi_account_id: number };
}

function makePayload(opts: PayloadOpts) {
  const shipTitle = opts.shipTitle ?? "Zzma Shipa";
  const paintTitle = opts.paintTitle ?? "Zzma Red Paint";
  return {
    pledges: opts.pledgeIds.map((id) => ({
      id,
      name: `Standalone Ship - ${shipTitle} ${id}`,
      value: "$50.00 USD",
      valueCents: 5000,
      currency: "New Money",
      date: "May 1, 2023",
      isUpgraded: false,
      isReclaimable: true,
      isGiftable: true,
      isWarbond: false,
      items: [
        { title: shipTitle, kind: "Ship" },
        { title: paintTitle, kind: "Skin" },
        { title: "Lifetime Insurance", kind: "Insurance" },
      ],
      upgradeData: null,
    })),
    buyback_pledges: opts.pledgeIds.map((id) => ({
      id: id + 900000,
      name: `Gear - Thing ${id}`,
      value_cents: 1000,
      date: "May 1, 2023",
      is_credit_reclaimable: false,
      items: [],
    })),
    upgrades: opts.pledgeIds.map((id) => ({
      pledge_id: id,
      name: `Upgrade ${id}`,
      applied_at: "May 2, 2023",
      new_value: "$60.00 USD",
    })),
    account: opts.noAccount
      ? null
      : {
          nickname: opts.handle ?? null,
          referral_code: opts.referral ?? null,
          displayname: opts.displayName ?? "Display",
          store_credit_cents: opts.storeCredit ?? 1000,
        },
    named_ships: [],
    sync_meta: { extension_version: "0.6.2", synced_at: "2026-11-15T00:00:00Z" },
    ...(opts.target ? { target: opts.target } : {}),
  };
}

async function sync(sessionToken: string, body: unknown) {
  return SELF.fetch("http://localhost/api/import/hangar-sync", {
    method: "POST",
    headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function xplorEntry(name: string, pledgeId: number) {
  return {
    ship_code: name.replace(" ", "_").toUpperCase(),
    manufacturer_code: "ZZ",
    manufacturer_name: "Zzma",
    lti: true,
    name,
    warbond: false,
    entity_type: "ship",
    pledge_id: String(pledgeId),
    pledge_name: `Standalone Ship - ${name}`,
    pledge_date: "May 1, 2023",
    pledge_cost: "$50.00 USD",
  };
}

async function hangarXplor(sessionToken: string, body: unknown, accountId?: number) {
  const qs = accountId === undefined ? "" : `?rsi_account_id=${accountId}`;
  return SELF.fetch(`http://localhost/api/import/hangarxplor${qs}`, {
    method: "POST",
    headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Move every account's last sync back past the 5-minute rate limit. */
async function pastRateLimit(userId: string) {
  await env.DB
    .prepare("UPDATE user_rsi_accounts SET synced_at = datetime('now', '-10 minutes') WHERE user_id = ?")
    .bind(userId)
    .run();
}

async function accountsOf(userId: string) {
  const { results } = await env.DB
    .prepare(
      `SELECT id, rsi_handle, referral_code, label, is_primary, is_placeholder, verified_at,
              display_name, store_credit_cents
       FROM user_rsi_accounts WHERE user_id = ? ORDER BY id`,
    )
    .bind(userId)
    .all<{
      id: number;
      rsi_handle: string | null;
      referral_code: string | null;
      label: string | null;
      is_primary: number;
      is_placeholder: number;
      verified_at: string | null;
      display_name: string | null;
      store_credit_cents: number | null;
    }>();
  return results;
}

async function countFor(table: string, userId: string, accountId: number) {
  const row = await env.DB
    .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ? AND rsi_account_id = ?`)
    .bind(userId, accountId)
    .first<{ n: number }>();
  return row!.n;
}

async function countsFor(userId: string, accountId: number) {
  const out: Record<string, number> = {};
  for (const t of HANGAR_TABLES) out[t] = await countFor(t, userId, accountId);
  return out;
}

async function pledgeIdsOf(userId: string, accountId: number) {
  const { results } = await env.DB
    .prepare("SELECT rsi_pledge_id FROM user_pledges WHERE user_id = ? AND rsi_account_id = ? ORDER BY rsi_pledge_id")
    .bind(userId, accountId)
    .all<{ rsi_pledge_id: number }>();
  return results.map((r) => r.rsi_pledge_id);
}

describe("POST /api/import/hangar-sync — multi-account", () => {
  let shipAId = 0;
  let paintXId = 0;
  let portId = 0;
  let componentId = 0;

  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    shipAId = await seedVehicle(env.DB, { slug: "zzma-shipa", name: "Zzma Shipa" });
    await seedVehicle(env.DB, { slug: "zzma-shipb", name: "Zzma Shipb" });
    await env.DB
      .prepare("INSERT INTO paints (name, class_name, is_base_variant) VALUES ('Zzma Red Livery', 'zzma_red', 0)")
      .run();
    await env.DB
      .prepare("INSERT INTO paints (name, class_name, is_base_variant) VALUES ('Zzma Blue Livery', 'zzma_blue', 0)")
      .run();
    paintXId = (await env.DB.prepare("SELECT id FROM paints WHERE class_name = 'zzma_red'").first<{ id: number }>())!.id;
    await env.DB
      .prepare("INSERT INTO paint_vehicles (paint_id, vehicle_id, is_default_for_vehicle) VALUES (?, ?, 0)")
      .bind(paintXId, shipAId)
      .run();
    await env.DB
      .prepare(
        `INSERT INTO vehicle_components (uuid, name, slug, type, size, grade, manufacturer_id, game_version_id, created_at, updated_at)
         VALUES ('zzma-comp','Zzma Comp','zzma-comp','Shield',1,1,NULL,1,datetime('now'),datetime('now'))`,
      )
      .run();
    componentId = (await env.DB.prepare("SELECT id FROM vehicle_components WHERE uuid = 'zzma-comp'").first<{ id: number }>())!.id;
    await env.DB
      .prepare("INSERT INTO vehicle_ports (uuid, vehicle_id, name, port_type, game_version_id) VALUES ('zzma-port', ?, 'p', 'shield', 1)")
      .bind(shipAId)
      .run();
    portId = (await env.DB.prepare("SELECT id FROM vehicle_ports WHERE uuid = 'zzma-port'").first<{ id: number }>())!.id;
  });

  it("first sync creates a primary account and stamps every hangar table", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const res = await sync(sessionToken, makePayload({ handle: "AlphaOne", referral: "STAR-A1", pledgeIds: [1001, 1002] }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rsi_account_id: number };

    const accounts = await accountsOf(userId);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ rsi_handle: "AlphaOne", referral_code: "STAR-A1", is_primary: 1, is_placeholder: 0 });
    expect(body.rsi_account_id).toBe(accounts[0].id);

    for (const t of HANGAR_TABLES) {
      const all = await env.DB
        .prepare(`SELECT COUNT(*) AS n, SUM(rsi_account_id = ?) AS stamped FROM ${t} WHERE user_id = ?`)
        .bind(accounts[0].id, userId)
        .first<{ n: number; stamped: number }>();
      expect(all!.n, t).toBeGreaterThan(0);
      expect(all!.stamped, t).toBe(all!.n);
    }
  });

  it("same identity updates the same account", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    expect((await sync(sessionToken, makePayload({ handle: "Same", referral: "STAR-S", pledgeIds: [1101] }))).status).toBe(200);
    await pastRateLimit(userId);
    const res = await sync(sessionToken, makePayload({ handle: "same", referral: "STAR-S", pledgeIds: [1102] }));
    expect(res.status).toBe(200);

    const accounts = await accountsOf(userId);
    expect(accounts).toHaveLength(1);
    expect(await pledgeIdsOf(userId, accounts[0].id)).toEqual([1102]);
  });

  it("unknown identity returns needs_mapping without writing anything", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    expect((await sync(sessionToken, makePayload({ handle: "Alpha", referral: "STAR-1", pledgeIds: [1201, 1202, 1203] }))).status).toBe(200);
    const [a] = await accountsOf(userId);
    const before = await countsFor(userId, a.id);

    const res = await sync(sessionToken, makePayload({ handle: "Bravo", referral: "STAR-2", pledgeIds: [1202, 1203, 1204] }));
    expect(res.status).toBe(409);
    const body = (await res.json()) as {
      error: string;
      reason: string;
      identity: { handle: string; referral_code: string };
      candidate_id: number | null;
      accounts: { id: number; label: string | null; rsi_handle: string | null; is_placeholder: number; overlap: number }[];
      can_add: boolean;
    };
    expect(body).toMatchObject({
      error: "needs_mapping",
      reason: "unknown",
      identity: { handle: "Bravo", referral_code: "STAR-2" },
      candidate_id: null,
      can_add: true,
    });
    expect(body.accounts).toEqual([{ id: a.id, label: null, rsi_handle: "Alpha", is_placeholder: 0, overlap: 2 }]);

    expect(await accountsOf(userId)).toHaveLength(1);
    expect(await countsFor(userId, a.id)).toEqual(before);
    expect(await pledgeIdsOf(userId, a.id)).toEqual([1201, 1202, 1203]);
  });

  it("a new account leaves the other account's rows intact", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    expect((await sync(sessionToken, makePayload({ handle: "Alpha", pledgeIds: [1301, 1302] }))).status).toBe(200);
    const [a] = await accountsOf(userId);

    const shipRow = await env.DB
      .prepare("SELECT id FROM user_fleet WHERE user_id = ? AND rsi_account_id = ? LIMIT 1")
      .bind(userId, a.id)
      .first<{ id: number }>();
    await env.DB
      .prepare("INSERT INTO user_fleet_loadout (user_id, user_fleet_id, port_id, component_id) VALUES (?, ?, ?, ?)")
      .bind(userId, shipRow!.id, portId, componentId)
      .run();
    await env.DB
      .prepare("INSERT INTO user_fleet_tags (user_fleet_id, user_id, tag) VALUES (?, ?, 'mining')")
      .bind(shipRow!.id, userId)
      .run();

    const before = await countsFor(userId, a.id);
    for (const t of HANGAR_TABLES) expect(before[t], t).toBeGreaterThan(0);

    const res = await sync(
      sessionToken,
      makePayload({ handle: "Bravo", pledgeIds: [1401], shipTitle: "Zzma Shipb", paintTitle: "Zzma Blue Paint", target: { mode: "new" } }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rsi_account_id: number };

    const accounts = await accountsOf(userId);
    expect(accounts).toHaveLength(2);
    const b = accounts.find((x) => x.id !== a.id)!;
    expect(body.rsi_account_id).toBe(b.id);
    expect(b).toMatchObject({ rsi_handle: "Bravo", is_primary: 0 });

    expect(await countsFor(userId, a.id)).toEqual(before);
    expect(await pledgeIdsOf(userId, a.id)).toEqual([1301, 1302]);
    const loadout = await env.DB.prepare("SELECT COUNT(*) AS n FROM user_fleet_loadout WHERE user_fleet_id = ?").bind(shipRow!.id).first<{ n: number }>();
    const tags = await env.DB.prepare("SELECT COUNT(*) AS n FROM user_fleet_tags WHERE user_fleet_id = ?").bind(shipRow!.id).first<{ n: number }>();
    expect(loadout!.n).toBe(1);
    expect(tags!.n).toBe(1);

    const bCounts = await countsFor(userId, b.id);
    for (const t of HANGAR_TABLES) expect(bCounts[t], t).toBeGreaterThan(0);
    expect(await pledgeIdsOf(userId, b.id)).toEqual([1401]);
  });

  it("keeps the same paint on two accounts", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    expect((await sync(sessionToken, makePayload({ handle: "Alpha", pledgeIds: [1501] }))).status).toBe(200);
    expect((await sync(sessionToken, makePayload({ handle: "Bravo", pledgeIds: [1502], target: { mode: "new" } }))).status).toBe(200);

    const { results } = await env.DB
      .prepare("SELECT rsi_account_id FROM user_paints WHERE user_id = ? AND paint_id = ?")
      .bind(userId, paintXId)
      .all<{ rsi_account_id: number }>();
    expect(results).toHaveLength(2);
    expect(new Set(results.map((r) => r.rsi_account_id)).size).toBe(2);
  });

  it("mapping replaces only the target account", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    expect((await sync(sessionToken, makePayload({ handle: "Alpha", pledgeIds: [1601] }))).status).toBe(200);
    expect((await sync(sessionToken, makePayload({ handle: "Bravo", pledgeIds: [1602], target: { mode: "new" } }))).status).toBe(200);
    const [a, b] = await accountsOf(userId);
    const bBefore = await countsFor(userId, b.id);
    await pastRateLimit(userId);

    const res = await sync(sessionToken, makePayload({ handle: "Alpha", pledgeIds: [1603, 1604], target: { mode: "map", rsi_account_id: a.id } }));
    expect(res.status).toBe(200);

    expect(await pledgeIdsOf(userId, a.id)).toEqual([1603, 1604]);
    expect(await pledgeIdsOf(userId, b.id)).toEqual([1602]);
    expect(await countsFor(userId, b.id)).toEqual(bBefore);
  });

  it("renamed handle returns partial and mapping updates the handle", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    expect((await sync(sessionToken, makePayload({ handle: "OldName", referral: "STAR-R", pledgeIds: [1701] }))).status).toBe(200);
    const [a] = await accountsOf(userId);

    const res = await sync(sessionToken, makePayload({ handle: "NewName", referral: "STAR-R", pledgeIds: [1701] }));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { reason: string; candidate_id: number };
    expect(body.reason).toBe("partial");
    expect(body.candidate_id).toBe(a.id);

    await pastRateLimit(userId);
    const mapped = await sync(
      sessionToken,
      makePayload({ handle: "NewName", referral: "STAR-R", pledgeIds: [1701], target: { mode: "map", rsi_account_id: a.id } }),
    );
    expect(mapped.status).toBe(200);
    const accounts = await accountsOf(userId);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].rsi_handle).toBe("NewName");
    expect(accounts[0].referral_code).toBe("STAR-R");
  });

  it("no account block returns no_identity; maps only onto a verified account", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    expect(
      (await sync(sessionToken, makePayload({ handle: "Alpha", displayName: "Alpha Display", storeCredit: 4242, pledgeIds: [1801] }))).status,
    ).toBe(200);
    const [a] = await accountsOf(userId);
    expect(a.verified_at).not.toBeNull();
    const placeholder = await env.DB
      .prepare(
        `INSERT INTO user_rsi_accounts (user_id, label, is_primary, is_placeholder) VALUES (?, 'Imported hangar', 0, 1) RETURNING id`,
      )
      .bind(userId)
      .first<{ id: number }>();

    const res = await sync(sessionToken, makePayload({ noAccount: true, pledgeIds: [1802] }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { reason: string }).reason).toBe("no_identity");

    const ontoPlaceholder = await sync(
      sessionToken,
      makePayload({ noAccount: true, pledgeIds: [1802], target: { mode: "map", rsi_account_id: placeholder!.id } }),
    );
    expect(ontoPlaceholder.status).toBe(400);
    expect(((await ontoPlaceholder.json()) as { error: string }).error).toBeTruthy();
    expect(await countFor("user_pledges", userId, placeholder!.id)).toBe(0);

    await pastRateLimit(userId);
    const ontoVerified = await sync(
      sessionToken,
      makePayload({ noAccount: true, pledgeIds: [1802], target: { mode: "map", rsi_account_id: a.id } }),
    );
    expect(ontoVerified.status).toBe(200);
    const after = (await accountsOf(userId)).find((x) => x.id === a.id)!;
    expect(after).toMatchObject({
      rsi_handle: "Alpha",
      display_name: "Alpha Display",
      store_credit_cents: 4242,
      verified_at: a.verified_at,
    });
    expect(await pledgeIdsOf(userId, a.id)).toEqual([1802]);
  });

  it("rejects mapping onto an account that is not the user's", async () => {
    const other = await createTestUser(env.DB);
    const otherAccountId = await getOrCreatePrimaryAccountId(env.DB, other.userId);
    const { userId, sessionToken } = await createTestUser(env.DB);
    expect((await sync(sessionToken, makePayload({ handle: "Alpha", pledgeIds: [1851] }))).status).toBe(200);

    const res = await sync(
      sessionToken,
      makePayload({ handle: "Alpha", pledgeIds: [1852], target: { mode: "map", rsi_account_id: otherAccountId } }),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBeTruthy();
    expect(await countFor("user_pledges", other.userId, otherAccountId)).toBe(0);
    expect(await accountsOf(userId)).toHaveLength(1);
  });

  it("refuses an 11th account", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    for (let i = 0; i < MAX_RSI_ACCOUNTS; i++) {
      await env.DB
        .prepare("INSERT INTO user_rsi_accounts (user_id, rsi_handle, is_primary, is_placeholder, verified_at) VALUES (?, ?, ?, 0, datetime('now'))")
        .bind(userId, `Seeded${i}`, i === 0 ? 1 : 0)
        .run();
    }
    const res = await sync(sessionToken, makePayload({ handle: "Eleventh", pledgeIds: [1901], target: { mode: "new" } }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBeTruthy();
    expect(await accountsOf(userId)).toHaveLength(MAX_RSI_ACCOUNTS);
  });

  it("two accounts can sync back to back", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    expect((await sync(sessionToken, makePayload({ handle: "Alpha", pledgeIds: [2001] }))).status).toBe(200);
    expect((await sync(sessionToken, makePayload({ handle: "Bravo", pledgeIds: [2002], target: { mode: "new" } }))).status).toBe(200);
    expect((await sync(sessionToken, makePayload({ handle: "Alpha", pledgeIds: [2001] }))).status).toBe(429);
  });

  it("a second sync of the same account sent at the same moment is refused, not raced", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    expect((await sync(sessionToken, makePayload({ handle: "Alpha", pledgeIds: [2051] }))).status).toBe(200);
    await pastRateLimit(userId);

    const pledgeIds = Array.from({ length: 40 }, (_, i) => 2060 + i);
    const responses = await Promise.all([
      sync(sessionToken, makePayload({ handle: "Alpha", pledgeIds })),
      sync(sessionToken, makePayload({ handle: "Alpha", pledgeIds })),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 429]);

    const stored = await env.DB
      .prepare("SELECT COUNT(*) AS n FROM user_pledges WHERE user_id = ?")
      .bind(userId)
      .first<{ n: number }>();
    expect(stored!.n).toBe(pledgeIds.length);
    const syncs = await env.DB
      .prepare("SELECT COUNT(*) AS n FROM user_hangar_syncs WHERE user_id = ?")
      .bind(userId)
      .first<{ n: number }>();
    expect(syncs!.n).toBe(2);
  });

  it("legacy profile follows the primary only", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    expect((await sync(sessionToken, makePayload({ handle: "Alpha", storeCredit: 1111, pledgeIds: [2101] }))).status).toBe(200);
    expect(
      (await sync(sessionToken, makePayload({ handle: "Bravo", storeCredit: 9999, pledgeIds: [2102], target: { mode: "new" } }))).status,
    ).toBe(200);

    const profile = await env.DB
      .prepare("SELECT rsi_handle, store_credit_cents FROM user_rsi_profiles WHERE user_id = ?")
      .bind(userId)
      .first<{ rsi_handle: string; store_credit_cents: number }>();
    expect(profile).toEqual({ rsi_handle: "Alpha", store_credit_cents: 1111 });
    const b = (await accountsOf(userId)).find((x) => x.rsi_handle === "Bravo")!;
    expect(b.store_credit_cents).toBe(9999);
  });

  it("adopts the user's only account when it is a placeholder", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const placeholderId = await getOrCreatePrimaryAccountId(env.DB, userId);

    const res = await sync(sessionToken, makePayload({ handle: "Adopter", referral: "STAR-AD", pledgeIds: [2201] }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { rsi_account_id: number }).rsi_account_id).toBe(placeholderId);

    const accounts = await accountsOf(userId);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      id: placeholderId,
      rsi_handle: "Adopter",
      referral_code: "STAR-AD",
      label: null,
      is_placeholder: 0,
      is_primary: 1,
    });
    expect(accounts[0].verified_at).not.toBeNull();
    expect(await pledgeIdsOf(userId, placeholderId)).toEqual([2201]);
  });

  it("imports a no-identity sync onto the user's only account when it is a placeholder", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const placeholderId = await getOrCreatePrimaryAccountId(env.DB, userId);

    const res = await sync(sessionToken, makePayload({ noAccount: true, pledgeIds: [2251, 2252] }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { rsi_account_id: number }).rsi_account_id).toBe(placeholderId);

    const accounts = await accountsOf(userId);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      id: placeholderId,
      rsi_handle: null,
      referral_code: null,
      label: "Imported hangar",
      is_placeholder: 1,
      is_primary: 1,
      verified_at: null,
      display_name: null,
    });
    const synced = await env.DB
      .prepare("SELECT synced_at FROM user_rsi_accounts WHERE id = ?")
      .bind(placeholderId)
      .first<{ synced_at: string | null }>();
    expect(synced!.synced_at).not.toBeNull();

    for (const t of HANGAR_TABLES) {
      const all = await env.DB
        .prepare(`SELECT COUNT(*) AS n, SUM(rsi_account_id = ?) AS stamped FROM ${t} WHERE user_id = ?`)
        .bind(placeholderId, userId)
        .first<{ n: number; stamped: number }>();
      expect(all!.n, t).toBeGreaterThan(0);
      expect(all!.stamped, t).toBe(all!.n);
    }
    expect(await pledgeIdsOf(userId, placeholderId)).toEqual([2251, 2252]);
  });

  it("a no-identity sync still needs mapping when a placeholder is one of two accounts", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    await getOrCreatePrimaryAccountId(env.DB, userId);
    await env.DB
      .prepare("INSERT INTO user_rsi_accounts (user_id, rsi_handle, is_primary, is_placeholder, verified_at) VALUES (?, 'Real', 0, 0, datetime('now'))")
      .bind(userId)
      .run();

    const res = await sync(sessionToken, makePayload({ noAccount: true, pledgeIds: [2261] }));
    expect(res.status).toBe(409);
    expect((await res.json()) as { error: string; reason: string }).toMatchObject({ error: "needs_mapping", reason: "no_identity" });
    const { n } = (await env.DB.prepare("SELECT COUNT(*) AS n FROM user_pledges WHERE user_id = ?").bind(userId).first<{ n: number }>())!;
    expect(n).toBe(0);
  });

  it("409 needs_mapping offers no new account when the handle already belongs to a real one", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    expect((await sync(sessionToken, makePayload({ handle: "Alpha", referral: "STAR-A", pledgeIds: [2301] }))).status).toBe(200);
    const res = await sync(sessionToken, makePayload({ handle: "alpha", referral: "STAR-DIFFERENT", pledgeIds: [2302] }));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { reason: string; can_add: boolean };
    expect(body.reason).toBe("partial");
    expect(body.can_add).toBe(false);
    expect(await accountsOf(userId)).toHaveLength(1);
  });

  it("a later sync moves a pledge to the account that now holds it, without touching the rest", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const P = 3001;
    expect((await sync(sessionToken, makePayload({ handle: "Alpha", pledgeIds: [P, 3002] }))).status).toBe(200);
    const [a] = await accountsOf(userId);

    const resB = await sync(sessionToken, makePayload({ handle: "Bravo", pledgeIds: [P, 3003], target: { mode: "new" } }));
    expect(resB.status).toBe(200);
    const b = (await accountsOf(userId)).find((x) => x.id !== a.id)!;

    const childCounts = async () => {
      const row = await env.DB
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM user_pledge_items i JOIN user_pledges p ON p.id = i.user_pledge_id
                WHERE p.user_id = ? AND p.rsi_pledge_id = ?) AS items,
             (SELECT COUNT(*) FROM user_pledge_upgrades u JOIN user_pledges p ON p.id = u.user_pledge_id
                WHERE p.user_id = ? AND p.rsi_pledge_id = ?) AS upgrades`,
        )
        .bind(userId, P, userId, P)
        .first<{ items: number; upgrades: number }>();
      return row!;
    };
    const afterB = await childCounts();
    expect(afterB.items).toBeGreaterThan(0);
    expect(afterB.upgrades).toBeGreaterThan(0);
    const bBefore = await countsFor(userId, b.id);

    await pastRateLimit(userId);
    const resA = await sync(sessionToken, makePayload({ handle: "Alpha", pledgeIds: [3002] }));
    expect(resA.status).toBe(200);

    expect(await pledgeIdsOf(userId, b.id)).toEqual([P, 3003]);
    expect(await pledgeIdsOf(userId, a.id)).toEqual([3002]);
    const copies = await env.DB
      .prepare("SELECT COUNT(*) AS n FROM user_pledges WHERE user_id = ? AND rsi_pledge_id = ?")
      .bind(userId, P)
      .first<{ n: number }>();
    expect(copies!.n).toBe(1);
    expect(await childCounts()).toEqual(afterB);
    expect(await countsFor(userId, b.id)).toEqual(bBefore);
  });

  it("hangarxplor with no accounts creates a placeholder primary", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const res = await hangarXplor(sessionToken, [xplorEntry("Zzma Shipa", 4001)]);
    expect(res.status).toBe(200);
    const accounts = await accountsOf(userId);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ is_placeholder: 1, is_primary: 1 });
    expect(await countFor("user_fleet", userId, accounts[0].id)).toBe(1);
  });

  it("hangarxplor into a chosen account sweeps only that account", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    expect((await sync(sessionToken, makePayload({ handle: "Alpha", pledgeIds: [4101] }))).status).toBe(200);
    expect((await sync(sessionToken, makePayload({ handle: "Bravo", pledgeIds: [4102], target: { mode: "new" } }))).status).toBe(200);
    const [a, b] = await accountsOf(userId);
    const aBefore = await countFor("user_fleet", userId, a.id);
    expect(aBefore).toBeGreaterThan(0);
    // hangarxplor refuses a second import within 30s of the user's last fleet write
    await env.DB.prepare("UPDATE user_fleet SET imported_at = datetime('now', '-10 minutes') WHERE user_id = ?").bind(userId).run();

    const res = await hangarXplor(sessionToken, [xplorEntry("Zzma Shipb", 4103)], b.id);
    expect(res.status).toBe(200);
    expect(await countFor("user_fleet", userId, a.id)).toBe(aBefore);
    const bRows = await env.DB
      .prepare("SELECT pledge_id FROM user_fleet WHERE user_id = ? AND rsi_account_id = ?")
      .bind(userId, b.id)
      .all<{ pledge_id: string }>();
    expect(bRows.results.map((r) => r.pledge_id)).toEqual(["4103"]);
  });

  it("hangarxplor rejects an account that is not the user's", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const other = await createTestUser(env.DB);
    const otherAccountId = await getOrCreatePrimaryAccountId(env.DB, other.userId);
    const res = await hangarXplor(sessionToken, [xplorEntry("Zzma Shipa", 4201)], otherAccountId);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBeTruthy();
  });
});
