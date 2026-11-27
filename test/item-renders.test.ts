import { describe, it, expect, beforeAll } from "vitest";
import { env, SELF } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders, seedVehicle, seedFleetEntry } from "./helpers";
import { RENDER_KINDS, lootRenderJoin, toRenderRef } from "../src/lib/renders";
import { renderRoutes } from "../src/routes/renders";
import { armourSetRenderKey } from "../src/lib/loot-sets";

const INSERT_SQL =
  "INSERT INTO item_renders (kind, item_key, variant, view, hash, width, height, source_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";

function insertRender(variant: string) {
  return env.DB
    .prepare(INSERT_SQL)
    .bind("vehicle", "aegs_gladius", variant, "iso", "3fa9c01e7d22b410", 2048, 1536, "4.10.3-live")
    .run();
}

describe("item_renders", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  it("accepts one row per (kind,item_key,variant,view)", async () => {
    await insertRender("");
    await expect(insertRender("")).rejects.toThrow(/UNIQUE/i);
    await expect(insertRender("paint_gladius_valiant")).resolves.toBeDefined();
  });

  it("has the variant and item_key lookup indexes", async () => {
    const rows = await env.DB
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='item_renders'")
      .all<{ name: string }>();
    const names = rows.results.map((r) => r.name);
    expect(names).toContain("idx_item_renders_variant");
    expect(names).toContain("idx_item_renders_item_key");
  });
});

describe("GET /api/renders/:kind/:itemKey", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    await env.DB.batch([
      env.DB.prepare(INSERT_SQL).bind("vehicle", "aegs_gladius", "", "iso", "aaaaaaaaaaaaaaaa", 2048, 1536, "4.10.3-live"),
      env.DB.prepare(INSERT_SQL).bind("vehicle", "aegs_gladius", "paint_gladius_valiant", "iso", "bbbbbbbbbbbbbbbb", 2048, 1536, "4.10.3-live"),
      env.DB.prepare(INSERT_SQL).bind("vehicle", "aegs_gladius", "paint_gladius_ember", "iso", "cccccccccccccccc", 2048, 1536, "4.10.3-live"),
      env.DB.prepare("INSERT INTO paints (name, slug, class_name) VALUES ('Valiant', 'gladius-valiant', 'paint_gladius_valiant')"),
      env.DB.prepare("INSERT INTO paints (name, slug, class_name) VALUES ('Ember', 'gladius-ember', 'paint_gladius_ember')"),
    ]);
  });

  it("returns stock first, then paints by name", async () => {
    const res = await SELF.fetch("http://localhost/api/renders/vehicle/aegs_gladius");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { variants: { variant: string; name: string | null; hash: string }[] };
    expect(body.variants.map((v) => v.variant)).toEqual(["", "paint_gladius_ember", "paint_gladius_valiant"]);
    expect(body.variants.map((v) => v.name)).toEqual([null, "Ember", "Valiant"]);
    expect(body.variants[0]).toEqual({
      variant: "", view: "iso", hash: "aaaaaaaaaaaaaaaa", width: 2048, height: 1536, name: null,
    });
  });

  it("returns 404 for an unknown item and caches nothing", async () => {
    // Mount the routes with a real cache (ENVIRONMENT is not "test") and a KV
    // that records writes; a known item is the control that writes do happen.
    const puts: string[] = [];
    const kv = {
      get: async () => null,
      put: async (key: string) => { puts.push(key); },
    };
    const pending: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => { pending.push(p); }, passThroughOnException: () => {}, props: {} };
    const bindings = { DB: env.DB, SC_BRIDGE_CACHE: kv, ENVIRONMENT: "production" } as unknown as Record<string, unknown>;
    const app = renderRoutes();

    const unknown = await app.request("/vehicle/nope_nothing", {}, bindings, ctx as unknown as ExecutionContext);
    expect(unknown.status).toBe(404);
    await Promise.all(pending);
    expect(puts).toEqual([]);

    const known = await app.request("/vehicle/aegs_gladius", {}, bindings, ctx as unknown as ExecutionContext);
    expect(known.status).toBe(200);
    await Promise.all(pending);
    expect(puts).toEqual(["renders:item:vehicle:aegs_gladius"]);
  });

  it("returns 404 for an unknown item through the app", async () => {
    const res = await SELF.fetch("http://localhost/api/renders/vehicle/nope_nothing");
    expect(res.status).toBe(404);
  });

  it("rejects an unknown kind with 400", async () => {
    const res = await SELF.fetch("http://localhost/api/renders/nope/aegs_gladius");
    expect(res.status).toBe(400);
  });

  it("names a weapon finish once, from the default LIVE version", async () => {
    const W = "INSERT INTO fps_weapons (uuid, name, class_name, game_version_id) VALUES (?, ?, ?, ?)";
    await env.DB.batch([
      env.DB.prepare(INSERT_SQL).bind("fps_weapon", "behr_rifle", "", "side", "dddddddddddddddd", 2048, 1024, "4.10.3-live"),
      env.DB.prepare(INSERT_SQL).bind("fps_weapon", "behr_rifle", "behr_rifle_camo", "side", "eeeeeeeeeeeeeeee", 2048, 1024, "4.10.3-live"),
      env.DB.prepare(W).bind("u-camo-1", "Camo Finish", "behr_rifle_camo", 1),
      env.DB.prepare(W).bind("u-camo-2", "Camo Finish", "behr_rifle_camo", 2),
    ]);
    const res = await SELF.fetch("http://localhost/api/renders/fps_weapon/behr_rifle");
    const body = (await res.json()) as { variants: { variant: string; name: string | null }[] };
    expect(body.variants).toHaveLength(2);
    expect(body.variants[1]).toMatchObject({ variant: "behr_rifle_camo", name: "Camo Finish" });
  });

  it("accepts a long comma-joined armour set key of up to 400 characters", async () => {
    const key = Array.from({ length: 9 }, (_, i) => `zzr_long_armour_piece_name_${i}_xxxxxxxxxxxx`).join(",");
    expect(key.length).toBeGreaterThan(200);
    expect(key.length).toBeLessThanOrEqual(400);
    await env.DB.prepare(INSERT_SQL).bind("armour_set", key, "", "worn_male", "llllllllllllllll", 1024, 2048, "4.10.3-live").run();
    const res = await SELF.fetch(`http://localhost/api/renders/armour_set/${encodeURIComponent(key)}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { variants: { hash: string }[] };
    expect(body.variants.map((v) => v.hash)).toEqual(["llllllllllllllll"]);
  });

  it("rejects an item key longer than 400 characters with 400", async () => {
    const key = "a".repeat(401);
    const res = await SELF.fetch(`http://localhost/api/renders/armour_set/${key}`);
    expect(res.status).toBe(400);
  });

  it("rejects an item key with characters outside a-z 0-9 _ , . - with 400", async () => {
    for (const key of ["AEGS_Gladius", "aegs gladius", "aegs:gladius", "aegs/gladius"]) {
      const res = await SELF.fetch(`http://localhost/api/renders/vehicle/${encodeURIComponent(key)}`);
      expect(res.status, key).toBe(400);
    }
  });

  it("names a finish from loot_map when no paint or FPS record names it", async () => {
    await env.DB.batch([
      env.DB.prepare(INSERT_SQL).bind("ship_weapon", "zzr_cannon_s3", "", "iso", "gggggggggggggggg", 2048, 1536, "4.10.3-live"),
      env.DB.prepare(INSERT_SQL).bind("ship_weapon", "zzr_cannon_s3", "zzr_cannon_s3_gold", "iso", "hhhhhhhhhhhhhhhh", 2048, 1536, "4.10.3-live"),
      env.DB.prepare("INSERT INTO loot_map (uuid, name, class_name, type, category, game_version_id) VALUES (?, ?, ?, ?, ?, 1)")
        .bind("zzr-cannon-gold", "Zzr Cannon Gold", "zzr_cannon_s3_gold", "WeaponGun", "ship_weapon"),
    ]);
    const res = await SELF.fetch("http://localhost/api/renders/ship_weapon/zzr_cannon_s3");
    const body = (await res.json()) as { variants: { variant: string; name: string | null }[] };
    expect(body.variants).toEqual([
      expect.objectContaining({ variant: "", name: null }),
      expect.objectContaining({ variant: "zzr_cannon_s3_gold", name: "Zzr Cannon Gold" }),
    ]);
  });
});

