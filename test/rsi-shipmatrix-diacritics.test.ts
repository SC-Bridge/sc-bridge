import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { seedVehicle } from "./helpers";
import { syncShipProductionStatus } from "../src/sync/rsi";

/**
 * Ship-matrix sync — names with diacritics.
 *
 * RSI's ship-matrix lists the Gatac Hyun as "Hyūn" (macron u); our vehicles
 * row is "Gatac Hyun". The matcher compared "hyūn" with "hyun", so the Hyun
 * went unmatched every night: applyPledgeableFlags reset it to
 * is_pledgeable = 0 and pledge_price was never set. Both sides of the name
 * match must be folded. "San'tok.yāi", which our table spells with the
 * macron, must keep matching.
 */

function matrixShip(name: string, price: number) {
  return {
    id: 1,
    name,
    production_status: "flight-ready",
    chassis_id: 1,
    cargocapacity: null,
    scm_speed: null,
    type: "combat",
    size: "small",
    length: null,
    beam: null,
    height: null,
    mass: null,
    min_crew: null,
    max_crew: null,
    classification: null,
    focus: null,
    url: null,
    price,
  };
}

async function seedP4kShip(name: string, slug: string): Promise<number> {
  const id = await seedVehicle(env.DB, { name, slug });
  await env.DB
    .prepare("UPDATE vehicles SET is_pledgeable = 0, pledge_price = NULL, uuid = ? WHERE id = ?")
    .bind(`uuid-${slug}`, id)
    .run();
  return id;
}

async function readRow(id: number) {
  return env.DB
    .prepare("SELECT is_pledgeable, pledge_price FROM vehicles WHERE id = ?")
    .bind(id)
    .first<{ is_pledgeable: number; pledge_price: number | null }>();
}

describe("syncShipProductionStatus — diacritics in RSI names", () => {
  let hyunId: number;
  let santokId: number;

  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    hyunId = await seedP4kShip("Gatac Hyun", "gama-hyun");
    santokId = await seedP4kShip("Aopoa San'tok.yāi", "aopoa-santokyai");

    const payload = {
      success: 1,
      data: [matrixShip("Hyūn", 220), matrixShip("San'tok.yāi", 220)],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })),
    );
    await syncShipProductionStatus(env.DB);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("matches RSI's \"Hyūn\" to our \"Gatac Hyun\" and applies its price", async () => {
    const row = await readRow(hyunId);
    expect(row!.is_pledgeable).toBe(1);
    expect(row!.pledge_price).toBe(220);
  });

  it("still matches \"San'tok.yāi\", which our table spells with the macron", async () => {
    const row = await readRow(santokId);
    expect(row!.is_pledgeable).toBe(1);
    expect(row!.pledge_price).toBe(220);
  });
});
