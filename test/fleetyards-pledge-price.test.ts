import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { env, SELF } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { seedVehicle, createAdminUser, authHeaders } from "./helpers";
import { syncPledgePrices } from "../src/sync/fleetyards";

/**
 * Pledge prices from Fleetyards.
 *
 * RSI's /ship-matrix/index no longer carries a `price` field for any ship, and
 * it was the only thing that set vehicles.pledge_price. Ships added since then
 * (the Gatac Hyun among them) never got a price, and nothing ever set
 * vehicles.on_sale. Fleetyards publishes both as `pledgePrice` and `onSale`.
 */

const t = `fyp${crypto.randomUUID().slice(0, 6)}`;

function fyShip(slug: string, name: string, pledgePrice: number | null, onSale: boolean) {
  return { slug, name, productionStatus: "flight-ready", pledgePrice, onSale };
}

async function seed(slug: string, opts: { price?: number | null; paint?: boolean } = {}): Promise<number> {
  const id = await seedVehicle(env.DB, { slug, name: `Ship ${slug}` });
  await env.DB
    .prepare("UPDATE vehicles SET pledge_price = ?, on_sale = 0, is_paint_variant = ? WHERE id = ?")
    .bind(opts.price ?? null, opts.paint ? 1 : 0, id)
    .run();
  return id;
}

async function readRow(id: number) {
  return env.DB
    .prepare("SELECT pledge_price, on_sale FROM vehicles WHERE id = ?")
    .bind(id)
    .first<{ pledge_price: number | null; on_sale: number }>();
}

function stubFleetyards(items: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ items }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })),
  );
}

describe("syncPledgePrices — Fleetyards pledge price + on-sale flag", () => {
  let unpriced: number;
  let stale: number;
  let noFyPrice: number;
  let paint: number;
  let offSale: number;

  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    unpriced = await seed(`${t}-hyun`);
    stale = await seed(`${t}-cutlass`, { price: 100 });
    noFyPrice = await seed(`${t}-concept`, { price: 350 });
    paint = await seed(`${t}-paintonly`, { paint: true });
    offSale = await seed(`${t}-retired`, { price: 75 });
    await env.DB.prepare("UPDATE vehicles SET on_sale = 1 WHERE id = ?").bind(offSale).run();

    stubFleetyards([
      fyShip(`${t}-hyun`, "Hyūn", 220, true),
      fyShip(`${t}-cutlass`, "Cutlass", 125, true),
      fyShip(`${t}-concept`, "Concept", null, true),
      fyShip(`${t}-paintonly`, "Paint Only", 50, true),
      fyShip(`${t}-retired`, "Retired", 75, false),
      fyShip(`${t}-unknown`, "Not In Our DB", 999, true),
    ]);
    await syncPledgePrices(env.DB);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("sets the price and on-sale flag on a ship that had no price", async () => {
    expect(await readRow(unpriced)).toEqual({ pledge_price: 220, on_sale: 1 });
  });

  it("overwrites a stale price", async () => {
    expect((await readRow(stale))!.pledge_price).toBe(125);
  });

  it("keeps our price when Fleetyards has none, but still applies on-sale", async () => {
    expect(await readRow(noFyPrice)).toEqual({ pledge_price: 350, on_sale: 1 });
  });

  it("clears on-sale when Fleetyards says the ship is off sale", async () => {
    expect(await readRow(offSale)).toEqual({ pledge_price: 75, on_sale: 0 });
  });

  it("leaves paint variants alone", async () => {
    expect(await readRow(paint)).toEqual({ pledge_price: null, on_sale: 0 });
  });

  it("writes nothing when Fleetyards returns no ships", async () => {
    stubFleetyards([]);
    const result = await syncPledgePrices(env.DB);
    expect(result.updated).toBe(0);
    expect(await readRow(unpriced)).toEqual({ pledge_price: 220, on_sale: 1 });
  });

  it("writes nothing on a second run with the same data", async () => {
    stubFleetyards([fyShip(`${t}-hyun`, "Hyūn", 220, true)]);
    const result = await syncPledgePrices(env.DB);
    expect(result.updated).toBe(0);
  });
});

describe("POST /api/admin/rsi/ship-status also syncs pledge prices", () => {
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("sets the Fleetyards price in the same admin call", async () => {
    await setupTestDatabase(env.DB);
    const id = await seed(`${t}-admin`);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input instanceof Request ? input.url : input);
        const body = url.includes("fleetyards")
          ? { items: [fyShip(`${t}-admin`, "Admin Ship", 90, true)] }
          : { success: 1, data: [] };
        return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
      }),
    );
    const { sessionToken } = await createAdminUser(env.DB);
    const res = await SELF.fetch("http://localhost/api/admin/rsi/ship-status", {
      method: "POST",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(200);
    expect(await readRow(id)).toEqual({ pledge_price: 90, on_sale: 1 });
  });
});