// ── render on ships, paints and fleet rows ───────────────────────────
//
// Every vehicle row carries `render` (its stock render, variant ''); every
// paint row carries the render of that paint on a hull. When a variant has
// renders in several views, one is picked: iso, then side, then worn_male.

type Render = { hash: string; width: number; height: number; view: string } | null;

function renderRow(itemKey: string, variant: string, view: string, hash: string) {
  return env.DB.prepare(INSERT_SQL).bind("vehicle", itemKey, variant, view, hash, 2048, 1536, "4.10.3-live");
}

async function seedShip(slug: string, name: string, className: string): Promise<number> {
  const id = await seedVehicle(env.DB, { slug, name });
  await env.DB
    .prepare("UPDATE vehicles SET class_name = ?, image_url = ? WHERE id = ?")
    .bind(className, `https://example.test/${slug}.jpg`, id)
    .run();
  return id;
}

async function seedPaint(name: string, slug: string, className: string, vehicleIds: number[]): Promise<number> {
  const row = await env.DB
    .prepare("INSERT INTO paints (name, slug, class_name, image_url) VALUES (?, ?, ?, ?) RETURNING id")
    .bind(name, slug, className, `https://example.test/${slug}.jpg`)
    .first<{ id: number }>();
  for (const vid of vehicleIds) {
    await env.DB.prepare("INSERT INTO paint_vehicles (paint_id, vehicle_id) VALUES (?, ?)").bind(row!.id, vid).run();
  }
  return row!.id;
}

