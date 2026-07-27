// test/fps-loadouts.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders, seedLootItem } from "./helpers";

describe("FPS Loadouts API — /api/fps-loadouts", () => {
  let sessionToken: string;
  let userId: string;
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    ({ sessionToken, userId } = await createTestUser(env.DB));
  });

  const post = async (token: string, body: unknown) =>
    SELF.fetch("http://localhost/api/fps-loadouts", {
      method: "POST",
      headers: { ...(await authHeaders(token)), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  it("requires authentication", async () => {
    const res = await SELF.fetch("http://localhost/api/fps-loadouts");
    expect(res.status).toBe(401);
  });

  it("creates a loadout, PUTs a slot (owned via loot collection), replaces it, then deletes slot + loadout", async () => {
    const create = await post(sessionToken, { name: "Bunker Kit" });
    expect(create.status).toBe(200);
    const { id } = (await create.json()) as { id: number };
    expect(id).toBeGreaterThan(0);

    // Seed a loot item and mark it owned via the user's collection
    const item = await seedLootItem(env.DB, { name: "Test Rifle" });
    await env.DB
      .prepare("INSERT INTO user_loot_collection (user_id, loot_uuid) VALUES (?, ?)")
      .bind(userId, item.uuid)
      .run();

    // PUT a slot
    const putRes = await SELF.fetch(`http://localhost/api/fps-loadouts/${id}/slots/primary`, {
      method: "PUT",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ itemUuid: item.uuid, itemName: "Test Rifle", config: { mag: "extended" } }),
    });
    expect(putRes.status).toBe(200);

    const list = await SELF.fetch("http://localhost/api/fps-loadouts", { headers: await authHeaders(sessionToken) });
    type ListBody = {
      items: Array<{
        id: number;
        name: string;
        slots: Array<{
          slot_key: string;
          item_uuid: string | null;
          item_name: string | null;
          config: Record<string, unknown> | null;
          owned: boolean;
          wishlisted: boolean;
        }>;
      }>;
    };
    const body = (await list.json()) as ListBody;
    const loadout = body.items.find((l) => l.id === id)!;
    expect(loadout.name).toBe("Bunker Kit");
    expect(loadout.slots).toHaveLength(1);
    expect(loadout.slots[0].slot_key).toBe("primary");
    expect(loadout.slots[0].item_uuid).toBe(item.uuid);
    expect(loadout.slots[0].config?.mag).toBe("extended");
    expect(loadout.slots[0].owned).toBe(true);
    expect(loadout.slots[0].wishlisted).toBe(false);

    // PUT again — replaces the slot entirely
    const putAgain = await SELF.fetch(`http://localhost/api/fps-loadouts/${id}/slots/primary`, {
      method: "PUT",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ itemName: "Replaced Item" }),
    });
    expect(putAgain.status).toBe(200);

    const list2 = await SELF.fetch("http://localhost/api/fps-loadouts", { headers: await authHeaders(sessionToken) });
    const body2 = (await list2.json()) as ListBody;
    const loadout2 = body2.items.find((l) => l.id === id)!;
    expect(loadout2.slots).toHaveLength(1);
    expect(loadout2.slots[0].item_name).toBe("Replaced Item");
    expect(loadout2.slots[0].item_uuid).toBeNull();
    expect(loadout2.slots[0].owned).toBe(false);

    // DELETE the slot
    const delSlot = await SELF.fetch(`http://localhost/api/fps-loadouts/${id}/slots/primary`, {
      method: "DELETE",
      headers: { ...(await authHeaders(sessionToken)), "Content-Length": "0" },
    });
    expect(delSlot.status).toBe(200);

    const list3 = await SELF.fetch("http://localhost/api/fps-loadouts", { headers: await authHeaders(sessionToken) });
    const body3 = (await list3.json()) as ListBody;
    const loadout3 = body3.items.find((l) => l.id === id)!;
    expect(loadout3.slots).toHaveLength(0);

    // DELETE the loadout
    const delLoadout = await SELF.fetch(`http://localhost/api/fps-loadouts/${id}`, {
      method: "DELETE",
      headers: { ...(await authHeaders(sessionToken)), "Content-Length": "0" },
    });
    expect(delLoadout.status).toBe(200);

    const list4 = await SELF.fetch("http://localhost/api/fps-loadouts", { headers: await authHeaders(sessionToken) });
    const body4 = (await list4.json()) as ListBody;
    expect(body4.items.find((l) => l.id === id)).toBeUndefined();
  });

  it("accepts explicit itemBuildId: null and config: null on slot PUT", async () => {
    // Regression: .optional() without .nullable() rejected null with
    // "expected number, received null", silently 400ing every
    // drag-to-loadout save from the frontend.
    const create = await post(sessionToken, { name: "Nulls Kit" });
    const { id } = (await create.json()) as { id: number };
    const putNulls = await SELF.fetch(`http://localhost/api/fps-loadouts/${id}/slots/sidearm`, {
      method: "PUT",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ itemUuid: "some-weapon-uuid", itemName: "Test Pistol", itemBuildId: null, config: null }),
    });
    expect(putNulls.status).toBe(200);
  });

  it("PATCH renames a loadout (owner-scoped)", async () => {
    const create = await post(sessionToken, { name: "Original Name" });
    const { id } = (await create.json()) as { id: number };

    const patch = await SELF.fetch(`http://localhost/api/fps-loadouts/${id}`, {
      method: "PATCH",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed" }),
    });
    expect(patch.status).toBe(200);

    const list = await SELF.fetch("http://localhost/api/fps-loadouts", { headers: await authHeaders(sessionToken) });
    const body = (await list.json()) as { items: Array<{ id: number; name: string }> };
    expect(body.items.find((l) => l.id === id)!.name).toBe("Renamed");
  });

  it("rejects a duplicate name with 409", async () => {
    await post(sessionToken, { name: "dup-loadout" });
    const second = await post(sessionToken, { name: "dup-loadout" });
    expect(second.status).toBe(409);
  });

  it("does not leak another user's loadouts and rejects cross-user slot writes", async () => {
    const other = await createTestUser(env.DB);
    const theirCreate = await post(other.sessionToken, { name: "Theirs" });
    const { id: theirId } = (await theirCreate.json()) as { id: number };

    const mine = await SELF.fetch("http://localhost/api/fps-loadouts", { headers: await authHeaders(sessionToken) });
    const items = ((await mine.json()) as { items: Array<{ name: string }> }).items;
    expect(items.find((i) => i.name === "Theirs")).toBeUndefined();

    // Attempting to write a slot on another user's loadout should 404
    const hijack = await SELF.fetch(`http://localhost/api/fps-loadouts/${theirId}/slots/primary`, {
      method: "PUT",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ itemName: "Hijacked" }),
    });
    expect(hijack.status).toBe(404);

    // Attempting to PATCH/DELETE another user's loadout should not affect it
    const hijackPatch = await SELF.fetch(`http://localhost/api/fps-loadouts/${theirId}`, {
      method: "PATCH",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Stolen" }),
    });
    expect(hijackPatch.status).toBe(404);

    const theirs = await SELF.fetch("http://localhost/api/fps-loadouts", { headers: await authHeaders(other.sessionToken) });
    const theirItems = ((await theirs.json()) as { items: Array<{ id: number; name: string }> }).items;
    expect(theirItems.find((i) => i.id === theirId)!.name).toBe("Theirs");
  });

  it("rejects an itemBuildId owned by another user (IDOR) but accepts the caller's own build", async () => {
    const other = await createTestUser(env.DB);

    const create = await post(sessionToken, { name: "Weapon Kit" });
    const { id } = (await create.json()) as { id: number };

    // A build owned by the OTHER user
    const theirBuild = await SELF.fetch("http://localhost/api/item-builds", {
      method: "POST",
      headers: { ...(await authHeaders(other.sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "weapon", itemUuid: "weapon-uuid-1", name: "Their Build", config: {} }),
    });
    const { id: theirBuildId } = (await theirBuild.json()) as { id: number };

    // A build owned by the CALLER
    const myBuild = await SELF.fetch("http://localhost/api/item-builds", {
      method: "POST",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "weapon", itemUuid: "weapon-uuid-1", name: "My Build", config: {} }),
    });
    const { id: myBuildId } = (await myBuild.json()) as { id: number };

    const hijack = await SELF.fetch(`http://localhost/api/fps-loadouts/${id}/slots/primary`, {
      method: "PUT",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ itemBuildId: theirBuildId }),
    });
    expect(hijack.status).toBe(404);

    const list = await SELF.fetch("http://localhost/api/fps-loadouts", { headers: await authHeaders(sessionToken) });
    type ListBody = { items: Array<{ id: number; slots: Array<{ slot_key: string; item_build_id: number | null }> }> };
    const listBody = (await list.json()) as ListBody;
    const loadout = listBody.items.find((l) => l.id === id)!;
    expect(loadout.slots).toHaveLength(0);

    const own = await SELF.fetch(`http://localhost/api/fps-loadouts/${id}/slots/primary`, {
      method: "PUT",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ itemBuildId: myBuildId }),
    });
    expect(own.status).toBe(200);

    const list2 = await SELF.fetch("http://localhost/api/fps-loadouts", { headers: await authHeaders(sessionToken) });
    const listBody2 = (await list2.json()) as ListBody;
    const loadout2 = listBody2.items.find((l) => l.id === id)!;
    expect(loadout2.slots[0].item_build_id).toBe(myBuildId);
  });

  it("stores an armour build link on an armour slot", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const h = await authHeaders(sessionToken);
    const build = await SELF.fetch("http://localhost/api/item-builds", {
      method: "POST", headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "armour", itemUuid: "rsi_core_medium_01", name: "Tuned Core", config: { qualities: { 0: 800 } } }),
    });
    const { id: buildId } = (await build.json()) as { id: number };
    const lo = await SELF.fetch("http://localhost/api/fps-loadouts", {
      method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify({ name: "Armour Kit" }),
    });
    const { id: loadoutId } = (await lo.json()) as { id: number };
    const put = await SELF.fetch(`http://localhost/api/fps-loadouts/${loadoutId}/slots/core`, {
      method: "PUT", headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({ itemUuid: "rsi_core_medium_01", itemName: "RSI Core", itemBuildId: buildId, config: { qualities: { 0: 800 } } }),
    });
    expect(put.status).toBe(200);
    const list = (await (await SELF.fetch("http://localhost/api/fps-loadouts", { headers: h })).json()) as { items: Array<{ id: number; slots: Array<{ slot_key: string; item_build_id: number | null }> }> };
    const kit = list.items.find((l) => l.id === loadoutId)!;
    expect(kit.slots.find((s) => s.slot_key === "core")!.item_build_id).toBe(buildId);
  });

  it("rejects an invalid slotKey with 400 on PUT and DELETE", async () => {
    const create = await post(sessionToken, { name: "Bogus Slot Kit" });
    const { id } = (await create.json()) as { id: number };

    const put = await SELF.fetch(`http://localhost/api/fps-loadouts/${id}/slots/bogus`, {
      method: "PUT",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ itemName: "Nope" }),
    });
    expect(put.status).toBe(400);

    const del = await SELF.fetch(`http://localhost/api/fps-loadouts/${id}/slots/bogus`, {
      method: "DELETE",
      headers: { ...(await authHeaders(sessionToken)), "Content-Length": "0" },
    });
    expect(del.status).toBe(400);
  });
});
