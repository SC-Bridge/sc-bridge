import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, seedVehicle, seedFleetEntry } from "./helpers";
import { executeChatTool } from "../src/lib/chat-tools";

let seq = 0;
const tag = () => `shp${++seq}x${crypto.randomUUID().slice(0, 6)}`;

async function run(userId: string, name: string, args: Record<string, unknown>) {
  return JSON.parse(await executeChatTool(env.DB, userId, { id: "c", name, arguments: args })) as Record<string, any>;
}

describe("chat tools — search_ships / get_ship_details", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  it("search filters by focus and cargo_min", async () => {
    const { userId } = await createTestUser(env.DB);
    const t = tag();
    await seedVehicle(env.DB, { name: `${t} Cargo A`, focus: "Cargo", classification: "Freight", cargo: 96 });
    await seedVehicle(env.DB, { name: `${t} Cargo B`, focus: "Cargo", classification: "Freight", cargo: 32 });
    await seedVehicle(env.DB, { name: `${t} Fighter`, focus: "Combat", cargo: 0 });
    const out = await run(userId, "search_ships", { query: t, focus: "cargo", cargo_min: 50 });
    expect(out.total).toBe(1);
    expect(out.ships.map((s: { name: string }) => s.name)).toEqual([`${t} Cargo A`]);
  });

  it("coerces numeric strings", async () => {
    const { userId } = await createTestUser(env.DB);
    const t = tag();
    await seedVehicle(env.DB, { name: `${t} Big`, cargo: 96 });
    await seedVehicle(env.DB, { name: `${t} Small`, cargo: 8 });
    const out = await run(userId, "search_ships", { query: t, cargo_min: "50" });
    expect(out.ships.map((s: { name: string }) => s.name)).toEqual([`${t} Big`]);
  });

  it("caps at 25 with total", async () => {
    const { userId } = await createTestUser(env.DB);
    const t = tag();
    for (let i = 0; i < 30; i++) await seedVehicle(env.DB, { name: `${t} Hull ${String(i).padStart(2, "0")}` });
    const out = await run(userId, "search_ships", { query: t });
    expect(out.ships).toHaveLength(25);
    expect(out.total).toBe(30);
  });

  it("ambiguous name returns candidates", async () => {
    const { userId } = await createTestUser(env.DB);
    const t = tag();
    await seedVehicle(env.DB, { name: `${t} Cutlass Black` });
    await seedVehicle(env.DB, { name: `${t} Cutlass Blue` });
    const out = await run(userId, "get_ship_details", { name: `${t} Cutlass` });
    expect(out.error).toBeTruthy();
    expect(out.candidates).toHaveLength(2);
  });

  it("details include owned_count for this user only", async () => {
    const a = await createTestUser(env.DB);
    const b = await createTestUser(env.DB);
    const t = tag();
    const vehicleId = await seedVehicle(env.DB, { slug: `${t}-owned`, name: `${t} Owned Ship` });
    await seedFleetEntry(env.DB, a.userId, vehicleId);
    const forA = await run(a.userId, "get_ship_details", { slug: `${t}-owned` });
    const forB = await run(b.userId, "get_ship_details", { slug: `${t}-owned` });
    expect(forA.name).toBe(`${t} Owned Ship`);
    expect(forA.owned_count).toBe(1);
    expect(forB.owned_count).toBe(0);
    expect(Array.isArray(forA.loadout)).toBe(true);
  });

  it("excludes removed and paint variants", async () => {
    const { userId } = await createTestUser(env.DB);
    const t = tag();
    await seedVehicle(env.DB, { name: `${t} Visible` });
    const removed = await seedVehicle(env.DB, { name: `${t} Removed` });
    const paint = await seedVehicle(env.DB, { name: `${t} Paint` });
    await env.DB.prepare("UPDATE vehicles SET removed = 1 WHERE id = ?").bind(removed).run();
    await env.DB.prepare("UPDATE vehicles SET is_paint_variant = 1 WHERE id = ?").bind(paint).run();
    const out = await run(userId, "search_ships", { query: t });
    expect(out.ships.map((s: { name: string }) => s.name)).toEqual([`${t} Visible`]);
  });
});