describe("render on ship, paint and fleet rows", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  it("GET /api/ships/:slug returns the stock render and keeps image_url", async () => {
    await seedShip("zzr-alpha", "Zzr Alpha", "zzr_alpha");
    await env.DB.batch([
      renderRow("zzr_alpha", "", "side", "a1a1a1a1a1a1a1a1"),
      renderRow("zzr_alpha", "", "iso", "a0a0a0a0a0a0a0a0"),
      renderRow("zzr_alpha", "paint_zzr_alpha_red", "iso", "a2a2a2a2a2a2a2a2"),
    ]);
    const res = await SELF.fetch("http://localhost/api/ships/zzr-alpha");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.render).toEqual({ hash: "a0a0a0a0a0a0a0a0", width: 2048, height: 1536, view: "iso" });
    expect(body.image_url).toBe("https://example.test/zzr-alpha.jpg");
    expect(body).not.toHaveProperty("render_hash");
  });

  it("GET /api/ships/:slug returns render: null when no stock row exists", async () => {
    await seedShip("zzr-bare", "Zzr Bare", "zzr_bare");
    await env.DB.batch([renderRow("zzr_bare", "paint_zzr_bare_red", "iso", "b2b2b2b2b2b2b2b2")]);
    const res = await SELF.fetch("http://localhost/api/ships/zzr-bare");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.render).toBeNull();
    expect(body.image_url).toBe("https://example.test/zzr-bare.jpg");
  });

  it("matches a mixed-case class_name to the lower-case item_key", async () => {
    await seedShip("zzr-mixed", "Zzr Mixed", "ZZR_Mixed");
    await env.DB.batch([renderRow("zzr_mixed", "", "iso", "m0m0m0m0m0m0m0m0")]);
    const res = await SELF.fetch("http://localhost/api/ships/zzr-mixed");
    const body = (await res.json()) as { render: Render };
    expect(body.render?.hash).toBe("m0m0m0m0m0m0m0m0");
  });

  it("GET /api/ships returns one row per ship when it has both iso and side renders", async () => {
    await seedShip("zzr-list-both", "Zzr List Both", "zzr_list_both");
    await seedShip("zzr-list-side", "Zzr List Side", "zzr_list_side");
    await seedShip("zzr-list-female", "Zzr List Female", "zzr_list_female");
    await env.DB.batch([
      renderRow("zzr_list_both", "", "side", "c1c1c1c1c1c1c1c1"),
      renderRow("zzr_list_both", "", "iso", "c0c0c0c0c0c0c0c0"),
      renderRow("zzr_list_both", "", "worn_male", "c2c2c2c2c2c2c2c2"),
      renderRow("zzr_list_side", "", "worn_male", "d2d2d2d2d2d2d2d2"),
      renderRow("zzr_list_side", "", "side", "d1d1d1d1d1d1d1d1"),
      renderRow("zzr_list_female", "", "worn_female", "e3e3e3e3e3e3e3e3"),
    ]);
    const res = await SELF.fetch("http://localhost/api/ships");
    expect(res.status).toBe(200);
    const ships = (await res.json()) as Array<{ slug: string; render: Render; image_url: string | null }>;
    const both = ships.filter((s) => s.slug === "zzr-list-both");
    expect(both).toHaveLength(1);
    expect(both[0].render).toEqual({ hash: "c0c0c0c0c0c0c0c0", width: 2048, height: 1536, view: "iso" });
    expect(both[0].image_url).toBe("https://example.test/zzr-list-both.jpg");
    expect(ships.find((s) => s.slug === "zzr-list-side")?.render?.view).toBe("side");
    // worn_female is ranked last, not excluded: a female-only item still shows it.
    expect(ships.find((s) => s.slug === "zzr-list-female")?.render?.hash).toBe("e3e3e3e3e3e3e3e3");
  });

  it("GET /api/paints/ship/:slug returns each paint's render on that hull", async () => {
    const own = await seedShip("zzr-own", "Zzr Own", "zzr_own");
    const other = await seedShip("zzr-other", "Zzr Other", "zzr_other");
    await seedPaint("Zzr Shared", "zzr-shared", "paint_zzr_shared", [own, other]);
    await seedPaint("Zzr Plain", "zzr-plain", "paint_zzr_plain", [own]);
    await env.DB.batch([
      renderRow("zzr_other", "paint_zzr_shared", "iso", "f1f1f1f1f1f1f1f1"),
      renderRow("zzr_own", "paint_zzr_shared", "iso", "f0f0f0f0f0f0f0f0"),
    ]);
    const res = await SELF.fetch("http://localhost/api/paints/ship/zzr-own");
    expect(res.status).toBe(200);
    const paints = (await res.json()) as Array<{ slug: string; render: Render; image_url: string | null }>;
    expect(paints).toHaveLength(2);
    const shared = paints.find((p) => p.slug === "zzr-shared")!;
    expect(shared.render).toEqual({ hash: "f0f0f0f0f0f0f0f0", width: 2048, height: 1536, view: "iso" });
    expect(shared.image_url).toBe("https://example.test/zzr-shared.jpg");
    expect(paints.find((p) => p.slug === "zzr-plain")!.render).toBeNull();
  });

  it("GET /api/paints/:slug returns hull_renders and the first fitted hull's render", async () => {
    const bravo = await seedShip("zzr-hull-bravo", "Zzr Hull Bravo", "zzr_hull_bravo");
    const alpha = await seedShip("zzr-hull-alpha", "Zzr Hull Alpha", "zzr_hull_alpha");
    const aaa = await seedShip("zzr-hull-aaa", "Zzr Hull Aaa", "zzr_hull_aaa");
    await seedPaint("Zzr Detail", "zzr-detail", "paint_zzr_detail", [bravo, alpha, aaa]);
    await env.DB.batch([
      renderRow("zzr_hull_bravo", "paint_zzr_detail", "iso", "h2h2h2h2h2h2h2h2"),
      renderRow("zzr_hull_alpha", "paint_zzr_detail", "side", "h1h1h1h1h1h1h1h1"),
      renderRow("zzr_hull_alpha", "paint_zzr_detail", "iso", "h0h0h0h0h0h0h0h0"),
    ]);
    const res = await SELF.fetch("http://localhost/api/paints/zzr-detail");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      render: Render;
      image_url: string | null;
      vehicles: Array<{ slug: string }>;
      hull_renders: Array<{ vehicle_slug: string; vehicle_name: string; item_key: string; render: Render }>;
    };
    expect(body.image_url).toBe("https://example.test/zzr-detail.jpg");
    expect(body.vehicles).toHaveLength(3);
    expect(body.hull_renders).toEqual([
      { vehicle_slug: "zzr-hull-alpha", vehicle_name: "Zzr Hull Alpha", item_key: "zzr_hull_alpha",
        render: { hash: "h0h0h0h0h0h0h0h0", width: 2048, height: 1536, view: "iso" } },
      { vehicle_slug: "zzr-hull-bravo", vehicle_name: "Zzr Hull Bravo", item_key: "zzr_hull_bravo",
        render: { hash: "h2h2h2h2h2h2h2h2", width: 2048, height: 1536, view: "iso" } },
    ]);
    expect(body.render?.hash).toBe("h0h0h0h0h0h0h0h0");
  });

  it("GET /api/paints gives each paint the render on its first fitted hull that has one", async () => {
    const zulu = await seedShip("zzr-list-zulu", "Zzr List Zulu", "zzr_list_zulu");
    const mike = await seedShip("zzr-list-mike", "Zzr List Mike", "zzr_list_mike");
    const able = await seedShip("zzr-list-able", "Zzr List Able", "zzr_list_able");
    await seedPaint("Zzr Listed", "zzr-listed", "paint_zzr_listed", [zulu, mike, able]);
    await seedPaint("Zzr Unrendered", "zzr-unrendered", "paint_zzr_unrendered", [zulu]);
    await env.DB.batch([
      renderRow("zzr_list_zulu", "paint_zzr_listed", "iso", "l2l2l2l2l2l2l2l2"),
      renderRow("zzr_list_mike", "paint_zzr_listed", "side", "l1l1l1l1l1l1l1l1"),
    ]);
    const res = await SELF.fetch("http://localhost/api/paints");
    expect(res.status).toBe(200);
    const paints = (await res.json()) as Array<{ slug: string; render: Render; render_item_key: string | null; image_url: string | null }>;
    const listed = paints.filter((p) => p.slug === "zzr-listed");
    expect(listed).toHaveLength(1);
    expect(listed[0].render).toEqual({ hash: "l1l1l1l1l1l1l1l1", width: 2048, height: 1536, view: "side" });
    expect(listed[0].render_item_key).toBe("zzr_list_mike");
    expect(listed[0].image_url).toBe("https://example.test/zzr-listed.jpg");
    expect(paints.find((p) => p.slug === "zzr-unrendered")!.render).toBeNull();
  });

  it("GET /api/vehicles (fleet) gives the stock render, or the equipped paint's render", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const ship = await seedShip("zzr-fleet", "Zzr Fleet", "zzr_fleet");
    const red = await seedPaint("Zzr Fleet Red", "zzr-fleet-red", "paint_zzr_fleet_red", [ship]);
    const blue = await seedPaint("Zzr Fleet Blue", "zzr-fleet-blue", "paint_zzr_fleet_blue", [ship]);
    const stockEntry = await seedFleetEntry(env.DB, userId, ship, { custom_name: "stock" });
    const redEntry = await seedFleetEntry(env.DB, userId, ship, { custom_name: "red" });
    const blueEntry = await seedFleetEntry(env.DB, userId, ship, { custom_name: "blue" });
    await env.DB.batch([
      env.DB.prepare("UPDATE user_fleet SET equipped_paint_id = ? WHERE id = ?").bind(red, redEntry),
      env.DB.prepare("UPDATE user_fleet SET equipped_paint_id = ? WHERE id = ?").bind(blue, blueEntry),
      renderRow("zzr_fleet", "", "iso", "k0k0k0k0k0k0k0k0"),
      renderRow("zzr_fleet", "paint_zzr_fleet_red", "iso", "k1k1k1k1k1k1k1k1"),
    ]);
    const res = await SELF.fetch("http://localhost/api/vehicles", { headers: await authHeaders(sessionToken) });
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<{ id: number; render: Render; image_url: string | null }>;
    expect(rows).toHaveLength(3);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(stockEntry)!.render?.hash).toBe("k0k0k0k0k0k0k0k0");
    expect(byId.get(stockEntry)!.image_url).toBe("https://example.test/zzr-fleet.jpg");
    expect(byId.get(redEntry)!.render?.hash).toBe("k1k1k1k1k1k1k1k1");
    // No render of the blue paint: null, so the page falls back to the paint's RSI art.
    expect(byId.get(blueEntry)!.render).toBeNull();
  });

  it("GET /api/analysis gives each insurance row its ship's render in the equipped paint", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const ship = await seedShip("zzr-insured", "Zzr Insured", "zzr_insured");
    const red = await seedPaint("Zzr Insured Red", "zzr-insured-red", "paint_zzr_insured_red", [ship]);
    await seedFleetEntry(env.DB, userId, ship, { custom_name: "stock" });
    const redEntry = await seedFleetEntry(env.DB, userId, ship, { custom_name: "red" });
    await env.DB.batch([
      env.DB.prepare("UPDATE user_fleet SET equipped_paint_id = ? WHERE id = ?").bind(red, redEntry),
      renderRow("zzr_insured", "", "iso", "q0q0q0q0q0q0q0q0"),
      renderRow("zzr_insured", "paint_zzr_insured_red", "iso", "q1q1q1q1q1q1q1q1"),
    ]);
    const res = await SELF.fetch("http://localhost/api/analysis", { headers: await authHeaders(sessionToken) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      insurance_summary: Record<string, Array<{ custom_name: string; render: Render; image_url: string | null }>>;
    };
    const rows = Object.values(body.insurance_summary).filter(Array.isArray).flat();
    const byName = new Map(rows.map((r) => [r.custom_name, r]));
    expect(byName.get("stock")!.render?.hash).toBe("q0q0q0q0q0q0q0q0");
    expect(byName.get("stock")!.image_url).toBe("https://example.test/zzr-insured.jpg");
    expect(byName.get("red")!.render?.hash).toBe("q1q1q1q1q1q1q1q1");
  });

  it("GET /api/hangar-cleanup gives each pledge ship its render in the equipped paint", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const ship = await seedShip("zzr-cleanup", "Zzr Cleanup", "zzr_cleanup");
    const entry = await seedFleetEntry(env.DB, userId, ship, { pledge_id: "770001" });
    const fleet = await env.DB.prepare("SELECT rsi_account_id FROM user_fleet WHERE id = ?").bind(entry).first<{ rsi_account_id: number }>();
    const sync = await env.DB
      .prepare("INSERT INTO user_hangar_syncs (user_id, rsi_account_id, source, synced_at) VALUES (?, ?, 'extension', datetime('now')) RETURNING id")
      .bind(userId, fleet!.rsi_account_id)
      .first<{ id: number }>();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO user_pledges (user_id, sync_id, rsi_pledge_id, name, value_cents, currency, rsi_account_id)
         VALUES (?, ?, 770001, 'Standalone Ship - Zzr Cleanup', 5000, 'New Money', ?)`,
      ).bind(userId, sync!.id, fleet!.rsi_account_id),
      renderRow("zzr_cleanup", "", "iso", "u0u0u0u0u0u0u0u0"),
    ]);
    const res = await SELF.fetch("http://localhost/api/hangar-cleanup", { headers: await authHeaders(sessionToken) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { pledges: Array<{ rsi_pledge_id: number; ships: Array<{ render: Render; image_url: string | null }> }> };
    const pledge = body.pledges.find((p) => p.rsi_pledge_id === 770001)!;
    expect(pledge.ships).toHaveLength(1);
    expect(pledge.ships[0].render).toEqual({ hash: "u0u0u0u0u0u0u0u0", width: 2048, height: 1536, view: "iso" });
    expect(pledge.ships[0].image_url).toBe("https://example.test/zzr-cleanup.jpg");
  });

  it("GET /api/vehicles/loaners gives each loaner its stock render", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const concept = await seedVehicle(env.DB, { slug: "zzr-concept", name: "Zzr Concept", production_status_id: 3 });
    const loaner = await seedShip("zzr-loaner", "Zzr Loaner", "zzr_loaner");
    await env.DB.prepare("INSERT OR IGNORE INTO vehicle_loaners (vehicle_id, loaner_id) VALUES (?, ?)").bind(concept, loaner).run();
    await seedFleetEntry(env.DB, userId, concept);
    await env.DB.batch([renderRow("zzr_loaner", "", "iso", "n0n0n0n0n0n0n0n0")]);
    const res = await SELF.fetch("http://localhost/api/vehicles/loaners", { headers: await authHeaders(sessionToken) });
    const rows = (await res.json()) as Array<{ vehicle_slug: string; render: Render }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].render?.hash).toBe("n0n0n0n0n0n0n0n0");
  });

  it("GET /api/u/:handle/fleet gives each ship its render", async () => {
    const { userId } = await createTestUser(env.DB);
    const ship = await seedShip("zzr-public", "Zzr Public", "zzr_public");
    await seedFleetEntry(env.DB, userId, ship);
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO user_rsi_profile (user_id, handle, verified_handle, verified_at, fetched_at)
         VALUES (?, 'ZzrPublic', 'ZzrPublic', datetime('now'), datetime('now'))`,
      ).bind(userId),
      env.DB.prepare("INSERT INTO user_settings (user_id, key, value) VALUES (?, 'publicFleetShare', 'true')").bind(userId),
      renderRow("zzr_public", "", "iso", "p0p0p0p0p0p0p0p0"),
    ]);
    const res = await SELF.fetch("http://localhost/api/u/ZzrPublic/fleet");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ships: Array<{ render: Render; image_url: string | null }> };
    expect(body.ships).toHaveLength(1);
    expect(body.ships[0].render?.hash).toBe("p0p0p0p0p0p0p0p0");
    expect(body.ships[0].image_url).toBe("https://example.test/zzr-public.jpg");
  });

  it("org fleet and op ships give each ship its render", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const orgId = crypto.randomUUID();
    const now = new Date().toISOString();
    const ship = await seedShip("zzr-org", "Zzr Org", "zzr_org");
    const fleetId = await seedFleetEntry(env.DB, userId, ship);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO "organization" (id, name, slug, createdAt) VALUES (?, 'Zzr Org', 'zzr-org', ?)`).bind(orgId, now),
      env.DB.prepare(`INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, 'member', ?)`)
        .bind(crypto.randomUUID(), orgId, userId, now),
      env.DB.prepare("UPDATE user_fleet SET org_visibility = 'org' WHERE id = ?").bind(fleetId),
      env.DB.prepare("INSERT OR IGNORE INTO op_types (key, label) VALUES ('zzr', 'Zzr')"),
      renderRow("zzr_org", "", "iso", "o0o0o0o0o0o0o0o0"),
    ]);
    const headers = await authHeaders(sessionToken);

    const fleetRes = await SELF.fetch("http://localhost/api/orgs/zzr-org/fleet", { headers });
    expect(fleetRes.status).toBe(200);
    const fleet = ((await fleetRes.json()) as { fleet: Array<{ render: Render; image_url: string | null }> }).fleet;
    expect(fleet).toHaveLength(1);
    expect(fleet[0].render?.hash).toBe("o0o0o0o0o0o0o0o0");
    expect(fleet[0].image_url).toBe("https://example.test/zzr-org.jpg");

    const opType = await env.DB.prepare("SELECT id FROM op_types WHERE key = 'zzr'").first<{ id: number }>();
    const op = await env.DB
      .prepare("INSERT INTO org_ops (org_id, name, op_type_id, status, created_by) VALUES (?, 'Op', ?, 'planning', ?) RETURNING id")
      .bind(orgId, opType!.id, userId)
      .first<{ id: number }>();
    await env.DB
      .prepare("INSERT INTO org_op_ships (org_op_id, user_fleet_id, owner_user_id) VALUES (?, ?, ?)")
      .bind(op!.id, fleetId, userId)
      .run();
    const opRes = await SELF.fetch(`http://localhost/api/orgs/zzr-org/ops/${op!.id}`, { headers });
    expect(opRes.status).toBe(200);
    const ships = ((await opRes.json()) as { ships: Array<{ render: Render; image_url: string | null }> }).ships;
    expect(ships).toHaveLength(1);
    expect(ships[0].render?.hash).toBe("o0o0o0o0o0o0o0o0");
    expect(ships[0].image_url).toBe("https://example.test/zzr-org.jpg");
  });

  it("GET /api/gamedata/salvageable-ships gives each ship its render", async () => {
    const ship = await seedShip("zzr-salvage", "Zzr Salvage", "zzr_salvage");
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO salvageable_ships (entity_name, entity_uuid, base_vehicle_id, variant_type) VALUES ('zzr_salvage_derelict', ?, ?, 'derelict')",
      ).bind(crypto.randomUUID(), ship),
      env.DB.prepare(
        "INSERT INTO salvageable_ships (entity_name, entity_uuid, base_vehicle_id, variant_type) VALUES ('zzr_salvage_boarded', ?, ?, 'boarded')",
      ).bind(crypto.randomUUID(), ship),
      renderRow("zzr_salvage", "", "side", "s1s1s1s1s1s1s1s1"),
      renderRow("zzr_salvage", "", "iso", "s0s0s0s0s0s0s0s0"),
    ]);
    const res = await SELF.fetch("http://localhost/api/gamedata/salvageable-ships");
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<{ slug: string; render: Render; variant_count: number }>;
    const mine = rows.filter((r) => r.slug === "zzr-salvage");
    expect(mine).toHaveLength(1);
    expect(mine[0].variant_count).toBe(2);
    expect(mine[0].render?.hash).toBe("s0s0s0s0s0s0s0s0");
  });
});

