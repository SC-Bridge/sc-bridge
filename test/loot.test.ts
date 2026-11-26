import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase, TEST_GAME_VERSION_ID } from "./apply-migrations";
import { createTestUser, authHeaders, seedLootItem } from "./helpers";

describe("Loot API — /api/loot", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  describe("GET /api/loot (public)", () => {
    it("returns 200 with items array", async () => {
      const res = await SELF.fetch("http://localhost/api/loot");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });

    it("does not require authentication", async () => {
      const res = await SELF.fetch("http://localhost/api/loot");
      expect(res.status).toBe(200);
    });

    it("includes seeded loot items", async () => {
      await seedLootItem(env.DB, {
        name: "TestPistol",
        type: "Weapon",
        sub_type: "Pistol",
        rarity: "Rare",
      });

      const res = await SELF.fetch("http://localhost/api/loot");
      const items = (await res.json()) as Array<Record<string, unknown>>;
      const found = items.find((i) => i.name === "TestPistol");
      expect(found).toBeDefined();
      expect(found!.type).toBe("Weapon");
      expect(found!.rarity).toBe("Rare");
    });

    it("hides built-in ship parts: untyped ship components with no source", async () => {
      // A ship's armour, doors and seats load as category 'ship_component' with no type;
      // none can be bought, looted or swapped. A typed component stays, and so does an
      // untyped one that some source does drop (a miscategorised loot item).
      // Real rows always carry a class_name (the list's vncl_ filter drops ship components without one).
      const builtIn = await seedLootItem(env.DB, { name: "Test Ship Armor", category: "ship_component" });
      const dropped = await seedLootItem(env.DB, { name: "Test Dropped Hide", category: "ship_component" });
      const typed = await seedLootItem(env.DB, { name: "Test Shield", type: "Shield", sub_type: "Medium", category: "ship_component" });
      await env.DB.batch([
        env.DB.prepare("UPDATE loot_map SET type = NULL, class_name = 'orig_315p_armor' WHERE id = ?").bind(builtIn.id),
        env.DB.prepare("UPDATE loot_map SET type = NULL, class_name = 'test_dropped_hide' WHERE id = ?").bind(dropped.id),
        env.DB.prepare("UPDATE loot_map SET class_name = 'test_shield_s1' WHERE id = ?").bind(typed.id),
        env.DB.prepare(
          `INSERT INTO loot_item_locations (loot_map_id, game_version_id, source_type, location_key, actor, faction, slot)
           VALUES (?, ?, 'container', 'cccccccc-0000-4000-8000-000000000003', NULL, NULL, NULL)`,
        ).bind(dropped.id, TEST_GAME_VERSION_ID),
      ]);

      const res = await SELF.fetch("http://localhost/api/loot");
      const names = ((await res.json()) as Array<{ name: string }>).map((i) => i.name);
      expect(names).not.toContain("Test Ship Armor");
      expect(names).toContain("Test Dropped Hide");
      expect(names).toContain("Test Shield");
    });

    it("sets cache-control header", async () => {
      const res = await SELF.fetch("http://localhost/api/loot");
      // API routes also get no-store from the API middleware, but the route sets public
      expect(res.headers.get("Cache-Control")).toBeTruthy();
    });
  });

  describe("GET /api/loot/:uuid (public)", () => {
    it("returns item detail by uuid", async () => {
      const { uuid } = await seedLootItem(env.DB, {
        name: "Detail Test Item",
        type: "Armor",
        rarity: "Legendary",
      });

      const res = await SELF.fetch(`http://localhost/api/loot/${uuid}`);
      expect(res.status).toBe(200);
      const item = (await res.json()) as Record<string, unknown>;
      expect(item.name).toBe("Detail Test Item");
      expect(item.rarity).toBe("Legendary");
    });

    it("returns 404 for nonexistent uuid", async () => {
      const res = await SELF.fetch(
        "http://localhost/api/loot/00000000-0000-0000-0000-000000000000"
      );
      expect(res.status).toBe(404);
    });
  });

  describe("Collection — /api/loot/collection", () => {
    it("requires authentication", async () => {
      const res = await SELF.fetch("http://localhost/api/loot/collection");
      expect(res.status).toBe(401);
    });

    it("returns empty collection for new user", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const res = await SELF.fetch("http://localhost/api/loot/collection", {
        headers: await authHeaders(sessionToken),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect((body as unknown[]).length).toBe(0);
    });

    it("can add item to collection", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const { uuid } = await seedLootItem(env.DB, { name: "Collectible Item" });

      const addRes = await SELF.fetch(
        `http://localhost/api/loot/collection/${uuid}`,
        {
          method: "POST",
          headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json", "Content-Length": "0" },
        }
      );
      expect(addRes.status).toBe(200);
      const addBody = (await addRes.json()) as Record<string, unknown>;
      expect(addBody.ok).toBe(true);

      // Verify it appears in collection
      const listRes = await SELF.fetch("http://localhost/api/loot/collection", {
        headers: await authHeaders(sessionToken),
      });
      const collection = (await listRes.json()) as Array<Record<string, unknown>>;
      expect(collection.length).toBeGreaterThan(0);
    });

    it("can remove item from collection", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const { uuid } = await seedLootItem(env.DB, { name: "Removable Item" });

      // Add then remove
      await SELF.fetch(`http://localhost/api/loot/collection/${uuid}`, {
        method: "POST",
        headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json", "Content-Length": "0" },
      });

      const delRes = await SELF.fetch(
        `http://localhost/api/loot/collection/${uuid}`,
        {
          method: "DELETE",
          headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json", "Content-Length": "0" },
        }
      );
      expect(delRes.status).toBe(200);
    });

    it("can update collection quantity", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const { uuid } = await seedLootItem(env.DB, { name: "Quantity Item" });

      // Add first
      await SELF.fetch(`http://localhost/api/loot/collection/${uuid}`, {
        method: "POST",
        headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json", "Content-Length": "0" },
      });

      // Update quantity
      const patchRes = await SELF.fetch(
        `http://localhost/api/loot/collection/${uuid}`,
        {
          method: "PATCH",
          headers: {
            ...(await authHeaders(sessionToken)),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ quantity: 5 }),
        }
      );
      expect(patchRes.status).toBe(200);
    });

    it("rejects negative quantity", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const { uuid } = await seedLootItem(env.DB, { name: "Negative Qty Item" });

      await SELF.fetch(`http://localhost/api/loot/collection/${uuid}`, {
        method: "POST",
        headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json", "Content-Length": "0" },
      });

      const patchRes = await SELF.fetch(
        `http://localhost/api/loot/collection/${uuid}`,
        {
          method: "PATCH",
          headers: {
            ...(await authHeaders(sessionToken)),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ quantity: -1 }),
        }
      );
      expect(patchRes.status).toBe(400);
    });

    it("returns 404 for nonexistent item uuid", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const res = await SELF.fetch(
        "http://localhost/api/loot/collection/00000000-0000-0000-0000-000000000000",
        {
          method: "POST",
          headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json", "Content-Length": "0" },
        }
      );
      expect(res.status).toBe(404);
    });
  });

  describe("Wishlist — /api/loot/wishlist", () => {
    it("requires authentication", async () => {
      const res = await SELF.fetch("http://localhost/api/loot/wishlist");
      expect(res.status).toBe(401);
    });

    it("can add and list wishlist items", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const { uuid } = await seedLootItem(env.DB, { name: "Wishlist Item" });

      const addRes = await SELF.fetch(
        `http://localhost/api/loot/wishlist/${uuid}`,
        {
          method: "POST",
          headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json", "Content-Length": "0" },
        }
      );
      expect(addRes.status).toBe(200);

      const listRes = await SELF.fetch("http://localhost/api/loot/wishlist", {
        headers: await authHeaders(sessionToken),
      });
      expect(listRes.status).toBe(200);
      const wishlist = (await listRes.json()) as unknown[];
      expect(wishlist.length).toBeGreaterThan(0);
    });

    it("can remove from wishlist", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const { uuid } = await seedLootItem(env.DB, { name: "Remove Wishlist Item" });

      await SELF.fetch(`http://localhost/api/loot/wishlist/${uuid}`, {
        method: "POST",
        headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json", "Content-Length": "0" },
      });

      const delRes = await SELF.fetch(
        `http://localhost/api/loot/wishlist/${uuid}`,
        {
          method: "DELETE",
          headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json", "Content-Length": "0" },
        }
      );
      expect(delRes.status).toBe(200);
    });

    it("can update wishlist quantity", async () => {
      const { sessionToken } = await createTestUser(env.DB);
      const { uuid } = await seedLootItem(env.DB, { name: "Wishlist Qty Item" });

      await SELF.fetch(`http://localhost/api/loot/wishlist/${uuid}`, {
        method: "POST",
        headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json", "Content-Length": "0" },
      });

      const patchRes = await SELF.fetch(
        `http://localhost/api/loot/wishlist/${uuid}`,
        {
          method: "PATCH",
          headers: {
            ...(await authHeaders(sessionToken)),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ quantity: 3 }),
        }
      );
      expect(patchRes.status).toBe(200);
    });
  });

  describe("Locations (public)", () => {
    it("GET /api/loot/locations returns summary", async () => {
      const res = await SELF.fetch("http://localhost/api/loot/locations");
      expect(res.status).toBe(200);
    });
  });
});
