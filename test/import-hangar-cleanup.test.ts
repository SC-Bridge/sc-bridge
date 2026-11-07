import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders } from "./helpers";
import {
  isExtensionVersionBefore,
  normaliseStoreCreditCents,
  ccuNamesFromUpgradeData,
} from "../src/lib/fleet-import";

/**
 * Hangar Cleanup — import-side data the page needs:
 *   - per-pledge warbond flag (was only stored on user_fleet)
 *   - CCU from/to names from the extension's upgradeData (was dropped)
 *   - store credit ×100 correction for extension versions < 0.6.2
 */

describe("isExtensionVersionBefore", () => {
  it("compares numeric semver components", () => {
    expect(isExtensionVersionBefore("0.6.1", "0.6.2")).toBe(true);
    expect(isExtensionVersionBefore("0.5.9", "0.6.2")).toBe(true);
    expect(isExtensionVersionBefore("0.6.2", "0.6.2")).toBe(false);
    expect(isExtensionVersionBefore("0.6.10", "0.6.2")).toBe(false);
    expect(isExtensionVersionBefore("0.7.0", "0.6.2")).toBe(false);
    expect(isExtensionVersionBefore("1.0.0", "0.6.2")).toBe(false);
  });

  it("tolerates a leading v and missing patch component", () => {
    expect(isExtensionVersionBefore("v0.6.2", "0.6.2")).toBe(false);
    expect(isExtensionVersionBefore("0.6", "0.6.2")).toBe(true);
    expect(isExtensionVersionBefore("0.7", "0.6.2")).toBe(false);
  });

  it("treats missing or unparseable versions as older", () => {
    expect(isExtensionVersionBefore(undefined, "0.6.2")).toBe(true);
    expect(isExtensionVersionBefore(null, "0.6.2")).toBe(true);
    expect(isExtensionVersionBefore("", "0.6.2")).toBe(true);
    expect(isExtensionVersionBefore("unknown", "0.6.2")).toBe(true);
  });
});

describe("normaliseStoreCreditCents", () => {
  it("divides by 100 for extensions older than 0.6.2", () => {
    expect(normaliseStoreCreditCents(779500, "0.6.1")).toBe(7795);
    expect(normaliseStoreCreditCents(779500, undefined)).toBe(7795);
    expect(normaliseStoreCreditCents(779550, "0.6.0")).toBe(7796); // rounds
  });

  it("stores as-is for 0.6.2 and later", () => {
    expect(normaliseStoreCreditCents(7795, "0.6.2")).toBe(7795);
    expect(normaliseStoreCreditCents(7795, "0.7.0")).toBe(7795);
  });

  it("passes null/undefined through as null", () => {
    expect(normaliseStoreCreditCents(null, "0.6.1")).toBeNull();
    expect(normaliseStoreCreditCents(undefined, "0.6.2")).toBeNull();
  });
});

describe("ccuNamesFromUpgradeData", () => {
  it("takes the first match and target item names", () => {
    expect(
      ccuNamesFromUpgradeData({
        match_items: [{ id: 1, name: "Cutlass Black" }],
        target_items: [{ id: 2, name: "Constellation Andromeda" }],
      }),
    ).toEqual({ from: "Cutlass Black", to: "Constellation Andromeda" });
  });

  it("skips insurance / paint / schematic target entries", () => {
    expect(
      ccuNamesFromUpgradeData({
        match_items: [{ id: 1, name: "Avenger Titan" }],
        target_items: [
          { id: 9, name: "Lifetime Insurance" },
          { id: 8, name: "Hornet Paint - Ghost" },
          { id: 7, name: "Schematic: Carrack" },
          { id: 2, name: "Hornet F7C Mk II" },
        ],
      }),
    ).toEqual({ from: "Avenger Titan", to: "Hornet F7C Mk II" });
  });

  it("returns nulls for missing / malformed upgradeData", () => {
    expect(ccuNamesFromUpgradeData(null)).toEqual({ from: null, to: null });
    expect(ccuNamesFromUpgradeData(undefined)).toEqual({ from: null, to: null });
    expect(ccuNamesFromUpgradeData({})).toEqual({ from: null, to: null });
    expect(
      ccuNamesFromUpgradeData({ match_items: "nope", target_items: [{ name: "  " }] }),
    ).toEqual({ from: null, to: null });
  });
});