describe("paint render matching is case-insensitive on class_name", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  it("a paint with a mixed-case class_name matches the lower-case variant", async () => {
    const hull = await seedShip("zzr-case", "Zzr Case", "zzr_case");
    await seedPaint("Zzr Case Shared", "zzr-case-shared", "Paint_Zzr_Shared", [hull]);
    await env.DB.batch([renderRow("zzr_case", "paint_zzr_shared", "iso", "q0q0q0q0q0q0q0q0")]);

    const onHull = await SELF.fetch("http://localhost/api/paints/ship/zzr-case");
    const paints = (await onHull.json()) as Array<{ slug: string; render: Render }>;
    expect(paints.find((p) => p.slug === "zzr-case-shared")!.render?.hash).toBe("q0q0q0q0q0q0q0q0");

    const detail = await SELF.fetch("http://localhost/api/paints/zzr-case-shared");
    const body = (await detail.json()) as { render: Render };
    expect(body.render?.hash).toBe("q0q0q0q0q0q0q0q0");
  });
});

// ── render on loot items and armour sets ─────────────────────────────
//
// Loot rows carry `render` from item_key = class_name, variant ''. An armour
// set's render is keyed by its pieces' class_names (armourSetRenderKey).

function lootRender(kind: string, itemKey: string, view: string, hash: string) {
  return env.DB.prepare(INSERT_SQL).bind(kind, itemKey, "", view, hash, 1024, 2048, "4.10.3-live");
}

