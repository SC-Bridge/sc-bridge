import { describe, it, expect, beforeAll } from "vitest";
import { env, SELF } from "cloudflare:test";
import { setupTestDatabase, TEST_GAME_VERSION_ID } from "./apply-migrations";
import { createTestUser, authHeaders } from "./helpers";
import { executeChatTool } from "../src/lib/chat-tools";

const V = TEST_GAME_VERSION_ID;
let seq = 0;
const tag = () => `cmp${++seq}x${crypto.randomUUID().slice(0, 6)}`;

async function run(userId: string, name: string, args: Record<string, unknown>) {
  return JSON.parse(await executeChatTool(env.DB, userId, { id: "c", name, arguments: args })) as Record<string, any>;
}

/** Insert a vehicle_components row (+ its stat row) and return its id. */
async function seedComponent(opts: {
  name: string;
  className: string;
  type: string;
  size?: number;
  grade?: string;
  weapon?: { dps: number };
  shield?: { shield_hp: number };
}): Promise<number> {
  await env.DB.prepare(
    `INSERT INTO vehicle_components (uuid, name, slug, class_name, type, size, grade, game_version_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(`${opts.className}-uuid`, opts.name, opts.className, opts.className, opts.type, opts.size ?? 3, opts.grade ?? "A", V).run();
  const row = await env.DB.prepare("SELECT id FROM vehicle_components WHERE class_name = ?").bind(opts.className).first<{ id: number }>();
  const id = row!.id;
  if (opts.weapon) {
    await env.DB.prepare("INSERT INTO component_weapons (component_id, dps, game_version_id) VALUES (?, ?, ?)").bind(id, opts.weapon.dps, V).run();
  }
  if (opts.shield) {
    await env.DB.prepare("INSERT INTO component_shields (component_id, shield_hp, game_version_id) VALUES (?, ?, ?)").bind(id, opts.shield.shield_hp, V).run();
  }
  return id;
}

/** Make a component buyable at a new shop for `price` aUEC. */
async function sellAt(className: string, shopName: string, price: number): Promise<void> {
  const key = `${shopName}-${crypto.randomUUID().slice(0, 6)}`;
  await env.DB.prepare(
    "INSERT OR IGNORE INTO loot_map (uuid, name, class_name, game_version_id) VALUES (?, ?, ?, ?)",
  ).bind(`${className}-uuid`, className, `EntityClassDefinition.${className}`, V).run();
  await env.DB.prepare(
    `INSERT INTO shops (uuid, name, display_name, slug, shop_type, is_event, location_label, game_version_id)
     VALUES (?, ?, ?, ?, 'ship', 0, 'Area18', ?)`,
  ).bind(`${key}-shop`, key, shopName, key, V).run();
  const shop = await env.DB.prepare("SELECT id FROM shops WHERE slug = ?").bind(key).first<{ id: number }>();
  await env.DB.prepare(
    `INSERT INTO terminals (uuid, shop_id, shop_name_key, terminal_type, game_version_id) VALUES (?, ?, ?, 'item', ?)`,
  ).bind(`${key}-term`, shop!.id, `SCShop_${key}`, V).run();
  const term = await env.DB.prepare("SELECT id FROM terminals WHERE uuid = ?").bind(`${key}-term`).first<{ id: number }>();
  await env.DB.prepare(
    `INSERT INTO terminal_inventory (terminal_id, item_uuid, item_name, latest_buy_price, latest_source, latest_observed_at, game_version_id)
     VALUES (?, ?, ?, ?, 'uex', datetime('now'), ?)`,
  ).bind(term!.id, `${className}-uuid`, className, price, V).run();
}

describe("chat tools — search_components / get_component_details", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  it("search weapons sorted by dps", async () => {
    const { userId } = await createTestUser(env.DB);
    const t = tag();
    await seedComponent({ name: `${t} Low`, className: `${t}_low`, type: "WeaponGun", weapon: { dps: 300 } });
    await seedComponent({ name: `${t} High`, className: `${t}_high`, type: "WeaponGun", weapon: { dps: 500 } });
    await seedComponent({ name: `${t} Mid`, className: `${t}_mid`, type: "WeaponGun", weapon: { dps: 400 } });
    const out = await run(userId, "search_components", { category: "weapon", query: t, sort_by: "dps" });
    expect(out.components.map((c: { stats: { dps: number } }) => c.stats.dps)).toEqual([500, 400, 300]);
    expect(out.total).toBe(3);
  });

  it("filters size and grade", async () => {
    const { userId } = await createTestUser(env.DB);
    const t = tag();
    await seedComponent({ name: `${t} S2A`, className: `${t}_s2a`, type: "Shield", size: 2, grade: "A", shield: { shield_hp: 1 } });
    await seedComponent({ name: `${t} S2C`, className: `${t}_s2c`, type: "Shield", size: 2, grade: "C", shield: { shield_hp: 1 } });
    await seedComponent({ name: `${t} S3A`, className: `${t}_s3a`, type: "Shield", size: 3, grade: "A", shield: { shield_hp: 1 } });
    const out = await run(userId, "search_components", { category: "shield", query: t, size: "2", grade: "A" });
    expect(out.components.map((c: { name: string }) => c.name)).toEqual([`${t} S2A`]);
  });

  it("cheapest shop is the lowest buy price", async () => {
    const { userId } = await createTestUser(env.DB);
    const t = tag();
    await seedComponent({ name: `${t} Gun`, className: `${t}_gun`, type: "WeaponGun", weapon: { dps: 100 } });
    await sellAt(`${t}_gun`, "Pricey Shop", 1200);
    await sellAt(`${t}_gun`, "Cheap Shop", 900);
    const out = await run(userId, "search_components", { category: "weapon", query: t });
    expect(out.components[0].cheapest.buy_price).toBe(900);
    const details = await run(userId, "get_component_details", { class_name: `${t}_gun` });
    expect(details.shops.map((s: { buy_price: number }) => s.buy_price)).toEqual([900, 1200]);
  });

  it("component with no shops", async () => {
    const { userId } = await createTestUser(env.DB);
    const t = tag();
    await seedComponent({ name: `${t} Rare`, className: `${t}_rare`, type: "WeaponGun", weapon: { dps: 1 } });
    const out = await run(userId, "search_components", { category: "weapon", query: t });
    expect(out.components[0].cheapest).toBeNull();
    const details = await run(userId, "get_component_details", { class_name: `${t}_rare` });
    expect(details.shops).toEqual([]);
    expect(details.name).toBe(`${t} Rare`);
  });

  it("unknown category returns error listing valid categories", async () => {
    const { userId } = await createTestUser(env.DB);
    const out = await run(userId, "search_components", { category: "laser_sword" });
    expect(out.error).toContain("weapon");
    expect(out.error).toContain("shield");
  });

  it("ambiguous name returns candidates", async () => {
    const { userId } = await createTestUser(env.DB);
    const t = tag();
    await seedComponent({ name: `${t} Rampart`, className: `${t}_r1`, type: "Shield" });
    await seedComponent({ name: `${t} Rampart Mk2`, className: `${t}_r2`, type: "Shield" });
    const out = await run(userId, "get_component_details", { name: `${t} Ramp` });
    expect(out.error).toBeTruthy();
    expect(out.candidates).toHaveLength(2);
  });

  it("exact name shared by several components returns candidates", async () => {
    const { userId } = await createTestUser(env.DB);
    const t = tag();
    await seedComponent({ name: `${t} Twin Name`, className: `${t}_tw_s1`, type: "Shield", size: 1 });
    await seedComponent({ name: `${t} Twin Name`, className: `${t}_tw_s2`, type: "Shield", size: 2 });
    const out = await run(userId, "get_component_details", { name: `${t} Twin Name` });
    expect(out.error).toBeTruthy();
    expect(out.candidates.map((c: { class_name: string }) => c.class_name).sort()).toEqual([`${t}_tw_s1`, `${t}_tw_s2`]);
    expect(out.candidates.map((c: { size: number }) => c.size).sort()).toEqual([1, 2]);
  });

  it("cart/shops route still lists every shop cheapest first", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const t = tag();
    await seedComponent({ name: `${t} Route Gun`, className: `${t}_route`, type: "WeaponGun" });
    await sellAt(`${t}_route`, "Shop B", 700);
    await sellAt(`${t}_route`, "Shop A", 500);
    const res = await SELF.fetch(`http://localhost/api/loadout/cart/shops?class_name=${t}_route`, {
      headers: await authHeaders(sessionToken),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { shops: Array<{ buy_price: number; shop_name: string }> };
    expect(body.shops.map((s) => s.buy_price)).toEqual([500, 700]);
    expect(body.shops[0].shop_name).toBe("Shop A");
  });
});
