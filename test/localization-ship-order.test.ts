import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders, seedVehicle } from "./helpers";
import { mergeShipOrders, type AsopRow } from "../src/lib/localization";

const row = (vehicle_id: number, sort_position: number, custom_label: string | null = null): AsopRow => ({
  vehicle_id,
  sort_position,
  custom_label,
  vehicle_name: `Ship ${vehicle_id}`,
  class_name: `CLS_${vehicle_id}`,
});

describe("mergeShipOrders", () => {
  it("puts the primary first", () => {
    const merged = mergeShipOrders([
      { accountId: 2, isPrimary: false, items: [row(3, 1)] },
      { accountId: 1, isPrimary: true, items: [row(1, 1), row(2, 2)] },
    ]);
    expect(merged.map((r) => r.vehicle_id)).toEqual([1, 2, 3]);
    expect(merged.map((r) => r.sort_position)).toEqual([1, 2, 3]);
  });

  it("skips a ship already listed", () => {
    const merged = mergeShipOrders([
      { accountId: 1, isPrimary: true, items: [row(1, 1), row(2, 2)] },
      { accountId: 2, isPrimary: false, items: [row(2, 1), row(4, 2)] },
    ]);
    expect(merged.map((r) => r.vehicle_id)).toEqual([1, 2, 4]);
    expect(merged.map((r) => r.sort_position)).toEqual([1, 2, 3]);
  });

  it("keeps the first label", () => {
    const merged = mergeShipOrders([
      { accountId: 2, isPrimary: false, items: [row(2, 1, "Alt")] },
      { accountId: 1, isPrimary: true, items: [row(2, 1, "Main")] },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].custom_label).toBe("Main");
  });

  it("orders non-primary accounts by ascending id and each by sort_position", () => {
    const merged = mergeShipOrders([
      { accountId: 5, isPrimary: false, items: [row(9, 1)] },
      { accountId: 3, isPrimary: false, items: [row(8, 2), row(7, 1)] },
      { accountId: 1, isPrimary: true, items: [] },
    ]);
    expect(merged.map((r) => r.vehicle_id)).toEqual([7, 8, 9]);
  });
});

