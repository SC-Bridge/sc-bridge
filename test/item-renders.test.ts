import { describe, it, expect, beforeAll } from "vitest";
import { env, SELF } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders, seedVehicle, seedFleetEntry } from "./helpers";
import { toRenderRef } from "../src/lib/renders";

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

  it("returns an empty list for an unknown item", async () => {
    const res = await SELF.fetch("http://localhost/api/renders/vehicle/nope_nothing");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ variants: [] });
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
    expect(ships.find((s) => s.slug === "zzr-list-female")?.render).toBeNull();
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
      hull_renders: Array<{ vehicle_slug: string; vehicle_name: string; render: Render }>;
    };
    expect(body.image_url).toBe("https://example.test/zzr-detail.jpg");
    expect(body.vehicles).toHaveLength(3);
    expect(body.hull_renders).toEqual([
      { vehicle_slug: "zzr-hull-alpha", vehicle_name: "Zzr Hull Alpha",
        render: { hash: "h0h0h0h0h0h0h0h0", width: 2048, height: 1536, view: "iso" } },
      { vehicle_slug: "zzr-hull-bravo", vehicle_name: "Zzr Hull Bravo",
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
    const paints = (await res.json()) as Array<{ slug: string; render: Render; image_url: string | null }>;
    const listed = paints.filter((p) => p.slug === "zzr-listed");
    expect(listed).toHaveLength(1);
    expect(listed[0].render).toEqual({ hash: "l1l1l1l1l1l1l1l1", width: 2048, height: 1536, view: "side" });
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

describe("toRenderRef", () => {
  it("folds render_* columns into a RenderRef, or null when there is no hash", () => {
    expect(toRenderRef({ render_hash: "x", render_width: 1, render_height: 2, render_view: "iso" }))
      .toEqual({ hash: "x", width: 1, height: 2, view: "iso" });
    expect(toRenderRef({ render_hash: null, render_width: null, render_height: null, render_view: null })).toBeNull();
  });
});