function lootRow(table: string, uuid: string, name: string, className: string, type: string, category: string) {
  return env.DB
    .prepare(`INSERT INTO ${table} (uuid, name, class_name, type, category, game_version_id) VALUES (?, ?, ?, ?, ?, 1)`)
    .bind(uuid, name, className, type, category);
}

describe("render on loot items", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    await env.DB.batch([
      lootRow("loot_map", "zzr-loot-0001", "Zzr Jacket", "zzr_jacket_01", "Char_Clothing_Torso_1", "clothing"),
      lootRow("loot_map", "zzr-loot-0002", "Zzr Medpen", "zzr_medpen_01", "FPS_Consumable", "consumable"),
      lootRow("loot_map", "zzr-loot-0003", "Zzr Mixed Pistol", "ZZR_Mixed_Pistol", "WeaponPersonal", "weapon"),
      lootRow("ptu_loot_map", "zzr-loot-0004", "Zzr PTU Rifle", "zzr_ptu_rifle", "WeaponPersonal", "weapon"),
      lootRender("fps_clothing", "zzr_jacket_01", "worn_female", "f9f9f9f9f9f9f9f9"),
      lootRender("fps_clothing", "zzr_jacket_01", "worn_male", "e8e8e8e8e8e8e8e8"),
      lootRender("fps_weapon", "zzr_mixed_pistol", "side", "d7d7d7d7d7d7d7d7"),
      lootRender("fps_weapon", "zzr_ptu_rifle", "side", "c6c6c6c6c6c6c6c6"),
      // Female-only clothing.
      lootRow("loot_map", "zzr-loot-0005", "Zzr Dress", "zzr_dress_01", "Char_Clothing_Torso_1", "clothing"),
      lootRender("fps_clothing", "zzr_dress_01", "worn_female", "b4b4b4b4b4b4b4b4"),
      // A weapon finish is its own loot row but is published under the base
      // weapon's key, with the finish class_name as the variant.
      lootRow("loot_map", "zzr-loot-0006", "Zzr Rifle", "zzr_rifle_01", "WeaponPersonal", "weapon"),
      lootRow("loot_map", "zzr-loot-0007", "Zzr Rifle Black", "ZZR_Rifle_01_Black02", "WeaponPersonal", "weapon"),
      lootRender("fps_weapon", "zzr_rifle_01", "side", "a3a3a3a3a3a3a3a3"),
      env.DB.prepare(INSERT_SQL).bind("fps_weapon", "zzr_rifle_01", "zzr_rifle_01_black02", "worn_male", "a5a5a5a5a5a5a5a5", 1024, 2048, "4.10.3-live"),
      env.DB.prepare(INSERT_SQL).bind("fps_weapon", "zzr_rifle_01", "zzr_rifle_01_black02", "side", "a6a6a6a6a6a6a6a6", 2048, 1024, "4.10.3-live"),
      // An item with its own stock render keeps it even when another item
      // publishes a variant of the same name.
      lootRow("loot_map", "zzr-loot-0008", "Zzr Own Stock", "zzr_own_stock", "WeaponPersonal", "weapon"),
      lootRender("fps_weapon", "zzr_own_stock", "side", "a7a7a7a7a7a7a7a7"),
      env.DB.prepare(INSERT_SQL).bind("fps_weapon", "zzr_other_base", "zzr_own_stock", "iso", "a8a8a8a8a8a8a8a8", 2048, 1024, "4.10.3-live"),
    ]);
  });

  it("GET /api/loot gives a female-only clothing item its worn_female render", async () => {
    const res = await SELF.fetch("http://localhost/api/loot");
    const items = (await res.json()) as Array<{ uuid: string; render: Render }>;
    const dress = items.filter((i) => i.uuid === "zzr-loot-0005");
    expect(dress).toHaveLength(1);
    expect(dress[0].render).toEqual({ hash: "b4b4b4b4b4b4b4b4", width: 1024, height: 2048, view: "worn_female" });
  });

  it("GET /api/loot gives a weapon finish the base weapon's render of that finish", async () => {
    const res = await SELF.fetch("http://localhost/api/loot");
    type Row = { uuid: string; render: Render; render_item_key: string | null; render_variant: string | null; render_variants_kind: string | null };
    const items = (await res.json()) as Row[];
    const finish = items.filter((i) => i.uuid === "zzr-loot-0007");
    expect(finish).toHaveLength(1);
    expect(finish[0].render).toEqual({ hash: "a6a6a6a6a6a6a6a6", width: 2048, height: 1024, view: "side" });
    expect(finish[0].render_item_key).toBe("zzr_rifle_01");
    expect(finish[0].render_variant).toBe("zzr_rifle_01_black02");
    expect(finish[0].render_variants_kind).toBe("fps_weapon");
    const base = items.find((i) => i.uuid === "zzr-loot-0006")!;
    expect(base.render?.hash).toBe("a3a3a3a3a3a3a3a3");
    expect(base.render_item_key).toBe("zzr_rifle_01");
    expect(base.render_variant).toBe("");
    const own = items.filter((i) => i.uuid === "zzr-loot-0008");
    expect(own).toHaveLength(1);
    expect(own[0].render?.hash).toBe("a7a7a7a7a7a7a7a7");
    expect(own[0].render_item_key).toBe("zzr_own_stock");
  });

  it("GET /api/loot/:uuid gives a weapon finish the base weapon's render of that finish", async () => {
    const res = await SELF.fetch("http://localhost/api/loot/zzr-loot-0007");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect((body.render as Render)?.hash).toBe("a6a6a6a6a6a6a6a6");
    expect(body.render_item_key).toBe("zzr_rifle_01");
    expect(body.render_variant).toBe("zzr_rifle_01_black02");
    expect(body.render_variants_kind).toBe("fps_weapon");
  });

  it("GET /api/loot lists a clothing item once, with its worn_male render", async () => {
    const res = await SELF.fetch("http://localhost/api/loot");
    expect(res.status).toBe(200);
    const items = (await res.json()) as Array<{ uuid: string; render: Render; render_variants_kind: string | null; render_item_key: string | null }>;
    const jacket = items.filter((i) => i.uuid === "zzr-loot-0001");
    expect(jacket).toHaveLength(1);
    expect(jacket[0].render).toEqual({ hash: "e8e8e8e8e8e8e8e8", width: 1024, height: 2048, view: "worn_male" });
    expect(jacket[0]).not.toHaveProperty("render_hash");
    expect(jacket[0].render_variants_kind).toBe("fps_clothing");
    expect(jacket[0].render_item_key).toEqual(expect.any(String));
    expect(items.find((i) => i.uuid === "zzr-loot-0002")!.render).toBeNull();
    expect(items.find((i) => i.uuid === "zzr-loot-0002")!.render_item_key).toBeNull();
    expect(items.find((i) => i.uuid === "zzr-loot-0003")!.render?.hash).toBe("d7d7d7d7d7d7d7d7");
  });

  it("GET /api/loot?channel=PTU reads ptu_loot_map and still joins item_renders", async () => {
    const res = await SELF.fetch("http://localhost/api/loot?channel=PTU");
    expect(res.status).toBe(200);
    const items = (await res.json()) as Array<{ uuid: string; render: Render }>;
    expect(items.find((i) => i.uuid === "zzr-loot-0004")!.render?.hash).toBe("c6c6c6c6c6c6c6c6");
  });

  it("GET /api/loot/:uuid returns render and render_variants_kind", async () => {
    const res = await SELF.fetch("http://localhost/api/loot/zzr-loot-0001");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.render).toEqual({ hash: "e8e8e8e8e8e8e8e8", width: 1024, height: 2048, view: "worn_male" });
    expect(body.render_variants_kind).toBe("fps_clothing");
    expect(body).not.toHaveProperty("render_hash");
  });

  it("GET /api/loot/:uuid gives render and render_variants_kind null without a render", async () => {
    const res = await SELF.fetch("http://localhost/api/loot/zzr-loot-0002");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.render).toBeNull();
    expect(body.render_variants_kind).toBeNull();
  });

  it("GET /api/loot/:uuid?channel=PTU joins item_renders for a PTU item", async () => {
    const res = await SELF.fetch("http://localhost/api/loot/zzr-loot-0004?channel=PTU");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect((body.render as Render)?.hash).toBe("c6c6c6c6c6c6c6c6");
    expect(body.render_variants_kind).toBe("fps_weapon");
  });
});

