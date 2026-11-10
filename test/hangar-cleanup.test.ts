import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders, seedVehicle } from "./helpers";
import worker from "../src/index";

/**
 * /api/hangar-cleanup — the Hangar Cleanup page's backend: one payload with
 * the user's synced hangar, plus storage for their decisions.
 * Live in every environment (launched 2026-11-08).
 */

interface CleanupPayload {
  synced_at: string | null;
  store_credit_cents: number | null;
  pledges: Array<{
    rsi_pledge_id: number;
    name: string;
    value_cents: number;
    currency: string | null;
    date: string | null;
    is_reclaimable: boolean;
    is_giftable: boolean;
    is_upgraded: boolean;
    is_warbond: boolean;
    ccu_from: string | null;
    ccu_to: string | null;
    items: Array<{
      title: string;
      kind: string | null;
      manufacturer_name: string | null;
      custom_name: string | null;
      insurance_months: number | null;
      insurance_lifetime: boolean;
    }>;
    upgrades: Array<{ name: string; applied_at: string | null; new_value_cents: number | null }>;
    ships: Array<{
      vehicle_id: number;
      slug: string;
      name: string;
      focus: string | null;
      classification: string | null;
      pledge_price_cents: number | null;
      price_auec: number | null;
      insurance_label: string | null;
      insurance_months: number | null;
      insurance_lifetime: boolean;
      warbond: boolean;
    }>;
  }>;
  buybacks: Array<{
    name: string;
    value_cents: number | null;
    buyback_type: string | null;
    vehicle_name: string | null;
    from_vehicle_name: string | null;
    to_vehicle_name: string | null;
  }>;
  decisions: Record<string, { decision: string | null; buy_ingame: boolean; iae_price_cents: number | null }>;
  buys: Array<{ vehicle_id: number; price_cents: number | null; remelt?: boolean }>;
  state: { credit_override_cents: number | null; done_steps: string[] };
}

const URL_BASE = "http://localhost/api/hangar-cleanup";

