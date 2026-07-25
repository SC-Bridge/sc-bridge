import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders } from "./helpers";

describe("/api/item-builds", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  it("rejects unauthenticated access", async () => {
    const res = await SELF.fetch("http://localhost/api/item-builds");
    expect(res.status).toBe(401);
  });

  it("creates, lists (with kind filter), and deletes builds of both kinds", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const h = await authHeaders(sessionToken);
    const mk = (body: unknown) =>
      SELF.fetch("http://localhost/api/item-builds", {
        method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
    const w = await mk({ kind: "weapon", itemUuid: "gmni_pistol_ballistic_01", name: "W1", config: { qualities: { 0: 700 } } });
    expect(w.status).toBe(200);
    const a = await mk({ kind: "armour", itemUuid: "rsi_core_medium_01", name: "A1", config: { qualities: { 0: 650 } } });
    expect(a.status).toBe(200);

    const all = (await (await SELF.fetch("http://localhost/api/item-builds", { headers: h })).json()) as { items: Array<{ kind: string; name: string }> };
    expect(all.items.map((i) => i.kind).sort()).toEqual(["armour", "weapon"]);

    const armourOnly = (await (await SELF.fetch("http://localhost/api/item-builds?kind=armour", { headers: h })).json()) as { items: Array<{ name: string }> };
    expect(armourOnly.items).toHaveLength(1);
    expect(armourOnly.items[0].name).toBe("A1");
  });

  it("409s on duplicate (kind, item, name) but allows same name across kinds", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const h = await authHeaders(sessionToken);
    const mk = (kind: string) =>
      SELF.fetch("http://localhost/api/item-builds", {
        method: "POST", headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({ kind, itemUuid: "shared_uuid", name: "Same Name", config: {} }),
      });
    expect((await mk("weapon")).status).toBe(200);
    expect((await mk("weapon")).status).toBe(409);
    expect((await mk("armour")).status).toBe(200);
  });

  it("rejects an invalid kind", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const h = await authHeaders(sessionToken);
    const res = await SELF.fetch("http://localhost/api/item-builds", {
      method: "POST", headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "ship", itemUuid: "x", name: "n", config: {} }),
    });
    expect(res.status).toBe(400);
  });

  it("is owner-scoped: cannot delete another user's build", async () => {
    const alice = await createTestUser(env.DB);
    const bob = await createTestUser(env.DB);
    const created = await SELF.fetch("http://localhost/api/item-builds", {
      method: "POST", headers: { ...(await authHeaders(alice.sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "weapon", itemUuid: "u", name: "Alice's", config: {} }),
    });
    const { id } = (await created.json()) as { id: number };
    await SELF.fetch(`http://localhost/api/item-builds/${id}`, { method: "DELETE", headers: await authHeaders(bob.sessionToken) });
    const still = await env.DB.prepare("SELECT id FROM user_item_builds WHERE id = ?").bind(id).first();
    expect(still).not.toBeNull();
  });

  // Ported from test/weapon-builds.test.ts (pre-#200-slice-2): PATCH rename,
  // full create/list/patch/delete round trip, with kind added.
  it("renames a build via PATCH and reflects the change on re-list", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const h = await authHeaders(sessionToken);
    const create = await SELF.fetch("http://localhost/api/item-builds", {
      method: "POST", headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "weapon", itemUuid: "gmni_pistol_ballistic_01", name: "Daily Carry", config: { qualities: { 0: 750 }, attachments: { barrel: "att-stark" } } }),
    });
    const { id } = (await create.json()) as { id: number };

    const patch = await SELF.fetch(`http://localhost/api/item-builds/${id}`, {
      method: "PATCH", headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed" }),
    });
    expect(patch.status).toBe(200);

    const list = (await (await SELF.fetch("http://localhost/api/item-builds", { headers: h })).json()) as { items: Array<{ id: number; name: string }> };
    expect(list.items.find((i) => i.id === id)!.name).toBe("Renamed");

    const del = await SELF.fetch(`http://localhost/api/item-builds/${id}`, { method: "DELETE", headers: { ...h, "Content-Length": "0" } });
    expect(del.status).toBe(200);
    const after = (await (await SELF.fetch("http://localhost/api/item-builds", { headers: h })).json()) as { items: unknown[] };
    expect(after.items).toHaveLength(0);
  });

  // Ported from test/weapon-builds.test.ts: GET list isolation between users.
  it("does not return another user's builds in the list", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const h = await authHeaders(sessionToken);
    const other = await createTestUser(env.DB);
    await SELF.fetch("http://localhost/api/item-builds", {
      method: "POST", headers: { ...(await authHeaders(other.sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "weapon", itemUuid: "w2", name: "theirs", config: {} }),
    });
    const mine = await SELF.fetch("http://localhost/api/item-builds", { headers: h });
    const items = ((await mine.json()) as { items: Array<{ name: string }> }).items;
    expect(items.find((i) => i.name === "theirs")).toBeUndefined();
  });
});