describe("armourSetRenderKey", () => {
  it("lower-cases, drops undersuits, sorts and joins with a comma", () => {
    expect(
      armourSetRenderKey(
        ["KAP_Combat_Heavy_Legs_01_01_01", "cds_undersuit_01_01_12", "kap_combat_heavy_core_01_01_01"],
        new Set(["cds_undersuit_01_01_12"]),
      ),
    ).toBe("kap_combat_heavy_core_01_01_01,kap_combat_heavy_legs_01_01_01");
  });

  // Shared parity vector: scripts/renders/link.py armour_set_key must give the same.
  it("dedupes pieces case-insensitively (parity vector with the publisher)", () => {
    expect(armourSetRenderKey(["KAP_Arms", "kap_arms", "kap_core", "UndS"], ["unds"])).toBe("kap_arms,kap_core");
  });

  it("matches undersuit class_names case-insensitively", () => {
    expect(armourSetRenderKey(["B_Core", "A_Legs", "CDS_Undersuit"], new Set(["cds_undersuit"]))).toBe("a_legs,b_core");
  });
});

describe("render on armour sets", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    const A = "INSERT INTO fps_armour (uuid, name, class_name, sub_type, game_version_id) VALUES (?, ?, ?, ?, 1)";
    await env.DB.batch([
      env.DB.prepare(A).bind("zzr-fa-1", "Zzr Armor Core", "ZZR_Armor_Core_01", "Medium"),
      env.DB.prepare(A).bind("zzr-fa-2", "Zzr Armor Legs", "zzr_armor_legs_01", "Medium"),
      env.DB.prepare(A).bind("zzr-fa-3", "Zzr Armor Undersuit", "zzr_undersuit_01", "UNDEFINED"),
      lootRow("loot_map", "zzr-set-0001", "Zzr Armor Core", "ZZR_Armor_Core_01", "Char_Armor_Torso", "armour"),
      lootRow("loot_map", "zzr-set-0002", "Zzr Armor Legs", "zzr_armor_legs_01", "Char_Armor_Legs", "armour"),
      lootRow("loot_map", "zzr-set-0003", "Zzr Armor Undersuit", "zzr_undersuit_01", "Char_Armor_Undersuit", "undersuit"),
      lootRow("loot_map", "zzr-set-0004", "Zzb Armor Core", "zzb_armor_core_01", "Char_Armor_Torso", "armour"),
      lootRender("armour_set", "zzr_armor_core_01,zzr_armor_legs_01", "worn_female", "b5b5b5b5b5b5b5b5"),
      lootRender("armour_set", "zzr_armor_core_01,zzr_armor_legs_01", "worn_male", "a4a4a4a4a4a4a4a4"),
    ]);
  });

  it("GET /api/loot/sets/:setSlug returns the set render looked up by its piece key", async () => {
    const res = await SELF.fetch("http://localhost/api/loot/sets/zzr-armor");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { pieces: unknown[]; render: Render; render_item_key: string | null };
    expect(body.pieces).toHaveLength(3);
    expect(body.render_item_key).toBe("zzr_armor_core_01,zzr_armor_legs_01");
    expect(body.render).toEqual({ hash: "a4a4a4a4a4a4a4a4", width: 1024, height: 2048, view: "worn_male" });
  });

  it("GET /api/loot/sets/:setSlug gives render: null when the set has no render", async () => {
    const res = await SELF.fetch("http://localhost/api/loot/sets/zzb-armor");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { render: Render; render_item_key: string | null };
    expect(body.render).toBeNull();
    expect(body.render_item_key).toBeNull();
  });
});