describe("POST /api/import/hangar-sync — hangar cleanup fields", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  function payload(extensionVersion: string | undefined, storeCreditCents: number) {
    return {
      pledges: [
        {
          id: 7001,
          name: "Upgrade - Cutlass Black to Constellation Andromeda",
          value: "$0.00 USD",
          valueCents: 0,
          currency: "Store Credit",
          date: "March 3, 2024",
          isUpgraded: false,
          isReclaimable: true,
          isGiftable: true,
          isWarbond: false,
          items: [],
          upgradeData: {
            id: 1,
            name: "Cutlass Black to Constellation Andromeda",
            upgrade_type: "ship",
            upgrade_value: null,
            match_items: [{ id: 11, name: "Cutlass Black" }],
            target_items: [
              { id: 99, name: "Lifetime Insurance" },
              { id: 12, name: "Constellation Andromeda" },
            ],
          },
        },
        {
          id: 7002,
          name: "Standalone Ship - Gladius Warbond",
          value: "$90.00 USD",
          valueCents: 9000,
          currency: "New Money",
          date: "May 1, 2023",
          isUpgraded: false,
          isReclaimable: true,
          isGiftable: true,
          isWarbond: true,
          items: [],
          upgradeData: null,
        },
      ],
      buyback_pledges: [],
      upgrades: [],
      account: { nickname: "tester", displayname: "Tester", store_credit_cents: storeCreditCents },
      named_ships: [],
      sync_meta: extensionVersion === undefined
        ? { synced_at: "2026-11-08T00:00:00Z" }
        : { extension_version: extensionVersion, synced_at: "2026-11-08T00:00:00Z" },
    };
  }

  async function sync(sessionToken: string, body: unknown) {
    return SELF.fetch("http://localhost/api/import/hangar-sync", {
      method: "POST",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("stores is_warbond and CCU from/to names on user_pledges", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const res = await sync(sessionToken, payload("0.6.2", 7795));
    expect(res.status).toBe(200);

    const rows = await env.DB
      .prepare(
        `SELECT rsi_pledge_id, is_warbond, ccu_from_name, ccu_to_name
         FROM user_pledges WHERE user_id = ? ORDER BY rsi_pledge_id`,
      )
      .bind(userId)
      .all<{ rsi_pledge_id: number; is_warbond: number; ccu_from_name: string | null; ccu_to_name: string | null }>();
    expect(rows.results).toEqual([
      { rsi_pledge_id: 7001, is_warbond: 0, ccu_from_name: "Cutlass Black", ccu_to_name: "Constellation Andromeda" },
      { rsi_pledge_id: 7002, is_warbond: 1, ccu_from_name: null, ccu_to_name: null },
    ]);
  });

  it("stores store credit as-is from extension 0.6.2+", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    expect((await sync(sessionToken, payload("0.6.2", 7795))).status).toBe(200);
    const row = await env.DB
      .prepare("SELECT store_credit_cents FROM user_rsi_profiles WHERE user_id = ?")
      .bind(userId)
      .first<{ store_credit_cents: number }>();
    expect(row!.store_credit_cents).toBe(7795);
  });

  it("divides store credit by 100 from extensions older than 0.6.2", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    expect((await sync(sessionToken, payload("0.6.1", 779500))).status).toBe(200);
    const row = await env.DB
      .prepare("SELECT store_credit_cents FROM user_rsi_profiles WHERE user_id = ?")
      .bind(userId)
      .first<{ store_credit_cents: number }>();
    expect(row!.store_credit_cents).toBe(7795);
  });

  it("divides store credit by 100 when extension_version is missing", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    expect((await sync(sessionToken, payload(undefined, 779500))).status).toBe(200);
    const row = await env.DB
      .prepare("SELECT store_credit_cents FROM user_rsi_profiles WHERE user_id = ?")
      .bind(userId)
      .first<{ store_credit_cents: number }>();
    expect(row!.store_credit_cents).toBe(7795);
  });
});
