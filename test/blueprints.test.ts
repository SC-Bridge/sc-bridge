import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders } from "./helpers";

describe("User Blueprints API", () => {
  let sessionToken: string;
  let userId: string;
  let craftingBlueprintId: number;

  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    const user = await createTestUser(env.DB);
    sessionToken = user.sessionToken;
    userId = user.userId;

    // Seed a crafting blueprint for FK references
    await env.DB.prepare(
      `INSERT INTO crafting_blueprints (uuid, tag, name, type, sub_type, craft_time_seconds)
       VALUES ('test-bp-uuid', 'BP_TEST', 'Test Blueprint', 'weapons', 'rifle', 120)`
    ).run();
    const bpRow = await env.DB.prepare(
      "SELECT id FROM crafting_blueprints WHERE uuid = 'test-bp-uuid'"
    ).first<{ id: number }>();
    craftingBlueprintId = bpRow!.id;
  });

  describe("GET /api/blueprints", () => {
    it("requires authentication", async () => {
      const res = await SELF.fetch("http://localhost/api/blueprints");
      expect(res.status).toBe(401);
    });

    it("returns empty list initially", async () => {
      const res = await SELF.fetch("http://localhost/api/blueprints", {
        headers: await authHeaders(sessionToken),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: unknown[] };
      expect(body.items).toEqual([]);
    });
  });

  describe("POST /api/blueprints", () => {
    it("saves a blueprint", async () => {
      const res = await SELF.fetch("http://localhost/api/blueprints", {
        method: "POST",
        headers: {
          ...(await authHeaders(sessionToken)),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          craftingBlueprintId,
          nickname: "My Rifle",
          qualityConfig: { "0": 750, "1": 500 },
        }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean };
      expect(body.ok).toBe(true);
    });

    it("saved blueprint appears in list", async () => {
      // Re-save to ensure data exists (tests may not share state)
      await SELF.fetch("http://localhost/api/blueprints", {
        method: "POST",
        headers: {
          ...(await authHeaders(sessionToken)),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          craftingBlueprintId,
          nickname: "My Rifle",
          qualityConfig: { "0": 750, "1": 500 },
        }),
      });

      const res = await SELF.fetch("http://localhost/api/blueprints", {
        headers: await authHeaders(sessionToken),
      });
      const body = (await res.json()) as {
        items: {
          id: number;
          nickname: string;
          crafted_quantity: number;
          quality_config: Record<string, number>;
          blueprint_name: string;
        }[];
      };
      expect(body.items.length).toBeGreaterThanOrEqual(1);
      const item = body.items.find((i: { nickname: string }) => i.nickname === "My Rifle");
      expect(item).toBeTruthy();
      expect(item!.crafted_quantity).toBe(0);
      expect(item!.quality_config).toEqual({ "0": 750, "1": 500 });
      expect(item!.blueprint_name).toBe("Test Blueprint");
    });

    it("upserts on duplicate (same blueprint)", async () => {
      const res = await SELF.fetch("http://localhost/api/blueprints", {
        method: "POST",
        headers: {
          ...(await authHeaders(sessionToken)),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          craftingBlueprintId,
          nickname: "Updated Rifle",
        }),
      });
      expect(res.status).toBe(200);

      const list = await SELF.fetch("http://localhost/api/blueprints", {
        headers: await authHeaders(sessionToken),
      });
      const body = (await list.json()) as { items: { nickname: string }[] };
      expect(body.items).toHaveLength(1);
      expect(body.items[0].nickname).toBe("Updated Rifle");
    });
  });

  describe("PATCH /api/blueprints/:id", () => {
    it("updates crafted quantity", async () => {
      // Ensure a blueprint exists (re-save)
      await SELF.fetch("http://localhost/api/blueprints", {
        method: "POST",
        headers: {
          ...(await authHeaders(sessionToken)),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ craftingBlueprintId }),
      });
      const row = await env.DB.prepare(
        "SELECT id FROM user_blueprints WHERE user_id = ? LIMIT 1"
      ).bind(userId).first<{ id: number }>();
      expect(row).toBeTruthy();
      const id = row!.id;

      const res = await SELF.fetch(`http://localhost/api/blueprints/${id}`, {
        method: "PATCH",
        headers: {
          ...(await authHeaders(sessionToken)),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ craftedQuantity: 3 }),
      });
      expect(res.status).toBe(200);

      // Verify via API
      const verifyRes = await SELF.fetch("http://localhost/api/blueprints", {
        headers: await authHeaders(sessionToken),
      });
      const verify = (await verifyRes.json()) as {
        items: { crafted_quantity: number }[];
      };
      expect(verify.items[0].crafted_quantity).toBe(3);
    });

    it("returns 404 for another user's blueprint", async () => {
      const other = await createTestUser(env.DB);
      // Ensure a blueprint exists
      await SELF.fetch("http://localhost/api/blueprints", {
        method: "POST",
        headers: {
          ...(await authHeaders(sessionToken)),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ craftingBlueprintId }),
      });
      const row = await env.DB.prepare(
        "SELECT id FROM user_blueprints WHERE user_id = ? LIMIT 1"
      ).bind(userId).first<{ id: number }>();
      const id = row!.id;

      const res = await SELF.fetch(`http://localhost/api/blueprints/${id}`, {
        method: "PATCH",
        headers: {
          ...(await authHeaders(other.sessionToken)),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ craftedQuantity: 999 }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/blueprints/:id", () => {
    it("removes a saved blueprint", async () => {
      // Ensure a blueprint exists
      await SELF.fetch("http://localhost/api/blueprints", {
        method: "POST",
        headers: {
          ...(await authHeaders(sessionToken)),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ craftingBlueprintId }),
      });
      const row = await env.DB.prepare(
        "SELECT id FROM user_blueprints WHERE user_id = ? LIMIT 1"
      ).bind(userId).first<{ id: number }>();
      expect(row).toBeTruthy();
      const id = row!.id;

      const res = await SELF.fetch(`http://localhost/api/blueprints/${id}`, {
        method: "DELETE",
        headers: {
          ...(await authHeaders(sessionToken)),
          "Content-Length": "0",
        },
      });
      expect(res.status).toBe(200);

      const verifyRes = await SELF.fetch("http://localhost/api/blueprints", {
        headers: await authHeaders(sessionToken),
      });
      const verify = (await verifyRes.json()) as { items: unknown[] };
      expect(verify.items).toHaveLength(0);
    });
  });

  describe("POST /api/blueprints/:uuid/builds", () => {
    it("saves a named build (regression: malformed UNION/LIMIT existence check 500'd)", async () => {
      const res = await SELF.fetch(
        "http://localhost/api/blueprints/test-bp-uuid/builds",
        {
          method: "POST",
          headers: {
            ...(await authHeaders(sessionToken)),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: "Max Quality",
            qualityConfig: { "0": 1000, "1": 750 },
            notes: "best roll",
          }),
        },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; id: number };
      expect(body.ok).toBe(true);
      expect(body.id).toBeGreaterThan(0);

      const row = await env.DB
        .prepare("SELECT name FROM user_blueprint_builds WHERE id = ?")
        .bind(body.id)
        .first<{ name: string }>();
      expect(row?.name).toBe("Max Quality");
    });

    it("returns 404 for an unknown blueprint uuid", async () => {
      const res = await SELF.fetch(
        "http://localhost/api/blueprints/does-not-exist/builds",
        {
          method: "POST",
          headers: {
            ...(await authHeaders(sessionToken)),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: "x", qualityConfig: { "0": 500 } }),
        },
      );
      expect(res.status).toBe(404);
    });

    it("rejects a duplicate build name with 409", async () => {
      const body = JSON.stringify({ name: "Dupe", qualityConfig: { "0": 500 } });
      const opts = {
        method: "POST",
        headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
        body,
      };
      const first = await SELF.fetch("http://localhost/api/blueprints/test-bp-uuid/builds", opts);
      expect(first.status).toBe(200);
      const second = await SELF.fetch("http://localhost/api/blueprints/test-bp-uuid/builds", {
        ...opts,
        headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      });
      expect(second.status).toBe(409);
    });
  });

  describe("PUT /state — un-owning must NOT delete saved builds (data-loss regression)", () => {
    // PUT /state validates blueprintUuid as a real UUID, so seed a UUID-shaped BP.
    const BP_UUID = "11111111-2222-4333-8444-555555555555";
    let seeded = false;
    async function seedUuidBp() {
      if (seeded) return;
      await env.DB.prepare(
        `INSERT OR IGNORE INTO crafting_blueprints (uuid, tag, name, type, sub_type)
         VALUES (?, 'BP_UUID', 'UUID BP', 'weapons', 'rifle')`,
      ).bind(BP_UUID).run();
      seeded = true;
    }

    it("keeps the blueprint + its builds when Owned is unchecked", async () => {
      await seedUuidBp();
      const { sessionToken: tok, userId: uid } = await createTestUser(env.DB);
      const save = await SELF.fetch(`http://localhost/api/blueprints/${BP_UUID}/builds`, {
        method: "POST",
        headers: { ...(await authHeaders(tok)), "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Keepme", qualityConfig: { "0": 800 } }),
      });
      expect(save.status).toBe(200);

      // Uncheck Owned (no wishlist) — used to delete the parent row + orphan the build.
      const unown = await SELF.fetch("http://localhost/api/blueprints/state", {
        method: "PUT",
        headers: { ...(await authHeaders(tok)), "Content-Type": "application/json" },
        body: JSON.stringify({ blueprintUuid: BP_UUID, owned: false }),
      });
      expect(unown.status).toBe(200);

      const build = await env.DB
        .prepare("SELECT name FROM user_blueprint_builds WHERE user_id = ? AND blueprint_uuid = ?")
        .bind(uid, BP_UUID)
        .first<{ name: string }>();
      expect(build?.name).toBe("Keepme");

      const list = await SELF.fetch("http://localhost/api/blueprints", { headers: await authHeaders(tok) });
      const body = (await list.json()) as { items: Array<{ blueprint_uuid: string; is_owned: boolean; builds: unknown[] }> };
      const item = body.items.find((i) => i.blueprint_uuid === BP_UUID);
      expect(item).toBeTruthy();
      expect(item!.is_owned).toBe(false);  // flag cleared…
      expect(item!.builds.length).toBe(1); // …but the build is preserved
    });

    it("still deletes a bare owned marker with no builds or config", async () => {
      await seedUuidBp();
      const { sessionToken: tok, userId: uid } = await createTestUser(env.DB);
      await SELF.fetch("http://localhost/api/blueprints/state", {
        method: "PUT",
        headers: { ...(await authHeaders(tok)), "Content-Type": "application/json" },
        body: JSON.stringify({ blueprintUuid: BP_UUID, owned: true }),
      });
      await SELF.fetch("http://localhost/api/blueprints/state", {
        method: "PUT",
        headers: { ...(await authHeaders(tok)), "Content-Type": "application/json" },
        body: JSON.stringify({ blueprintUuid: BP_UUID, owned: false }),
      });
      const row = await env.DB
        .prepare("SELECT id FROM user_blueprints WHERE user_id = ? AND blueprint_uuid = ?")
        .bind(uid, BP_UUID)
        .first();
      expect(row).toBeNull();
    });
  });
});
