// test/weapon-builds.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders } from "./helpers";

describe("Weapon Builds API — /api/weapon-builds", () => {
  let sessionToken: string;
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    ({ sessionToken } = await createTestUser(env.DB));
  });

  const post = async (token: string, body: unknown) =>
    SELF.fetch("http://localhost/api/weapon-builds", {
      method: "POST",
      headers: { ...(await authHeaders(token)), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  it("requires authentication", async () => {
    const res = await SELF.fetch("http://localhost/api/weapon-builds");
    expect(res.status).toBe(401);
  });

  it("creates, lists, updates and deletes a build (owner-scoped)", async () => {
    const create = await post(sessionToken, {
      weaponUuid: "gmni_pistol_ballistic_01",
      name: "Daily Carry",
      config: { qualities: { 0: 750 }, attachments: { barrel: "att-stark" } },
    });
    expect(create.status).toBe(200);
    const { id } = (await create.json()) as { id: number };
    expect(id).toBeGreaterThan(0);

    const list = await SELF.fetch("http://localhost/api/weapon-builds", { headers: await authHeaders(sessionToken) });
    const body = (await list.json()) as { items: Array<{ id: number; name: string; config: { qualities: Record<string, number> } }> };
    expect(body.items).toHaveLength(1);
    expect(body.items[0].name).toBe("Daily Carry");
    expect(body.items[0].config.qualities["0"]).toBe(750);

    const patch = await SELF.fetch(`http://localhost/api/weapon-builds/${id}`, {
      method: "PATCH",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed" }),
    });
    expect(patch.status).toBe(200);

    const del = await SELF.fetch(`http://localhost/api/weapon-builds/${id}`, { method: "DELETE", headers: { ...(await authHeaders(sessionToken)), "Content-Length": "0" } });
    expect(del.status).toBe(200);
    const after = await SELF.fetch("http://localhost/api/weapon-builds", { headers: await authHeaders(sessionToken) });
    expect(((await after.json()) as { items: unknown[] }).items).toHaveLength(0);
  });

  it("rejects a duplicate (weapon, name) with 409", async () => {
    await post(sessionToken, { weaponUuid: "w1", name: "dup", config: {} });
    const second = await post(sessionToken, { weaponUuid: "w1", name: "dup", config: {} });
    expect(second.status).toBe(409);
  });

  it("does not return another user's builds", async () => {
    const other = await createTestUser(env.DB);
    await post(other.sessionToken, { weaponUuid: "w2", name: "theirs", config: {} });
    const mine = await SELF.fetch("http://localhost/api/weapon-builds", { headers: await authHeaders(sessionToken) });
    const items = ((await mine.json()) as { items: Array<{ name: string }> }).items;
    expect(items.find((i) => i.name === "theirs")).toBeUndefined();
  });
});