describe("lootRenderJoin query plan", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  it("looks item_renders up by index, never by scanning it per loot row", async () => {
    const plan = await env.DB
      .prepare(`EXPLAIN QUERY PLAN SELECT lm.id, r.hash FROM loot_map lm ${lootRenderJoin("r", "lm.class_name")}`)
      .all<{ detail: string }>();
    const details = plan.results.map((p) => p.detail);
    expect(details.some((d) => /SEARCH _ir/.test(d))).toBe(true);
    expect(details.filter((d) => /SCAN _ir/.test(d))).toEqual([]);
  });
});

describe("RENDER_KINDS", () => {
  it("is exactly the 17 kinds the publisher writes", () => {
    expect([...RENDER_KINDS]).toEqual([
      "vehicle", "ship_weapon", "fps_weapon", "fps_melee", "fps_attachment", "fps_armour",
      "armour_set", "fps_clothing", "consumable", "vehicle_component", "ship_missile",
      "carryable", "prop", "fps_utility", "cargo_crate", "storage_container", "harvestable",
    ]);
  });
});

describe("toRenderRef", () => {
  it("folds render_* columns into a RenderRef, or null when there is no hash", () => {
    expect(toRenderRef({ render_hash: "x", render_width: 1, render_height: 2, render_view: "iso" }))
      .toEqual({ hash: "x", width: 1, height: 2, view: "iso" });
    expect(toRenderRef({ render_hash: null, render_width: null, render_height: null, render_view: null })).toBeNull();
  });
});

describe("render on FPS loadout slots", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  it("GET /api/fps-loadouts gives each slot its item's render, and null when it has none", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const headers = await authHeaders(sessionToken);
    const json = { ...headers, "Content-Type": "application/json" };
    const rifle = "0f5a0b6c-1111-4c3a-9d2e-aaaaaaaaaaaa";
    const plain = "0f5a0b6c-2222-4c3a-9d2e-bbbbbbbbbbbb";
    await env.DB.batch([
      env.DB.prepare("INSERT INTO loot_map (uuid, name, class_name, type, category, game_version_id) VALUES (?, ?, ?, ?, ?, 1)")
        .bind(rifle, "Lp Rifle", "lp_rifle_01", "WeaponPersonal", "weapon"),
      env.DB.prepare("INSERT INTO loot_map (uuid, name, class_name, type, category, game_version_id) VALUES (?, ?, ?, ?, ?, 1)")
        .bind(plain, "Lp Gadget", "lp_gadget_01", "Gadget", "utility"),
      env.DB.prepare(INSERT_SQL).bind("fps_weapon", "lp_rifle_01", "", "side", "f1f1f1f1f1f1f1f1", 1024, 512, "4.10.3-live"),
    ]);
    const create = await SELF.fetch("http://localhost/api/fps-loadouts", { method: "POST", headers: json, body: JSON.stringify({ name: "Render Kit" }) });
    const { id } = (await create.json()) as { id: number };
    for (const [slot, uuid, name] of [["primary", rifle, "Lp Rifle"], ["util_gadget", plain, "Lp Gadget"]]) {
      const put = await SELF.fetch(`http://localhost/api/fps-loadouts/${id}/slots/${slot}`, {
        method: "PUT", headers: json, body: JSON.stringify({ itemUuid: uuid, itemName: name }),
      });
      expect(put.status).toBe(200);
    }

    const res = await SELF.fetch("http://localhost/api/fps-loadouts", { headers });
    const body = (await res.json()) as { items: Array<{ id: number; slots: Array<Record<string, unknown>> }> };
    const slots = Object.fromEntries(body.items.find((l) => l.id === id)!.slots.map((s) => [s.slot_key, s]));
    expect(slots.primary.render).toEqual({ hash: "f1f1f1f1f1f1f1f1", width: 1024, height: 512, view: "side" });
    expect(slots.primary.render_variants_kind).toBe("fps_weapon");
    expect(slots.primary.render_item_key).toBe("lp_rifle_01");
    expect(slots.util_gadget.render).toBeNull();
    expect(slots.primary).not.toHaveProperty("render_hash");
  });
});

