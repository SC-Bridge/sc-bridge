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

interface CleanupAccount {
  id: number;
  name: string;
  color: string;
  is_primary: boolean;
  store_credit_cents: number | null;
  synced_at: string | null;
  credit_override_cents: number | null;
  done_steps: string[];
  buys: Array<{ vehicle_id: number; price_cents: number | null; remelt?: true }>;
}

interface CleanupPayload {
  accounts: CleanupAccount[];
  all_accounts: Array<{ id: number; name: string; color: string }>;
  synced_at: string | null;
  store_credit_cents: number | null;
  pledges: Array<{
    rsi_account_id: number;
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
      render: { kind: string; item_key: string; variant: string } | null;
      image_url: string | null;
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
  decisions: Record<
    string,
    { decision: string | null; buy_ingame: boolean; iae_price_cents: number | null; gift_to_account_id: number | null }
  >;
  incoming_gifts: Array<{ rsi_pledge_id: number; name: string; from_account_id: number; gift_to_account_id: number }>;
  buys: Array<{ vehicle_id: number; price_cents: number | null; remelt?: boolean }>;
  state: { credit_override_cents: number | null; done_steps: string[] };
}

const URL_BASE = "http://localhost/api/hangar-cleanup";

async function seedHangar(
  userId: string,
  opts: { rsiBase: number; vehicleId: number; fromVehicleId: number; credit?: number; label?: string | null; primary?: boolean },
): Promise<number> {
  const db = env.DB;
  const primary = opts.primary ?? true;
  const account = await db
    .prepare(
      `INSERT INTO user_rsi_accounts (user_id, rsi_handle, label, is_primary, store_credit_cents, synced_at, color)
       VALUES (?, ?, ?, ?, ?, '2026-11-08 01:00:00', ?) RETURNING id`,
    )
    .bind(userId, `handle${opts.rsiBase}`, opts.label ?? null, primary ? 1 : 0, opts.credit ?? 7795, primary ? "#22d3ee" : "#f97316")
    .first<{ id: number }>();
  const accountId = account!.id;
  const sync = await db
    .prepare(
      `INSERT INTO user_hangar_syncs (user_id, rsi_account_id, source, synced_at)
       VALUES (?, ?, 'extension', '2026-11-08 01:00:00') RETURNING id`,
    )
    .bind(userId, accountId)
    .first<{ id: number }>();
  const syncId = sync!.id;

  // Ship pledge with items (incl. Insurance) and two upgrades.
  const shipPledge = await db
    .prepare(
      `INSERT INTO user_pledges (user_id, sync_id, rsi_pledge_id, name, value, value_cents, currency,
         pledge_date, pledge_date_parsed, is_upgraded, is_reclaimable, is_giftable, is_warbond, rsi_account_id)
       VALUES (?, ?, ?, 'Standalone Ship - Carrack', '$600.00 USD', 60000, 'New Money',
         'August 19, 2025', '2025-08-19', 1, 1, 0, 1, ?) RETURNING id`,
    )
    .bind(userId, syncId, opts.rsiBase, accountId)
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
         pledge_date, is_reclaimable, is_giftable, ccu_from_name, ccu_to_name, rsi_account_id)
       VALUES (?, ?, ?, 'Upgrade - Cutlass Black to Carrack', 0, 'Store Credit',
         'March 3, 2024', 1, 1, 'Cutlass Black', 'Carrack', ?)`,
    )
    .bind(userId, syncId, opts.rsiBase + 1, accountId)
    .run();

  // user_fleet links the ship pledge to the vehicle (pledge_id is TEXT).
  await db
    .prepare(
      `INSERT INTO user_fleet (user_id, vehicle_id, insurance_type_id, warbond, pledge_id, pledge_name, rsi_account_id)
       VALUES (?, ?, 2, 1, ?, 'Standalone Ship - Carrack', ?)`,
    )
    .bind(userId, opts.vehicleId, String(opts.rsiBase), accountId)
    .run();

  await db
    .prepare(
      `INSERT INTO user_buyback_pledges (user_id, rsi_pledge_id, name, value_cents, buyback_type,
         vehicle_id, from_vehicle_id, to_vehicle_id, rsi_account_id)
       VALUES (?, ?, 'Upgrade - Cutlass Black to Carrack', 50000, 'ccu', NULL, ?, ?, ?)`,
    )
    .bind(userId, opts.rsiBase + 50, opts.fromVehicleId, opts.vehicleId, accountId)
    .run();

  if (primary) {
    await db
      .prepare(
        `INSERT INTO user_rsi_profiles (user_id, store_credit_cents, synced_at) VALUES (?, 7795, '2026-11-08 01:00:00')`,
      )
      .bind(userId)
      .run();
  }
  return accountId;
}

async function get(token: string, query = ""): Promise<CleanupPayload> {
  const res = await SELF.fetch(`${URL_BASE}${query}`, { headers: await authHeaders(token) });
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
  let otherUserId: string;
  let primaryId: number;
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
    primaryId = await seedHangar(userId, { rsiBase: RSI, vehicleId: carrackId, fromVehicleId: cutlassId });

    const other = await createTestUser(env.DB);
    otherToken = other.sessionToken;
    otherUserId = other.userId;
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
      accounts: [],
      all_accounts: [],
      synced_at: null,
      store_credit_cents: null,
      pledges: [],
      buybacks: [],
      decisions: {},
      incoming_gifts: [],
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
      rsi_account_id: primaryId,
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
          render: null,
          image_url: null,
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
      expect(body.decisions[String(RSI)]).toEqual({ decision: "melt", buy_ingame: false, iae_price_cents: null, gift_to_account_id: null });
    });

    it("merges partial updates", async () => {
      await send(token, "PUT", `/decisions/${RSI}`, { buy_ingame: true, iae_price_cents: 55000 });
      let body = await get(token);
      expect(body.decisions[String(RSI)]).toEqual({ decision: "melt", buy_ingame: true, iae_price_cents: 55000, gift_to_account_id: null });
      await send(token, "PUT", `/decisions/${RSI}`, { decision: null });
      body = await get(token);
      expect(body.decisions[String(RSI)]).toEqual({ decision: null, buy_ingame: true, iae_price_cents: 55000, gift_to_account_id: null });
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
      expect((await get(token)).decisions[String(RSI)]).toEqual({ decision: "iae-remelt", buy_ingame: false, iae_price_cents: null, gift_to_account_id: null });
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
      expect((await get(token)).decisions[String(RSI)]).toEqual({ decision: "melt", buy_ingame: false, iae_price_cents: 55000, gift_to_account_id: null });
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
      expect((await get(token)).decisions[String(RSI)]).toEqual({ decision: null, buy_ingame: false, iae_price_cents: 55000, gift_to_account_id: null });
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
      expect(other.decisions[String(OTHER_RSI)]).toEqual({ decision: "melt", buy_ingame: false, iae_price_cents: null, gift_to_account_id: null });
    });
  });

  describe("per RSI account", () => {
    const A_RSI = 551000;
    const B_RSI = 552000;
    let u: { userId: string; sessionToken: string };
    let aId: number;
    let bId: number;

    async function foreignAccountId(): Promise<number> {
      const row = await env.DB
        .prepare("SELECT id FROM user_rsi_accounts WHERE user_id = ?")
        .bind(otherUserId)
        .first<{ id: number }>();
      return row!.id;
    }

    beforeAll(async () => {
      u = await createTestUser(env.DB);
      aId = await seedHangar(u.userId, { rsiBase: A_RSI, vehicleId: carrackId, fromVehicleId: cutlassId, credit: 1000 });
      bId = await seedHangar(u.userId, {
        rsiBase: B_RSI,
        vehicleId: carrackId,
        fromVehicleId: cutlassId,
        credit: 5000,
        label: "Alt",
        primary: false,
      });
    });

    it("no accounts param returns the primary account", async () => {
      const body = await get(u.sessionToken);
      expect(body.accounts).toHaveLength(1);
      expect(body.accounts[0]).toMatchObject({ id: aId, is_primary: true, name: `handle${A_RSI}` });
      expect(body.pledges.map((p) => p.rsi_pledge_id).sort()).toEqual([A_RSI, A_RSI + 1]);
      expect(body.store_credit_cents).toBe(1000);
      expect(body.all_accounts.map((a) => a.id)).toEqual([aId, bId]);
      expect(body.all_accounts[1]).toEqual({ id: bId, name: "Alt", color: "#f97316" });
    });

    it("credit comes from each account's own row", async () => {
      const body = await get(u.sessionToken, "?accounts=all");
      const byId = new Map(body.accounts.map((a) => [a.id, a]));
      expect(byId.get(aId)!.store_credit_cents).toBe(1000);
      expect(byId.get(bId)!.store_credit_cents).toBe(5000);
      expect(byId.get(bId)!.synced_at).toBe("2026-11-08 01:00:00");
      expect(body.pledges).toHaveLength(4);
      expect(body.buybacks).toHaveLength(2);
    });

    it("only the selected accounts' pledges are returned", async () => {
      const body = await get(u.sessionToken, `?accounts=${bId}`);
      expect(body.accounts.map((a) => a.id)).toEqual([bId]);
      expect(body.pledges.map((p) => p.rsi_pledge_id).sort()).toEqual([B_RSI, B_RSI + 1]);
      expect(body.pledges.every((p) => p.rsi_account_id === bId)).toBe(true);
      const ship = body.pledges.find((p) => p.rsi_pledge_id === B_RSI)!;
      expect(ship.ships).toHaveLength(1);
      expect(ship.items).toHaveLength(3);
      expect(body.buybacks).toHaveLength(1);
      expect(body.store_credit_cents).toBe(5000);
    });

    it("drops a foreign id and falls back to the primary account when none remain", async () => {
      const foreign = await foreignAccountId();
      expect((await get(u.sessionToken, `?accounts=${foreign}`)).accounts.map((a) => a.id)).toEqual([aId]);
      expect((await get(u.sessionToken, `?accounts=${foreign},${bId}`)).accounts.map((a) => a.id)).toEqual([bId]);
    });

    it("state is per account", async () => {
      const res = await send(u.sessionToken, "PUT", "/state", {
        rsi_account_id: aId,
        done_steps: ["remelt-buy-9"],
        credit_override_cents: 300,
      });
      expect(res.status).toBe(200);
      const body = await get(u.sessionToken, "?accounts=all");
      const byId = new Map(body.accounts.map((a) => [a.id, a]));
      expect(byId.get(aId)).toMatchObject({ done_steps: ["remelt-buy-9"], credit_override_cents: 300 });
      expect(byId.get(bId)).toMatchObject({ done_steps: [], credit_override_cents: null });
      expect(body.state).toEqual({ credit_override_cents: 300, done_steps: ["remelt-buy-9"] });
    });

    it("buys are per account", async () => {
      expect((await send(u.sessionToken, "PUT", `/buys/${carrackId}`, { rsi_account_id: aId, price_cents: 100 })).status).toBe(200);
      expect(
        (await send(u.sessionToken, "PUT", `/buys/${carrackId}`, { rsi_account_id: bId, price_cents: 200, remelt: true })).status,
      ).toBe(200);
      const before = new Map((await get(u.sessionToken, "?accounts=all")).accounts.map((a) => [a.id, a]));
      expect(before.get(aId)!.buys).toEqual([{ vehicle_id: carrackId, price_cents: 100 }]);
      expect(before.get(bId)!.buys).toEqual([{ vehicle_id: carrackId, price_cents: 200, remelt: true }]);

      expect((await send(u.sessionToken, "DELETE", `/buys/${carrackId}?account=${aId}`)).status).toBe(200);
      const after = new Map((await get(u.sessionToken, "?accounts=all")).accounts.map((a) => [a.id, a]));
      expect(after.get(aId)!.buys).toEqual([]);
      expect(after.get(bId)!.buys).toHaveLength(1);
    });

    it("a buy delete does not create an account", async () => {
      const fresh = await createTestUser(env.DB);
      expect((await send(fresh.sessionToken, "DELETE", `/buys/${carrackId}`)).status).toBe(200);
      const row = await env.DB
        .prepare("SELECT COUNT(*) AS n FROM user_rsi_accounts WHERE user_id = ?")
        .bind(fresh.userId)
        .first<{ n: number }>();
      expect(row!.n).toBe(0);
    });

    it("rejects a foreign account on writes", async () => {
      const foreign = await foreignAccountId();
      for (const res of [
        await send(u.sessionToken, "PUT", `/buys/${carrackId}`, { rsi_account_id: foreign }),
        await send(u.sessionToken, "PUT", "/state", { rsi_account_id: foreign, done_steps: [] }),
        await send(u.sessionToken, "DELETE", `/buys/${carrackId}?account=${foreign}`),
      ]) {
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: "RSI account not found" });
      }
    });

    it("gift decision is validated", async () => {
      // A's ship pledge is not giftable; its CCU pledge is.
      let res = await send(u.sessionToken, "PUT", `/decisions/${A_RSI}`, { decision: "gift", gift_to_account_id: bId });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Pledge cannot be gifted to that account" });
      // The pledge's own account is not a target.
      res = await send(u.sessionToken, "PUT", `/decisions/${A_RSI + 1}`, { decision: "gift", gift_to_account_id: aId });
      expect(res.status).toBe(400);
      // A foreign account is not a target.
      res = await send(u.sessionToken, "PUT", `/decisions/${A_RSI + 1}`, {
        decision: "gift",
        gift_to_account_id: await foreignAccountId(),
      });
      expect(res.status).toBe(400);
      // A gift needs a target.
      res = await send(u.sessionToken, "PUT", `/decisions/${A_RSI + 1}`, { decision: "gift" });
      expect(res.status).toBe(400);

      res = await send(u.sessionToken, "PUT", `/decisions/${A_RSI + 1}`, { decision: "gift", gift_to_account_id: bId });
      expect(res.status).toBe(200);
      expect((await get(u.sessionToken)).decisions[String(A_RSI + 1)]).toEqual({
        decision: "gift",
        buy_ingame: false,
        iae_price_cents: null,
        gift_to_account_id: bId,
      });

      // Any other decision clears the target.
      await send(u.sessionToken, "PUT", `/decisions/${A_RSI + 1}`, { decision: "keep" });
      expect((await get(u.sessionToken)).decisions[String(A_RSI + 1)].gift_to_account_id).toBeNull();
    });

    it("bulk gift is all-or-nothing against the gift rule", async () => {
      let res = await send(u.sessionToken, "PUT", "/decisions", {
        rsi_pledge_ids: [A_RSI, A_RSI + 1],
        decision: "gift",
        gift_to_account_id: bId,
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Pledge cannot be gifted to that account" });
      expect((await get(u.sessionToken)).decisions[String(A_RSI + 1)].decision).toBe("keep");

      res = await send(u.sessionToken, "PUT", "/decisions", { rsi_pledge_ids: [A_RSI + 1], decision: "gift", gift_to_account_id: bId });
      expect(res.status).toBe(200);
      expect((await get(u.sessionToken)).decisions[String(A_RSI + 1)]).toMatchObject({ decision: "gift", gift_to_account_id: bId });
      await send(u.sessionToken, "PUT", "/decisions", { rsi_pledge_ids: [A_RSI + 1], decision: "melt" });
      expect((await get(u.sessionToken)).decisions[String(A_RSI + 1)].gift_to_account_id).toBeNull();
    });

    it("decisions are only returned for the selected accounts", async () => {
      await send(u.sessionToken, "PUT", `/decisions/${A_RSI}`, { decision: "melt" });
      await send(u.sessionToken, "PUT", `/decisions/${B_RSI}`, { decision: "keep" });
      const onlyB = await get(u.sessionToken, `?accounts=${bId}`);
      expect(Object.keys(onlyB.decisions)).toEqual([String(B_RSI)]);
    });

    it("rejects a malformed accounts param on reset", async () => {
      const res = await send(u.sessionToken, "DELETE", "?accounts=abc");
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid accounts" });
      expect(Object.keys((await get(u.sessionToken, "?accounts=all")).decisions)).not.toHaveLength(0);
    });

    it("reset only clears the selected accounts", async () => {
      await send(u.sessionToken, "PUT", `/buys/${cutlassId}`, { rsi_account_id: aId });
      await send(u.sessionToken, "PUT", "/state", { rsi_account_id: bId, done_steps: ["b-step"] });
      const res = await send(u.sessionToken, "DELETE", `?accounts=${aId}`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });

      const body = await get(u.sessionToken, "?accounts=all");
      const byId = new Map(body.accounts.map((a) => [a.id, a]));
      expect(byId.get(aId)).toMatchObject({ buys: [], done_steps: [], credit_override_cents: null });
      expect(byId.get(bId)!.done_steps).toEqual(["b-step"]);
      expect(byId.get(bId)!.buys).toHaveLength(1);
      expect(Object.keys(body.decisions)).toEqual([String(B_RSI)]);
    });

    it("reset with accounts=all clears every account", async () => {
      expect((await send(u.sessionToken, "DELETE", "?accounts=all")).status).toBe(200);
      const body = await get(u.sessionToken, "?accounts=all");
      expect(body.decisions).toEqual({});
      expect(body.accounts.every((a) => a.buys.length === 0 && a.done_steps.length === 0)).toBe(true);
    });

    it("export includes cleanup data tagged by account", async () => {
      await send(u.sessionToken, "PUT", `/decisions/${B_RSI}`, { decision: "keep" });
      await send(u.sessionToken, "PUT", `/buys/${carrackId}`, { rsi_account_id: bId, price_cents: 9 });
      await send(u.sessionToken, "PUT", "/state", { rsi_account_id: bId, done_steps: ["x"] });
      const res = await SELF.fetch("http://localhost/api/account/export", { headers: await authHeaders(u.sessionToken) });
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        hangar_cleanup: {
          decisions: Array<{ rsi_pledge_id: number; rsi_account_id: number }>;
          buys: Array<{ rsi_account_id: number; vehicle_id: number }>;
          state: Array<{ rsi_account_id: number; done_steps_json: string }>;
        };
      };
      expect(data.hangar_cleanup.decisions).toEqual([expect.objectContaining({ rsi_pledge_id: B_RSI, rsi_account_id: bId })]);
      expect(data.hangar_cleanup.buys).toEqual([expect.objectContaining({ rsi_account_id: bId, vehicle_id: carrackId })]);
      expect(data.hangar_cleanup.state).toEqual([expect.objectContaining({ rsi_account_id: bId, done_steps_json: '["x"]' })]);
    });
  });

  describe("final review fixes", () => {
    let base = 700000;
    const decisionCount = async (userId: string) =>
      (await env.DB.prepare("SELECT COUNT(*) AS n FROM user_hangar_cleanup_decisions WHERE user_id = ?").bind(userId).first<{ n: number }>())!.n;

    async function twoAccounts() {
      const u = await createTestUser(env.DB);
      const rsiBase = (base += 1000);
      const aId = await seedHangar(u.userId, { rsiBase, vehicleId: carrackId, fromVehicleId: cutlassId });
      const bId = await seedHangar(u.userId, {
        rsiBase: rsiBase + 500,
        vehicleId: carrackId,
        fromVehicleId: cutlassId,
        label: "Alt",
        primary: false,
      });
      return { u, aId, bId, A: rsiBase, B: rsiBase + 500 };
    }

    it("reset with no param also clears decisions whose pledge left the hangar", async () => {
      const { u, A } = await twoAccounts();
      await send(u.sessionToken, "PUT", `/decisions/${A}`, { decision: "melt" });
      await env.DB
        .prepare("INSERT INTO user_hangar_cleanup_decisions (user_id, rsi_pledge_id, decision) VALUES (?, ?, 'melt')")
        .bind(u.userId, A + 900)
        .run();
      expect((await send(u.sessionToken, "DELETE", "")).status).toBe(200);
      expect(await decisionCount(u.userId)).toBe(0);
    });

    it("reset of a subset of accounts keeps orphan decisions and other accounts' rows", async () => {
      const { u, aId, B } = await twoAccounts();
      await send(u.sessionToken, "PUT", `/decisions/${B}`, { decision: "keep" });
      await env.DB
        .prepare("INSERT INTO user_hangar_cleanup_decisions (user_id, rsi_pledge_id, decision) VALUES (?, ?, 'melt')")
        .bind(u.userId, B + 900)
        .run();
      expect((await send(u.sessionToken, "DELETE", `?accounts=${aId}`)).status).toBe(200);
      expect(await decisionCount(u.userId)).toBe(2);
    });

    it("reset naming only foreign or deleted accounts is a 404 that clears nothing", async () => {
      const { u, aId, bId, A, B } = await twoAccounts();
      await send(u.sessionToken, "PUT", `/decisions/${A}`, { decision: "melt" });
      await send(u.sessionToken, "PUT", `/buys/${carrackId}`, { rsi_account_id: aId, price_cents: 1 });
      await send(u.sessionToken, "PUT", "/state", { rsi_account_id: aId, done_steps: ["s"] });
      for (const bad of [await foreignId(), 987654321]) {
        const res = await send(u.sessionToken, "DELETE", `?accounts=${bad}`);
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: "RSI account not found" });
      }
      const kept = await get(u.sessionToken);
      expect(kept.decisions[String(A)].decision).toBe("melt");
      expect(kept.accounts[0].buys).toHaveLength(1);
      expect(kept.accounts[0].done_steps).toEqual(["s"]);

      // A mixed list keeps its owned ids.
      await send(u.sessionToken, "PUT", `/decisions/${B}`, { decision: "keep" });
      expect((await send(u.sessionToken, "DELETE", `?accounts=${await foreignId()},${bId}`)).status).toBe(200);
      const after = await get(u.sessionToken, "?accounts=all");
      expect(Object.keys(after.decisions)).toEqual([String(A)]);
    });

    async function foreignId(): Promise<number> {
      return (await env.DB.prepare("SELECT id FROM user_rsi_accounts WHERE user_id = ?").bind(otherUserId).first<{ id: number }>())!.id;
    }

    it("a pledge with no account cannot be gifted", async () => {
      const { u, bId, A } = await twoAccounts();
      const sync = await env.DB.prepare("SELECT sync_id FROM user_pledges WHERE user_id = ? LIMIT 1").bind(u.userId).first<{ sync_id: number }>();
      await env.DB
        .prepare(
          `INSERT INTO user_pledges (user_id, sync_id, rsi_pledge_id, name, value_cents, currency, is_reclaimable, is_giftable, rsi_account_id)
           VALUES (?, ?, ?, 'Orphan gift', 100, 'New Money', 1, 1, NULL)`,
        )
        .bind(u.userId, sync!.sync_id, A + 800)
        .run();
      const res = await send(u.sessionToken, "PUT", `/decisions/${A + 800}`, { decision: "gift", gift_to_account_id: bId });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Pledge cannot be gifted to that account" });
    });

    it("the target account alone sees the incoming gift, until the gift is done", async () => {
      const { u, aId, bId, A } = await twoAccounts();
      expect((await send(u.sessionToken, "PUT", `/decisions/${A + 1}`, { decision: "gift", gift_to_account_id: bId })).status).toBe(200);
      const incoming = { rsi_pledge_id: A + 1, name: "Upgrade - Cutlass Black to Carrack", from_account_id: aId, gift_to_account_id: bId };
      expect((await get(u.sessionToken, `?accounts=${bId}`)).incoming_gifts).toEqual([incoming]);
      // Both selected: the existing path covers it. The source alone: nothing incoming.
      expect((await get(u.sessionToken, "?accounts=all")).incoming_gifts).toEqual([]);
      expect((await get(u.sessionToken)).incoming_gifts).toEqual([]);

      await env.DB.prepare("UPDATE user_pledges SET rsi_account_id = ? WHERE user_id = ? AND rsi_pledge_id = ?").bind(bId, u.userId, A + 1).run();
      expect((await get(u.sessionToken, `?accounts=${bId}`)).incoming_gifts).toEqual([]);
    });

    it("editing a completed gift's buy flag is allowed", async () => {
      const { u, bId, A } = await twoAccounts();
      await send(u.sessionToken, "PUT", `/decisions/${A + 1}`, { decision: "gift", gift_to_account_id: bId });
      await env.DB.prepare("UPDATE user_pledges SET rsi_account_id = ? WHERE user_id = ? AND rsi_pledge_id = ?").bind(bId, u.userId, A + 1).run();
      const res = await send(u.sessionToken, "PUT", `/decisions/${A + 1}`, { buy_ingame: true });
      expect(res.status).toBe(200);
      expect((await get(u.sessionToken, "?accounts=all")).decisions[String(A + 1)]).toMatchObject({
        decision: "gift",
        buy_ingame: true,
        gift_to_account_id: bId,
      });
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
