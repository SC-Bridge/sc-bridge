import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders } from "./helpers";

/**
 * Admin overlay-pack management lifecycle: upload (existing endpoint) →
 * list → toggle active → delete. Toggle + delete are the new endpoints.
 */
describe("Admin localization overlay packs", () => {
  let adminToken: string;

  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    const admin = await createTestUser(env.DB, { role: "super_admin" });
    adminToken = admin.sessionToken;

    await env.DB.prepare(
      `INSERT INTO game_versions (uuid, code, channel, is_default, released_at)
       VALUES ('uuid-pack', '4.8.0-live', 'LIVE', 1, '2026-05-14')`,
    ).run();

    // Seed the pack here so every test sees it — the worker test harness
    // snapshots storage after beforeAll and rolls back per-test mutations,
    // so cross-`it` state from a mutating test would not carry over.
    await uploadPack();
  });

  async function uploadPack() {
    return SELF.fetch(
      "http://localhost/api/admin/localization/overlay-pack?name=test-pack&label=Test%20Pack&version_code=4.8.0-live",
      {
        method: "PUT",
        headers: { ...(await authHeaders(adminToken)), "Content-Type": "text/plain" },
        body: "key1=Override One\nkey2=Override Two\n",
      },
    );
  }

  it("uploads a pack (metadata in D1, content in KV)", async () => {
    const res = await uploadPack();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; keyCount: number };
    expect(body.ok).toBe(true);
    expect(body.keyCount).toBe(2);

    const kv = (env as unknown as { LOCALIZATION_KV: KVNamespace }).LOCALIZATION_KV;
    expect(await kv.get("localization:pack:test-pack:4.8.0-live")).toContain("key1=Override One");
  });

  it("lists the pack as active by default", async () => {
    const res = await SELF.fetch("http://localhost/api/admin/localization/overlay-packs", {
      headers: await authHeaders(adminToken),
    });
    const body = (await res.json()) as { packs: { name: string; is_active: number }[] };
    const pack = body.packs.find((p) => p.name === "test-pack");
    expect(pack).toBeDefined();
    expect(pack!.is_active).toBe(1);
  });

  it("toggles a pack inactive", async () => {
    const res = await SELF.fetch("http://localhost/api/admin/localization/overlay-pack/test-pack", {
      method: "PATCH",
      headers: { ...(await authHeaders(adminToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: false }),
    });
    expect(res.status).toBe(200);

    const list = await SELF.fetch("http://localhost/api/admin/localization/overlay-packs", {
      headers: await authHeaders(adminToken),
    });
    const body = (await list.json()) as { packs: { name: string; is_active: number }[] };
    expect(body.packs.find((p) => p.name === "test-pack")!.is_active).toBe(0);
  });

  it("edits pack metadata (label/description/sort_order) without re-upload", async () => {
    const res = await SELF.fetch("http://localhost/api/admin/localization/overlay-pack/test-pack", {
      method: "PATCH",
      headers: { ...(await authHeaders(adminToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Renamed Pack", description: "edited", sort_order: 7 }),
    });
    expect(res.status).toBe(200);

    const list = await SELF.fetch("http://localhost/api/admin/localization/overlay-packs", {
      headers: await authHeaders(adminToken),
    });
    const body = (await list.json()) as { packs: { name: string; label: string; description: string; sort_order: number }[] };
    const pack = body.packs.find((p) => p.name === "test-pack")!;
    expect(pack.label).toBe("Renamed Pack");
    expect(pack.description).toBe("edited");
    expect(pack.sort_order).toBe(7);
  });

  it("returns 404 toggling an unknown pack", async () => {
    const res = await SELF.fetch("http://localhost/api/admin/localization/overlay-pack/does-not-exist", {
      method: "PATCH",
      headers: { ...(await authHeaders(adminToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: true }),
    });
    expect(res.status).toBe(404);
  });

  it("deletes a pack (D1 row + KV content)", async () => {
    const res = await SELF.fetch("http://localhost/api/admin/localization/overlay-pack/test-pack", {
      method: "DELETE",
      headers: { ...(await authHeaders(adminToken)), "Content-Length": "0" },
    });
    expect(res.status).toBe(200);

    const list = await SELF.fetch("http://localhost/api/admin/localization/overlay-packs", {
      headers: await authHeaders(adminToken),
    });
    const body = (await list.json()) as { packs: { name: string }[] };
    expect(body.packs.find((p) => p.name === "test-pack")).toBeUndefined();

    const kv = (env as unknown as { LOCALIZATION_KV: KVNamespace }).LOCALIZATION_KV;
    expect(await kv.get("localization:pack:test-pack:4.8.0-live")).toBeNull();
  });
});
