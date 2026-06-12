import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders } from "./helpers";

async function post(token: string, path: string, body: Record<string, unknown>) {
  return SELF.fetch(`http://localhost/api/accountant${path}`, {
    method: "POST",
    headers: { ...(await authHeaders(token)), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const get = async (t: string, path: string) =>
  SELF.fetch(`http://localhost/api/accountant${path}`, { headers: await authHeaders(t) });
const put = async (t: string, path: string, body: Record<string, unknown>) =>
  SELF.fetch(`http://localhost/api/accountant${path}`, {
    method: "PUT",
    headers: { ...(await authHeaders(t)), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const SALE = {
  type: "sale", category: "trading", tag: "minerals", item: "Laranite",
  quantity: 200, price_per_unit: 3200,
  start_at: "2026-06-10T00:00:00Z",
};

function publisherOf(orderId: number) {
  return env.DB.prepare("SELECT publisher FROM accountant_orders WHERE id = ?")
    .bind(orderId).first<{ publisher: string | null }>();
}

/**
 * Owner spec 2026-06-13: the poster's display name is SNAPSHOTTED onto the
 * order at creation (design §10 — poster display handle is the only identity
 * the future public market exposes). A later account rename must NOT rewrite
 * historical orders, and the contract lock keeps publisher immutable.
 */
describe("M5 follow-up — order publisher snapshot", () => {
  beforeAll(async () => { await setupTestDatabase(env.DB); });

  it("POST /orders stores publisher = the creating account's name", async () => {
    const { sessionToken } = await createTestUser(env.DB, { name: "Vengeance" });
    const res = await post(sessionToken, "/orders", SALE);
    expect(res.status).toBe(200);
    const { id } = (await res.json()) as { id: number };
    expect((await publisherOf(id))?.publisher).toBe("Vengeance");
  });

  it("publisher is a SNAPSHOT: renaming the account later does not change the order", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB, { name: "Old Handle" });
    const res = await post(sessionToken, "/orders", SALE);
    const { id } = (await res.json()) as { id: number };

    await env.DB.prepare(`UPDATE "user" SET name = ? WHERE id = ?`)
      .bind("New Handle", userId).run();
    expect((await publisherOf(id))?.publisher).toBe("Old Handle");
  });

  it("inline workorder components are real orders and get the publisher too", async () => {
    const { sessionToken } = await createTestUser(env.DB, { name: "WO Poster" });
    const res = await post(sessionToken, "/workorders", {
      title: "Laranite hauling run", orders: [SALE, SALE],
    });
    expect(res.status).toBe(200);
    const { id } = (await res.json()) as { id: number };
    const comps = await env.DB.prepare(
      "SELECT publisher FROM accountant_orders WHERE workorder_id = ?",
    ).bind(id).all<{ publisher: string | null }>();
    expect(comps.results).toHaveLength(2);
    for (const c of comps.results) expect(c.publisher).toBe("WO Poster");
  });

  it("inline component added to an EXISTING workorder also gets the publisher", async () => {
    const { sessionToken } = await createTestUser(env.DB, { name: "Late Adder" });
    const wo = await post(sessionToken, "/workorders", { title: "Growing run", orders: [SALE] });
    const { id: woId } = (await wo.json()) as { id: number };
    const res = await post(sessionToken, `/workorders/${woId}/orders`, { order: SALE });
    expect(res.status).toBe(200);
    const { id } = (await res.json()) as { id: number };
    expect((await publisherOf(id))?.publisher).toBe("Late Adder");
  });

  it("PUT /orders/:id cannot change publisher (contract lock, 400 via .strict())", async () => {
    const { sessionToken } = await createTestUser(env.DB, { name: "Immutable" });
    const res = await post(sessionToken, "/orders", SALE);
    const { id } = (await res.json()) as { id: number };
    const putRes = await put(sessionToken, `/orders/${id}`, { publisher: "Impostor" });
    expect(putRes.status).toBe(400);
    expect((await publisherOf(id))?.publisher).toBe("Immutable");
  });

  it("GET /orders list and GET /orders/:id expose publisher", async () => {
    const { sessionToken } = await createTestUser(env.DB, { name: "Lister" });
    const res = await post(sessionToken, "/orders", SALE);
    const { id } = (await res.json()) as { id: number };

    const list = (await (await get(sessionToken, "/orders")).json()) as {
      orders: Array<{ id: number; publisher: string | null }>;
    };
    expect(list.orders.find((o) => o.id === id)?.publisher).toBe("Lister");

    const detail = (await (await get(sessionToken, `/orders/${id}`)).json()) as {
      order: { publisher: string | null };
    };
    expect(detail.order.publisher).toBe("Lister");
  });
});