async function seedHangar(userId: string, opts: { rsiBase: number; vehicleId: number; fromVehicleId: number }) {
  const db = env.DB;
  const sync = await db
    .prepare(
      `INSERT INTO user_hangar_syncs (user_id, source, synced_at) VALUES (?, 'extension', '2026-11-08 01:00:00') RETURNING id`,
    )
    .bind(userId)
    .first<{ id: number }>();
  const syncId = sync!.id;

  // Ship pledge with items (incl. Insurance) and two upgrades.
  const shipPledge = await db
    .prepare(
      `INSERT INTO user_pledges (user_id, sync_id, rsi_pledge_id, name, value, value_cents, currency,
         pledge_date, pledge_date_parsed, is_upgraded, is_reclaimable, is_giftable, is_warbond)
       VALUES (?, ?, ?, 'Standalone Ship - Carrack', '$600.00 USD', 60000, 'New Money',
         'August 19, 2025', '2025-08-19', 1, 1, 0, 1) RETURNING id`,
    )
    .bind(userId, syncId, opts.rsiBase)
    .first<{ id: number }>();
  const items: Array<[string, string | null, string | null, string | null, number | null]> = [
    ["Carrack", "Ship", "Anvil Aerospace", "Jean-Luc", null],
    ["120-Month Insurance", "Insurance", null, null, 2],
    ["Carrack Paint", "Skin", "Anvil Aerospace", null, null],
  ];
  for (let i = 0; i < items.length; i++) {
    const [title, kind, mfr, custom, ins] = items[i];
    await db
      .prepare(
        `INSERT INTO user_pledge_items (user_id, user_pledge_id, title, kind, manufacturer_name, custom_name,
           insurance_type_id, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(userId, shipPledge!.id, title, kind, mfr, custom, ins, i)
      .run();
  }
  // sort_order 0 = newest (RSI order). Insert out of order to prove ordering.
  await db
    .prepare(
      `INSERT INTO user_pledge_upgrades (user_id, user_pledge_id, upgrade_name, applied_at, applied_at_parsed,
         new_value_cents, sort_order) VALUES (?, ?, 'Older upgrade', 'Jan 1 2024, 1:00 am', '2024-01-01T01:00:00', 40000, 6)`,
    )
    .bind(userId, shipPledge!.id)
    .run();
  await db
    .prepare(
      `INSERT INTO user_pledge_upgrades (user_id, user_pledge_id, upgrade_name, applied_at, applied_at_parsed,
         new_value_cents, sort_order) VALUES (?, ?, 'Newer upgrade', 'Feb 1 2025, 1:00 am', NULL, 60000, 5)`,
    )
    .bind(userId, shipPledge!.id)
    .run();

  // CCU pledge — no ship, no date_parsed.
  await db
    .prepare(
      `INSERT INTO user_pledges (user_id, sync_id, rsi_pledge_id, name, value_cents, currency,
         pledge_date, is_reclaimable, is_giftable, ccu_from_name, ccu_to_name)
       VALUES (?, ?, ?, 'Upgrade - Cutlass Black to Carrack', 0, 'Store Credit',
         'March 3, 2024', 1, 1, 'Cutlass Black', 'Carrack')`,
    )
    .bind(userId, syncId, opts.rsiBase + 1)
    .run();

  // user_fleet links the ship pledge to the vehicle (pledge_id is TEXT).
  await db
    .prepare(
      `INSERT INTO user_fleet (user_id, vehicle_id, insurance_type_id, warbond, pledge_id, pledge_name)
       VALUES (?, ?, 2, 1, ?, 'Standalone Ship - Carrack')`,
    )
    .bind(userId, opts.vehicleId, String(opts.rsiBase))
    .run();

  await db
    .prepare(
      `INSERT INTO user_buyback_pledges (user_id, rsi_pledge_id, name, value_cents, buyback_type,
         vehicle_id, from_vehicle_id, to_vehicle_id)
       VALUES (?, ?, 'Upgrade - Cutlass Black to Carrack', 50000, 'ccu', NULL, ?, ?)`,
    )
    .bind(userId, opts.rsiBase + 50, opts.fromVehicleId, opts.vehicleId)
    .run();

  await db
    .prepare(
      `INSERT INTO user_rsi_profiles (user_id, store_credit_cents, synced_at) VALUES (?, 7795, '2026-11-08 01:00:00')`,
    )
    .bind(userId)
    .run();
}

async function get(token: string): Promise<CleanupPayload> {
  const res = await SELF.fetch(URL_BASE, { headers: await authHeaders(token) });
  expect(res.status).toBe(200);
  return (await res.json()) as CleanupPayload;
}

async function send(token: string, method: string, path: string, body?: unknown) {
  const json = body === undefined ? undefined : JSON.stringify(body);
  return SELF.fetch(`${URL_BASE}${path}`, {
    method,
    headers: {
      ...(await authHeaders(token)),
      "Content-Type": "application/json",
      // The global /api/* guard requires Content-Length on every mutation.
      "Content-Length": String(json === undefined ? 0 : new TextEncoder().encode(json).length),
    },
    body: json,
  });
}

describe("Hangar Cleanup API — /api/hangar-cleanup", () => {
  let token: string;
  let userId: string;
  let otherToken: string;
  let carrackId: number;
  let cutlassId: number;
  const RSI = 880001;
  const OTHER_RSI = 990001;

  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    const user = await createTestUser(env.DB);
    token = user.sessionToken;
    userId = user.userId;
    carrackId = await seedVehicle(env.DB, {
      slug: "hc-carrack",
      name: "Carrack",
      focus: "Expedition",
      classification: "Exploration",
      pledge_price: 600.5,
    });
    await env.DB.prepare("UPDATE vehicles SET price_auec = 26000000 WHERE id = ?").bind(carrackId).run();
    cutlassId = await seedVehicle(env.DB, { slug: "hc-cutlass-black", name: "Cutlass Black" });
    await seedHangar(userId, { rsiBase: RSI, vehicleId: carrackId, fromVehicleId: cutlassId });

    const other = await createTestUser(env.DB);
    otherToken = other.sessionToken;
    await seedHangar(other.userId, { rsiBase: OTHER_RSI, vehicleId: carrackId, fromVehicleId: cutlassId });
    // Another user's saved decision must never leak.
    await env.DB
      .prepare("INSERT INTO user_hangar_cleanup_decisions (user_id, rsi_pledge_id, decision) VALUES (?, ?, 'melt')")
      .bind(other.userId, OTHER_RSI)
      .run();
  });

  it("requires authentication", async () => {
    expect((await SELF.fetch(URL_BASE)).status).toBe(401);
    const put = await SELF.fetch(`${URL_BASE}/state`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done_steps: [] }),
    });
    expect(put.status).toBe(401);
  });

  it("returns an empty-but-valid payload for a user with no sync", async () => {
    const fresh = await createTestUser(env.DB);
    const body = await get(fresh.sessionToken);
    expect(body).toEqual({
      synced_at: null,
      store_credit_cents: null,
      pledges: [],
      buybacks: [],
      decisions: {},
      buys: [],
      state: { credit_override_cents: null, done_steps: [] },
    });
  });

  it("returns the synced hangar in the contract shape", async () => {
    const body = await get(token);
    expect(body.synced_at).toBe("2026-11-08 01:00:00");
    expect(body.store_credit_cents).toBe(7795);
    expect(body.pledges).toHaveLength(2);

    const ship = body.pledges.find((p) => p.rsi_pledge_id === RSI)!;
    expect(ship).toEqual({
      rsi_pledge_id: RSI,
      name: "Standalone Ship - Carrack",
      value_cents: 60000,
      currency: "New Money",
      date: "2025-08-19",
      is_reclaimable: true,
      is_giftable: false,
      is_upgraded: true,
      is_warbond: true,
      ccu_from: null,
      ccu_to: null,
      items: [
        { title: "Carrack", kind: "Ship", manufacturer_name: "Anvil Aerospace", custom_name: "Jean-Luc", insurance_months: null, insurance_lifetime: false },
        { title: "120-Month Insurance", kind: "Insurance", manufacturer_name: null, custom_name: null, insurance_months: 120, insurance_lifetime: false },
        { title: "Carrack Paint", kind: "Skin", manufacturer_name: "Anvil Aerospace", custom_name: null, insurance_months: null, insurance_lifetime: false },
      ],
      upgrades: [
        { name: "Newer upgrade", applied_at: "Feb 1 2025, 1:00 am", new_value_cents: 60000 },
        { name: "Older upgrade", applied_at: "2024-01-01T01:00:00", new_value_cents: 40000 },
      ],
      ships: [
        {
          vehicle_id: carrackId,
          slug: "hc-carrack",
          name: "Carrack",
          focus: "Expedition",
          classification: "Exploration",
          pledge_price_cents: 60050,
          price_auec: 26000000,
          insurance_label: "120-Month Insurance",
          insurance_months: 120,
          insurance_lifetime: false,
          warbond: true,
        },
      ],
    });

    const ccu = body.pledges.find((p) => p.rsi_pledge_id === RSI + 1)!;
    expect(ccu.date).toBe("March 3, 2024"); // falls back to raw pledge_date
    expect(ccu.ccu_from).toBe("Cutlass Black");
    expect(ccu.ccu_to).toBe("Carrack");
    expect(ccu.is_warbond).toBe(false);
    expect(ccu.items).toEqual([]);
    expect(ccu.upgrades).toEqual([]);
    expect(ccu.ships).toEqual([]);

    expect(body.buybacks).toEqual([
      {
        name: "Upgrade - Cutlass Black to Carrack",
        value_cents: 50000,
        buyback_type: "ccu",
        vehicle_name: null,
        from_vehicle_name: "Cutlass Black",
        to_vehicle_name: "Carrack",
      },
    ]);
    expect(body.decisions).toEqual({});
    expect(body.buys).toEqual([]);
    expect(body.state).toEqual({ credit_override_cents: null, done_steps: [] });
  });

  it("reports lifetime insurance on items and ships", async () => {
    const u = await createTestUser(env.DB);
    await seedHangar(u.userId, { rsiBase: 770001, vehicleId: carrackId, fromVehicleId: cutlassId });
    await env.DB.prepare("UPDATE user_pledge_items SET title = 'Lifetime Insurance', insurance_type_id = 1 WHERE user_id = ? AND kind = 'Insurance'").bind(u.userId).run();
    await env.DB.prepare("UPDATE user_fleet SET insurance_type_id = 1 WHERE user_id = ?").bind(u.userId).run();
    const body = await get(u.sessionToken);
    const p = body.pledges.find((x) => x.rsi_pledge_id === 770001)!;
    expect(p.items.find((i) => i.kind === "Insurance")).toMatchObject({ insurance_months: null, insurance_lifetime: true });
    expect(p.ships[0]).toMatchObject({ insurance_label: "Lifetime Insurance", insurance_months: null, insurance_lifetime: true });
  });

  it("never returns another user's data", async () => {
    const body = await get(token);
    expect(body.pledges.map((p) => p.rsi_pledge_id).sort()).toEqual([RSI, RSI + 1]);
    expect(body.buybacks).toHaveLength(1);
    expect(body.decisions[String(OTHER_RSI)]).toBeUndefined();
  });

  it("adds the game's paint description to a synced paint when it names an event", async () => {
    const painter = await createTestUser(env.DB);
    await seedHangar(painter.userId, { rsiBase: 770001, vehicleId: carrackId, fromVehicleId: cutlassId });
    const pledgeRow = await env.DB
      .prepare("SELECT id FROM user_pledges WHERE user_id = ? AND rsi_pledge_id = ?")
      .bind(painter.userId, 770001)
      .first<{ id: number }>();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO paints (name, description) VALUES ('Carrack Polar Livery', 'Specifically designed for the 2951 IAE.')"),
      env.DB.prepare("INSERT INTO paints (name, description) VALUES ('Carrack Ember Livery', 'A warm red finish.')"),
      ...["Carrack - Polar Paint", "Carrack Paint - Polar", "Carrack - Ember Paint"].map((title, i) =>
        env.DB
          .prepare("INSERT INTO user_pledge_items (user_id, user_pledge_id, title, kind, sort_order) VALUES (?, ?, ?, 'Skin', ?)")
          .bind(painter.userId, pledgeRow!.id, title, 10 + i),
      ),
    ]);

    const body = await get(painter.sessionToken);
    const items = body.pledges.find((p) => p.rsi_pledge_id === 770001)!.items as Array<{ title: string; paint_description?: string }>;
    const byTitle = (t: string) => items.find((i) => i.title === t)!;
    expect(byTitle("Carrack - Polar Paint").paint_description).toBe("Specifically designed for the 2951 IAE.");
    expect(byTitle("Carrack Paint - Polar").paint_description).toBe("Specifically designed for the 2951 IAE.");
    expect(byTitle("Carrack - Ember Paint").paint_description).toBeUndefined();
    expect(byTitle("Carrack Paint").paint_description).toBeUndefined();
  });

  it("applies an event paint series to ships whose paint name does not match exactly", async () => {
    const painter = await createTestUser(env.DB);
    await seedHangar(painter.userId, { rsiBase: 780001, vehicleId: carrackId, fromVehicleId: cutlassId });
    const pledgeRow = await env.DB
      .prepare("SELECT id FROM user_pledges WHERE user_id = ? AND rsi_pledge_id = ?")
      .bind(painter.userId, 780001)
      .first<{ id: number }>();
    const paint = (name: string, description: string) =>
      env.DB.prepare("INSERT INTO paints (name, description) VALUES (?, ?)").bind(name, description);
    await env.DB.batch([
      paint("Sabre Glacier Camo Livery", "Designed for the 2950 IAE event on microTech."),
      paint("Nomad Glacier Livery", "Specifically designed for the 2951 IAE."),
      paint("Ares Glacier Livery", "Specifically designed for the 2951 IAE."),
      // A common word is not a series: most paints with "crimson" say nothing.
      paint("Sabre Crimson Livery", "A deep red finish."),
      paint("Nomad Crimson Livery", "A deep red finish."),
      paint("Ares Crimson Alert Livery", "Winner of the 2952 Best in Show."),
      ...["Hurricane - Glacier Paint", "Sabre - Glacier Paint", "Hurricane - Crimson Paint"].map((title, i) =>
        env.DB
          .prepare("INSERT INTO user_pledge_items (user_id, user_pledge_id, title, kind, sort_order) VALUES (?, ?, ?, 'Skin', ?)")
          .bind(painter.userId, pledgeRow!.id, title, 10 + i),
      ),
    ]);

    const body = await get(painter.sessionToken);
    const items = body.pledges.find((p) => p.rsi_pledge_id === 780001)!.items as Array<{ title: string; paint_description?: string }>;
    const byTitle = (t: string) => items.find((i) => i.title === t)!;
    expect(byTitle("Hurricane - Glacier Paint").paint_description).toMatch(/IAE/);
    expect(byTitle("Sabre - Glacier Paint").paint_description).toBe("Designed for the 2950 IAE event on microTech.");
    expect(byTitle("Hurricane - Crimson Paint").paint_description).toBeUndefined();
  });

  describe("PUT /decisions/:rsiPledgeId", () => {
    it("upserts a decision and returns { ok: true }", async () => {
      const res = await send(token, "PUT", `/decisions/${RSI}`, { decision: "melt" });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      const body = await get(token);
      expect(body.decisions[String(RSI)]).toEqual({ decision: "melt", buy_ingame: false, iae_price_cents: null });
    });

    it("merges partial updates", async () => {
      await send(token, "PUT", `/decisions/${RSI}`, { buy_ingame: true, iae_price_cents: 55000 });
      let body = await get(token);
      expect(body.decisions[String(RSI)]).toEqual({ decision: "melt", buy_ingame: true, iae_price_cents: 55000 });
      await send(token, "PUT", `/decisions/${RSI}`, { decision: null });
      body = await get(token);
      expect(body.decisions[String(RSI)]).toEqual({ decision: null, buy_ingame: true, iae_price_cents: 55000 });
    });

    it("deletes the row when everything is cleared", async () => {
      const res = await send(token, "PUT", `/decisions/${RSI}`, { decision: null, buy_ingame: false, iae_price_cents: null });
      expect(res.status).toBe(200);
      const body = await get(token);
      expect(body.decisions[String(RSI)]).toBeUndefined();
      const row = await env.DB
        .prepare("SELECT COUNT(*) AS n FROM user_hangar_cleanup_decisions WHERE user_id = ? AND rsi_pledge_id = ?")
        .bind(userId, RSI)
        .first<{ n: number }>();
      expect(row!.n).toBe(0);
    });

    it("404s for a pledge the user does not own", async () => {
      const res = await send(token, "PUT", `/decisions/${OTHER_RSI}`, { decision: "keep" });
      expect(res.status).toBe(404);
      expect((await res.json()) as { error: string }).toHaveProperty("error");
      const row = await env.DB
        .prepare("SELECT decision FROM user_hangar_cleanup_decisions WHERE rsi_pledge_id = ?")
        .bind(OTHER_RSI)
        .first<{ decision: string }>();
      expect(row!.decision).toBe("melt"); // other user's row untouched
      expect((await send(token, "PUT", "/decisions/123456789", { decision: "keep" })).status).toBe(404);
    });

    it("rejects invalid input", async () => {
      expect((await send(token, "PUT", `/decisions/${RSI}`, { decision: "sell" })).status).toBe(400);
      expect((await send(token, "PUT", `/decisions/${RSI}`, { iae_price_cents: -1 })).status).toBe(400);
      expect((await send(token, "PUT", `/decisions/${RSI}`, { iae_price_cents: 1.5 })).status).toBe(400);
      expect((await send(token, "PUT", `/decisions/${RSI}`, { buy_ingame: "yes" })).status).toBe(400);
      expect((await send(token, "PUT", "/decisions/abc", { decision: "keep" })).status).toBe(400);
    });
    it("accepts the rebuy-and-remelt decision", async () => {
      const res = await send(token, "PUT", `/decisions/${RSI}`, { decision: "iae-remelt" });
      expect(res.status).toBe(200);
      expect((await get(token)).decisions[String(RSI)]).toEqual({ decision: "iae-remelt", buy_ingame: false, iae_price_cents: null });
      await send(token, "PUT", `/decisions/${RSI}`, { decision: null });
      expect((await get(token)).decisions[String(RSI)]).toBeUndefined();
    });
  });

  describe("PUT /decisions (bulk)", () => {
    it("sets one decision on many pledges, keeping each pledge's other fields", async () => {
      await send(token, "PUT", `/decisions/${RSI}`, { iae_price_cents: 55000 });
      const res = await send(token, "PUT", "/decisions", { rsi_pledge_ids: [RSI], decision: "melt" });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect((await get(token)).decisions[String(RSI)]).toEqual({ decision: "melt", buy_ingame: false, iae_price_cents: 55000 });
    });

    it("skips pledges the user does not own and leaves other users' rows alone", async () => {
      const res = await send(token, "PUT", "/decisions", { rsi_pledge_ids: [RSI, OTHER_RSI, 123456789], decision: "keep" });
      expect(res.status).toBe(200);
      expect((await get(token)).decisions[String(RSI)].decision).toBe("keep");
      const rows = await env.DB
        .prepare("SELECT user_id, decision FROM user_hangar_cleanup_decisions WHERE rsi_pledge_id IN (?, ?)")
        .bind(OTHER_RSI, 123456789)
        .all<{ user_id: string; decision: string }>();
      expect(rows.results).toHaveLength(1);
      expect(rows.results[0].user_id).not.toBe(userId);
      expect(rows.results[0].decision).toBe("melt");
    });

    it("clears decisions in bulk and deletes rows left with nothing in them", async () => {
      await send(token, "PUT", "/decisions", { rsi_pledge_ids: [RSI], decision: null });
      expect((await get(token)).decisions[String(RSI)]).toEqual({ decision: null, buy_ingame: false, iae_price_cents: 55000 });
      await send(token, "PUT", `/decisions/${RSI}`, { iae_price_cents: null });
      await send(token, "PUT", "/decisions", { rsi_pledge_ids: [RSI], decision: "review" });
      await send(token, "PUT", "/decisions", { rsi_pledge_ids: [RSI], decision: null });
      const row = await env.DB
        .prepare("SELECT COUNT(*) AS n FROM user_hangar_cleanup_decisions WHERE user_id = ?")
        .bind(userId)
        .first<{ n: number }>();
      expect(row!.n).toBe(0);
    });

    it("rejects invalid input", async () => {
      expect((await send(token, "PUT", "/decisions", { rsi_pledge_ids: [], decision: "keep" })).status).toBe(400);
      expect((await send(token, "PUT", "/decisions", { rsi_pledge_ids: [RSI], decision: "sell" })).status).toBe(400);
      expect((await send(token, "PUT", "/decisions", { rsi_pledge_ids: [RSI] })).status).toBe(400);
      expect((await send(token, "PUT", "/decisions", { rsi_pledge_ids: ["x"], decision: "keep" })).status).toBe(400);
      const tooMany = Array.from({ length: 2001 }, (_, i) => i + 1);
      expect((await send(token, "PUT", "/decisions", { rsi_pledge_ids: tooMany, decision: "keep" })).status).toBe(400);
    });
  });

  describe("PUT/DELETE /buys/:vehicleId", () => {
    it("upserts a buy with and without a price", async () => {
      let res = await send(token, "PUT", `/buys/${carrackId}`, {});
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect((await get(token)).buys).toEqual([{ vehicle_id: carrackId, price_cents: null }]);

      res = await send(token, "PUT", `/buys/${carrackId}`, { price_cents: 45000 });
      expect(res.status).toBe(200);
      expect((await get(token)).buys).toEqual([{ vehicle_id: carrackId, price_cents: 45000 }]);

      // Omitted price keeps the stored one; explicit null clears it.
      await send(token, "PUT", `/buys/${carrackId}`, {});
      expect((await get(token)).buys).toEqual([{ vehicle_id: carrackId, price_cents: 45000 }]);
      await send(token, "PUT", `/buys/${carrackId}`, { price_cents: null });
      expect((await get(token)).buys).toEqual([{ vehicle_id: carrackId, price_cents: null }]);
    });

    it("404s for an unknown vehicle and rejects bad input", async () => {
      expect((await send(token, "PUT", "/buys/99999999", {})).status).toBe(404);
      expect((await send(token, "PUT", `/buys/${carrackId}`, { price_cents: -5 })).status).toBe(400);
      expect((await send(token, "PUT", "/buys/abc", {})).status).toBe(400);
    });

    it("stores the remelt-for-buy-back flag independently of the price", async () => {
      let res = await send(token, "PUT", `/buys/${carrackId}`, { remelt: true });
      expect(res.status).toBe(200);
      expect((await get(token)).buys).toEqual([{ vehicle_id: carrackId, price_cents: null, remelt: true }]);

      // A price-only update keeps the flag; a flag-only update keeps the price.
      await send(token, "PUT", `/buys/${carrackId}`, { price_cents: 45000 });
      expect((await get(token)).buys).toEqual([{ vehicle_id: carrackId, price_cents: 45000, remelt: true }]);
      res = await send(token, "PUT", `/buys/${carrackId}`, { remelt: false });
      expect(res.status).toBe(200);
      const buys = (await get(token)).buys;
      expect(buys).toEqual([{ vehicle_id: carrackId, price_cents: 45000 }]);
      expect(buys[0].remelt).toBeUndefined();

      expect((await send(token, "PUT", `/buys/${carrackId}`, { remelt: "yes" })).status).toBe(400);
    });

    it("deletes a buy", async () => {
      const res = await send(token, "DELETE", `/buys/${carrackId}`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect((await get(token)).buys).toEqual([]);
    });
  });

  describe("PUT /state", () => {
    it("upserts partially", async () => {
      let res = await send(token, "PUT", "/state", { credit_override_cents: 10000 });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect((await get(token)).state).toEqual({ credit_override_cents: 10000, done_steps: [] });

      res = await send(token, "PUT", "/state", { done_steps: ["review-insurance", "melt"] });
      expect(res.status).toBe(200);
      expect((await get(token)).state).toEqual({ credit_override_cents: 10000, done_steps: ["review-insurance", "melt"] });

      await send(token, "PUT", "/state", { credit_override_cents: null });
      expect((await get(token)).state).toEqual({ credit_override_cents: null, done_steps: ["review-insurance", "melt"] });
    });

    it("rejects invalid input", async () => {
      expect((await send(token, "PUT", "/state", { credit_override_cents: -1 })).status).toBe(400);
      expect((await send(token, "PUT", "/state", { done_steps: "melt" })).status).toBe(400);
      expect((await send(token, "PUT", "/state", { done_steps: ["x".repeat(101)] })).status).toBe(400);
      expect((await send(token, "PUT", "/state", { done_steps: Array.from({ length: 501 }, (_, i) => `s${i}`) })).status).toBe(400);
    });
  });

  describe("DELETE / (reset)", () => {
    it("deletes the user's decisions, buys and state only", async () => {
      await send(token, "PUT", `/decisions/${RSI}`, { decision: "keep" });
      await send(token, "PUT", `/buys/${cutlassId}`, { price_cents: 1000 });
      await send(token, "PUT", "/state", { done_steps: ["a"] });

      const res = await send(token, "DELETE", "");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });

      const body = await get(token);
      expect(body.decisions).toEqual({});
      expect(body.buys).toEqual([]);
      expect(body.state).toEqual({ credit_override_cents: null, done_steps: [] });
      expect(body.pledges).toHaveLength(2); // synced data untouched

      const other = await get(otherToken);
      expect(other.decisions[String(OTHER_RSI)]).toEqual({ decision: "melt", buy_ingame: false, iae_price_cents: null });
    });
  });

  describe("account deletion", () => {
    it("removes the user's hangar cleanup rows", async () => {
      const u = await createTestUser(env.DB);
      await seedHangar(u.userId, { rsiBase: 660001, vehicleId: carrackId, fromVehicleId: cutlassId });
      await send(u.sessionToken, "PUT", "/decisions/660001", { decision: "keep" });
      await send(u.sessionToken, "PUT", `/buys/${carrackId}`, {});
      await send(u.sessionToken, "PUT", "/state", { done_steps: ["a"] });

      const res = await SELF.fetch("http://localhost/api/account", {
        method: "DELETE",
        headers: { ...(await authHeaders(u.sessionToken)), "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE" }),
      });
      expect(res.status).toBe(200);

      for (const table of ["user_hangar_cleanup_decisions", "user_hangar_cleanup_buys", "user_hangar_cleanup_state"]) {
        const row = await env.DB
          .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`)
          .bind(u.userId)
          .first<{ n: number }>();
        expect(row!.n, table).toBe(0);
      }
    });
  });

  // Launched to production 2026-11-08: the page and API are live everywhere.
  describe("production", () => {
    async function prodFetch(path: string, init?: RequestInit) {
      const ctx = createExecutionContext();
      const res = await worker.fetch(
        new Request(`http://localhost${path}`, init),
        { ...env, ENVIRONMENT: "production" } as unknown as Parameters<typeof worker.fetch>[1],
        ctx,
      );
      await waitOnExecutionContext(ctx);
      return res;
    }

    it("serves /api/hangar-cleanup in production to signed-in users and 401s signed-out ones", async () => {
      const headers = await authHeaders(token);
      expect((await prodFetch("/api/hangar-cleanup", { headers })).status).toBe(200);
      expect((await prodFetch("/api/hangar-cleanup")).status).toBe(401);
      const json = JSON.stringify({ decision: "keep" });
      expect(
        (await prodFetch(`/api/hangar-cleanup/decisions/${RSI}`, {
          method: "PUT",
          headers: { ...headers, "Content-Type": "application/json", "Content-Length": String(json.length) },
          body: json,
        })).status,
      ).toBe(200);
    });

    it("advertises features.hangarCleanup in every environment", async () => {
      const res = await SELF.fetch("http://localhost/api/status");
      const body = (await res.json()) as { features: Record<string, boolean> };
      expect(body.features.hangarCleanup).toBe(true);
      const prod = await prodFetch("/api/status");
      const prodBody = (await prod.json()) as { features: Record<string, boolean> };
      expect(prodBody.features.hangarCleanup).toBe(true);
    });
  });
});