describe("render on FPS loadout slots holding a crafting blueprint", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  it("maps a weapon or armour slot's blueprint uuid to its item's render", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const headers = await authHeaders(sessionToken);
    const json = { ...headers, "Content-Type": "application/json" };
    const bp = "0f5a0b6c-3333-4c3a-9d2e-cccccccccccc";
    await env.DB.batch([
      env.DB.prepare("INSERT INTO crafting_blueprints (uuid, tag, name, type, sub_type) VALUES (?, ?, ?, ?, ?)")
        .bind(bp, "BP_CRAFT_lp_lmg_01", "Lp Lmg 01", "weapons", "lmg"),
      env.DB.prepare(INSERT_SQL).bind("fps_weapon", "lp_lmg_01", "", "side", "e1e1e1e1e1e1e1e1", 1024, 512, "4.10.3-live"),
    ]);
    const create = await SELF.fetch("http://localhost/api/fps-loadouts", { method: "POST", headers: json, body: JSON.stringify({ name: "Bp Kit" }) });
    const { id } = (await create.json()) as { id: number };
    const put = await SELF.fetch(`http://localhost/api/fps-loadouts/${id}/slots/primary`, {
      method: "PUT", headers: json, body: JSON.stringify({ itemUuid: bp, itemName: "Lp LMG" }),
    });
    expect(put.status).toBe(200);

    const res = await SELF.fetch("http://localhost/api/fps-loadouts", { headers });
    const body = (await res.json()) as { items: Array<{ id: number; slots: Array<Record<string, unknown>> }> };
    const slot = body.items.find((l) => l.id === id)!.slots[0];
    expect(slot.render).toEqual({ hash: "e1e1e1e1e1e1e1e1", width: 1024, height: 512, view: "side" });
    expect(slot.render_item_key).toBe("lp_lmg_01");
  });
});

describe("ship side renders for the size lineup", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  it("GET /api/ships returns side_render: the stock side view, beside the card render", async () => {
    await seedShip("zzr-lineup-both", "Zzr Lineup Both", "zzr_lineup_both");
    await seedShip("zzr-lineup-iso", "Zzr Lineup Iso", "zzr_lineup_iso");
    await env.DB.batch([
      renderRow("zzr_lineup_both", "", "iso", "f0f0f0f0f0f0f0f0"),
      renderRow("zzr_lineup_both", "", "side", "f1f1f1f1f1f1f1f1"),
      // A paint's side render is not the stock side view.
      renderRow("zzr_lineup_iso", "", "iso", "f2f2f2f2f2f2f2f2"),
      renderRow("zzr_lineup_iso", "paint_zzr_red", "side", "f3f3f3f3f3f3f3f3"),
    ]);
    const res = await SELF.fetch("http://localhost/api/ships");
    expect(res.status).toBe(200);
    type Ship = { slug: string; render: Render; side_render: Render };
    const ships = (await res.json()) as Ship[];
    const both = ships.find((s) => s.slug === "zzr-lineup-both")!;
    expect(both.render?.view).toBe("iso");
    expect(both.side_render).toEqual({ hash: "f1f1f1f1f1f1f1f1", width: 2048, height: 1536, view: "side" });
    expect(ships.find((s) => s.slug === "zzr-lineup-iso")!.side_render).toBeNull();
    expect(both).not.toHaveProperty("side_render_hash");
  });
});

describe("render on mining equipment", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  it("GET /api/gamedata/mining gives each laser, module and gadget its render by class name", async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO mining_lasers (name, class_name, size, game_version_id) VALUES ('Lp Arbor', 'Mining_Laser_LP_Arbor_S1', 1, 1)"),
      env.DB.prepare("INSERT INTO mining_lasers (name, size, game_version_id) VALUES ('Lp Unlinked', 1, 1)"),
      env.DB.prepare("INSERT INTO mining_modules (name, class_name, type, size, game_version_id) VALUES ('Lp Brandt', 'mining_modules_active_lp_brandt', 'active', 1, 1)"),
      env.DB.prepare("INSERT INTO mining_gadgets (name, class_name, game_version_id) VALUES ('Lp Optimax', 'mining_gadget_lp_optimax', 1)"),
      env.DB.prepare(INSERT_SQL).bind("vehicle_component", "mining_laser_lp_arbor_s1", "", "iso", "c1c1c1c1c1c1c1c1", 1024, 768, "4.10.3-live"),
      env.DB.prepare(INSERT_SQL).bind("vehicle_component", "mining_modules_active_lp_brandt", "", "side", "c2c2c2c2c2c2c2c2", 1024, 768, "4.10.3-live"),
      env.DB.prepare(INSERT_SQL).bind("fps_utility", "mining_gadget_lp_optimax", "", "iso", "c3c3c3c3c3c3c3c3", 1024, 768, "4.10.3-live"),
    ]);
    const res = await SELF.fetch("http://localhost/api/gamedata/mining");
    expect(res.status).toBe(200);
    type Row = Record<string, unknown>;
    const body = (await res.json()) as { lasers: Row[]; modules: Row[]; gadgets: Row[] };
    const by = (rows: Row[], name: string) => rows.find((r) => r.name === name)!;
    expect(by(body.lasers, "Lp Arbor").render).toEqual({ hash: "c1c1c1c1c1c1c1c1", width: 1024, height: 768, view: "iso" });
    expect(by(body.lasers, "Lp Arbor").render_item_key).toBe("mining_laser_lp_arbor_s1");
    expect(by(body.lasers, "Lp Unlinked").render).toBeNull();
    expect(by(body.modules, "Lp Brandt").render).toEqual({ hash: "c2c2c2c2c2c2c2c2", width: 1024, height: 768, view: "side" });
    expect(by(body.gadgets, "Lp Optimax").render_variants_kind).toBe("fps_utility");
    expect(by(body.lasers, "Lp Arbor")).not.toHaveProperty("render_hash");
  });
});

describe("ship side render scale", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  it("GET /api/ships gives side_render the render's metres per pixel and the ship's drawn length, when it has them", async () => {
    await seedShip("zzr-scale", "Zzr Scale", "zzr_scale");
    await seedShip("zzr-noscale", "Zzr No Scale", "zzr_noscale");
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO item_renders (kind, item_key, variant, view, hash, width, height, source_version, metres_per_pixel, span_m) VALUES ('vehicle', 'zzr_scale', '', 'side', 'a9a9a9a9a9a9a9a9', 2048, 512, '4.10.3-live', 0.0625, 123.5)",
      ),
      renderRow("zzr_noscale", "", "side", "b9b9b9b9b9b9b9b9"),
    ]);
    const res = await SELF.fetch("http://localhost/api/ships");
    type Ship = { slug: string; side_render: Record<string, unknown> | null };
    const ships = (await res.json()) as Ship[];
    expect(ships.find((s) => s.slug === "zzr-scale")!.side_render).toEqual({
      hash: "a9a9a9a9a9a9a9a9", width: 2048, height: 512, view: "side", metres_per_pixel: 0.0625, span_m: 123.5,
    });
    expect(ships.find((s) => s.slug === "zzr-noscale")!.side_render).toEqual({
      hash: "b9b9b9b9b9b9b9b9", width: 2048, height: 1536, view: "side",
    });
    expect(ships.find((s) => s.slug === "zzr-noscale")!.side_render).not.toHaveProperty("metres_per_pixel");
  });
});
