import { describe, it, expect, beforeAll } from "vitest";
import { env, SELF } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";

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