describe("localization ship order per RSI account", () => {
  let token: string;
  let userId: string;
  let accA: number;
  let accB: number;
  let foreign: number;
  let v1: number;
  let v2: number;
  let v3: number;

  const json = async () => ({ ...(await authHeaders(token)), "Content-Type": "application/json" });
  const url = (q = "") => `http://localhost/api/localization/ship-order${q}`;
  const get = async (q = "") => {
    const res = await SELF.fetch(url(q), { headers: await authHeaders(token) });
    return { status: res.status, body: (await res.json()) as { items?: Array<{ vehicle_id: number; sort_position: number }> } };
  };
  const put = async (items: Array<{ vehicleId: number; sortPosition: number }>, rsiAccountId?: number) =>
    SELF.fetch(url(), {
      method: "PUT",
      headers: await json(),
      body: JSON.stringify({ items, ...(rsiAccountId !== undefined ? { rsi_account_id: rsiAccountId } : {}) }),
    });
  const ids = (b: { items?: Array<{ vehicle_id: number }> }) => (b.items ?? []).map((i) => i.vehicle_id);

  async function account(owner: string, handle: string, primary: number): Promise<number> {
    const r = await env.DB
      .prepare("INSERT INTO user_rsi_accounts (user_id, rsi_handle, is_primary, is_placeholder) VALUES (?, ?, ?, 0) RETURNING id")
      .bind(owner, handle, primary)
      .first<{ id: number }>();
    return r!.id;
  }

  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    const user = await createTestUser(env.DB);
    const other = await createTestUser(env.DB);
    token = user.sessionToken;
    userId = user.userId;
    accA = await account(userId, "ShipOrderA", 1);
    accB = await account(userId, "ShipOrderB", 0);
    foreign = await account(other.userId, "ShipOrderForeign", 1);
    v1 = await seedVehicle(env.DB, { slug: "so-v1", name: "Aegis One" });
    v2 = await seedVehicle(env.DB, { slug: "so-v2", name: "Aegis Two" });
    v3 = await seedVehicle(env.DB, { slug: "so-v3", name: "Aegis Three" });
    for (const [id, cls] of [[v1, "SO_ONE"], [v2, "SO_TWO"], [v3, "SO_THREE"]] as const) {
      await env.DB.prepare("UPDATE vehicles SET class_name = ? WHERE id = ?").bind(cls, id).run();
    }
  });

  it("GET without account returns the primary's order", async () => {
    expect((await put([{ vehicleId: v1, sortPosition: 1 }, { vehicleId: v2, sortPosition: 2 }])).status).toBe(200);
    const res = await get();
    expect(res.status).toBe(200);
    expect(ids(res.body)).toEqual([v1, v2]);
    expect(ids((await get(`?account=${accB}`)).body)).toEqual([]);
  });

  it("PUT for B leaves A's order", async () => {
    expect((await put([{ vehicleId: v3, sortPosition: 1 }], accB)).status).toBe(200);
    expect(ids((await get(`?account=${accB}`)).body)).toEqual([v3]);
    expect(ids((await get(`?account=${accA}`)).body)).toEqual([v1, v2]);
    const stamped = await env.DB
      .prepare("SELECT COUNT(*) AS c FROM user_localization_ship_order WHERE user_id = ? AND rsi_account_id IS NULL")
      .bind(userId)
      .first<{ c: number }>();
    expect(stamped!.c).toBe(0);
  });

  it("rejects a foreign account on GET and PUT", async () => {
    const g = await get(`?account=${foreign}`);
    expect(g.status).toBe(404);
    expect(g.body).toEqual({ error: "RSI account not found" });
    const p = await put([{ vehicleId: v1, sortPosition: 1 }], foreign);
    expect(p.status).toBe(404);
    expect(ids((await get(`?account=${accA}`)).body)).toEqual([v1, v2]);
  });

  it("download with two accounts emits each ship once", async () => {
    // B also lists v1; merged order is A first: v1, v2, v3.
    expect((await put([{ vehicleId: v3, sortPosition: 1 }, { vehicleId: v1, sortPosition: 2 }], accB)).status).toBe(200);
    await env.DB
      .prepare(
        `INSERT INTO user_localization_configs (user_id, asop_enabled) VALUES (?, 1)
         ON CONFLICT(user_id) DO UPDATE SET asop_enabled = 1`,
      )
      .bind(userId)
      .run();
    await env.DB.prepare("UPDATE game_versions SET is_default = 0").run();
    await env.DB
      .prepare(
        `INSERT OR IGNORE INTO game_versions (uuid, code, channel, is_default, released_at)
         VALUES ('so-uuid', '9.9.9-live', 'LIVE', 0, '2026-01-01')`,
      )
      .run();
    await env.DB.prepare("UPDATE game_versions SET is_default = 1 WHERE code = '9.9.9-live'").run();
    await (env as unknown as { LOCALIZATION_KV: KVNamespace }).LOCALIZATION_KV.put(
      "localization:global-ini:9.9.9-live",
      ["vehicle_NameSO_ONE=x", "vehicle_NameSO_ONE_short=x", "vehicle_NameSO_TWO=x", "vehicle_NameSO_TWO_short=x", "vehicle_NameSO_THREE=x", "vehicle_NameSO_THREE_short=x"].join("\n"),
    );

    const res = await SELF.fetch(`http://localhost/api/localization/download?accounts=${accA},${accB}`, {
      headers: await authHeaders(token),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    const lines = text.split("\n").map((l) => l.trim());
    expect(lines.filter((l) => l.startsWith("vehicle_NameSO_ONE="))).toEqual(["vehicle_NameSO_ONE=1. Aegis One"]);
    expect(lines).toContain("vehicle_NameSO_TWO=2. Aegis Two");
    expect(lines).toContain("vehicle_NameSO_THREE=3. Aegis Three");

    // One account only: B's own order (v3 then v1).
    const solo = await SELF.fetch(`http://localhost/api/localization/download?accounts=${accB}`, {
      headers: await authHeaders(token),
    });
    const soloLines = (await solo.text()).split("\n").map((l) => l.trim());
    expect(soloLines).toContain("vehicle_NameSO_THREE=1. Aegis Three");
    expect(soloLines).toContain("vehicle_NameSO_ONE=2. Aegis One");
  });
});
