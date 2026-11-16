import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders, seedVehicle } from "./helpers";
import { createRsiAccount } from "../src/lib/rsi-accounts";

interface SyncStatusBody {
  has_data: boolean;
  fleet_count: number;
  buyback_count: number;
  has_profile: boolean;
  last_synced: string | null;
  consent_given: string | null;
  accounts: Array<{
    id: number;
    name: string;
    color: string | null;
    is_primary: boolean;
    synced_at: string | null;
    ship_count: number;
    pledge_count: number;
    buyback_count: number;
  }>;
}

describe("GET /api/settings/sync-status — per-account", () => {
  let vehicleId: number;

  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    vehicleId = await seedVehicle(env.DB, { slug: "zzsync-ship", name: "Zzsync Ship" });
  });

  async function seedAccountRows(
    userId: string,
    accountId: number,
    counts: { ships: number; pledges: number; buybacks: number },
    pledgeBase: number,
  ) {
    const sync = await env.DB
      .prepare("INSERT INTO user_hangar_syncs (user_id, rsi_account_id) VALUES (?, ?) RETURNING id")
      .bind(userId, accountId)
      .first<{ id: number }>();
    for (let i = 0; i < counts.ships; i++) {
      await env.DB
        .prepare("INSERT INTO user_fleet (user_id, vehicle_id, rsi_account_id) VALUES (?, ?, ?)")
        .bind(userId, vehicleId, accountId)
        .run();
    }
    for (let i = 0; i < counts.pledges; i++) {
      await env.DB
        .prepare("INSERT INTO user_pledges (user_id, sync_id, rsi_pledge_id, name, rsi_account_id) VALUES (?, ?, ?, 'P', ?)")
        .bind(userId, sync!.id, pledgeBase + i, accountId)
        .run();
    }
    for (let i = 0; i < counts.buybacks; i++) {
      await env.DB
        .prepare("INSERT INTO user_buyback_pledges (user_id, rsi_pledge_id, name, rsi_account_id) VALUES (?, ?, 'B', ?)")
        .bind(userId, pledgeBase + 500 + i, accountId)
        .run();
    }
  }

  it("returns each account's own counts and the newest sync as last_synced", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const a = await createRsiAccount(env.DB, userId, { handle: "Alpha", referralCode: null, placeholder: false });
    const b = await createRsiAccount(env.DB, userId, { handle: "Beta", referralCode: null, placeholder: false });
    await env.DB.prepare("UPDATE user_rsi_accounts SET label = 'Main' WHERE id = ?").bind(a).run();
    await env.DB.prepare("UPDATE user_rsi_accounts SET synced_at = '2026-05-15 11:40:02' WHERE id = ?").bind(a).run();
    await env.DB.prepare("UPDATE user_rsi_accounts SET synced_at = '2026-11-10 08:00:00' WHERE id = ?").bind(b).run();
    await seedAccountRows(userId, a, { ships: 2, pledges: 3, buybacks: 1 }, 7000);
    await seedAccountRows(userId, b, { ships: 1, pledges: 0, buybacks: 2 }, 8000);

    const res = await SELF.fetch("http://localhost/api/settings/sync-status", {
      headers: await authHeaders(sessionToken),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as SyncStatusBody;

    expect(body.fleet_count).toBe(3);
    expect(body.buyback_count).toBe(3);
    expect(body.has_profile).toBe(true);
    expect(body.has_data).toBe(true);
    expect(body.last_synced).toBe("2026-11-10 08:00:00");
    expect(body.accounts.map((x) => x.id)).toEqual([a, b]);
    expect(body.accounts[0]).toMatchObject({
      name: "Main",
      is_primary: true,
      synced_at: "2026-05-15 11:40:02",
      ship_count: 2,
      pledge_count: 3,
      buyback_count: 1,
    });
    expect(body.accounts[1]).toMatchObject({
      name: "Beta",
      is_primary: false,
      synced_at: "2026-11-10 08:00:00",
      ship_count: 1,
      pledge_count: 0,
      buyback_count: 2,
    });
  });

  it("names a placeholder account 'Imported hangar' and does not count it as a profile", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    await createRsiAccount(env.DB, userId, { handle: null, referralCode: null, placeholder: true });

    const res = await SELF.fetch("http://localhost/api/settings/sync-status", {
      headers: await authHeaders(sessionToken),
    });
    const body = (await res.json()) as SyncStatusBody;
    expect(body.has_profile).toBe(false);
    expect(body.accounts).toHaveLength(1);
    expect(body.accounts[0].name).toBe("Imported hangar");
  });
});
