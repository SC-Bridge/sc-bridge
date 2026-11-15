import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders, seedVehicle } from "./helpers";
import { getOrCreatePrimaryAccountId } from "../src/lib/rsi-accounts";

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
