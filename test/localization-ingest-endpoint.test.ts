import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { SELF, env, fetchMock } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders } from "./helpers";

/**
 * POST /api/admin/localization/ingest runs runLocalizationIngest: fetch a
 * community vanilla base, sanity-check, and refresh the current default
 * version's base in KV. The source fetch is stubbed via fetchMock.
 */
describe("Admin localization auto-ingest", () => {
  let adminToken: string;

  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    const admin = await createTestUser(env.DB, { role: "super_admin" });
    adminToken = admin.sessionToken;
    fetchMock.activate();
    fetchMock.disableNetConnect();
  });

  afterEach(() => fetchMock.assertNoPendingInterceptors());

  it("skips when no default game version is configured", async () => {
    await env.DB.prepare("UPDATE game_versions SET is_default = 0").run();
    const res = await SELF.fetch("http://localhost/api/admin/localization/ingest", {
      method: "POST",
      headers: { ...(await authHeaders(adminToken)), "Content-Length": "0" },
    });
    expect(res.status).toBe(200);
    expect((await res.json() as { status: string }).status).toBe("skipped");
  });

  it("ingests a fresh sane base from the first source and writes it to KV", async () => {
    await env.DB.prepare("UPDATE game_versions SET is_default = 0").run();
    await env.DB.prepare(
      `INSERT INTO game_versions (uuid, code, channel, is_default, released_at)
       VALUES ('uuid-ingest', '4.8.0-live', 'LIVE', 1, '2026-05-14')`,
    ).run();

    const fresh = Array.from({ length: 2000 }, (_, i) => `key_${i}=value ${i}`).join("\n");
    fetchMock
      .get("https://raw.githubusercontent.com")
      .intercept({ path: "/BeltaKoda/ScCompLangPackRemix/refs/heads/main/LIVE/stock-global.ini" })
      .reply(200, fresh);

    const res = await SELF.fetch("http://localhost/api/admin/localization/ingest", {
      method: "POST",
      headers: { ...(await authHeaders(adminToken)), "Content-Length": "0" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; keyCount: number; source: string };
    expect(body.status).toBe("ingested");
    expect(body.keyCount).toBe(2000);

    const stored = await (env as unknown as { LOCALIZATION_KV: KVNamespace }).LOCALIZATION_KV.get(
      "localization:global-ini:4.8.0-live",
    );
    expect(stored).toBe(fresh);
  });

  it("rejects a broken (too-few-keys) upstream and does not overwrite KV", async () => {
    await env.DB.prepare("UPDATE game_versions SET is_default = 0").run();
    await env.DB.prepare(
      `INSERT INTO game_versions (uuid, code, channel, is_default, released_at)
       VALUES ('uuid-ingest2', '4.8.0-live', 'LIVE', 1, '2026-05-14')`,
    ).run();
    const kv = (env as unknown as { LOCALIZATION_KV: KVNamespace }).LOCALIZATION_KV;
    await kv.put("localization:global-ini:4.8.0-live", "good=base\n".repeat(1)); // small existing

    // both sources return garbage (too few keys) → both skipped → overall skipped
    for (const path of [
      "/BeltaKoda/ScCompLangPackRemix/refs/heads/main/LIVE/stock-global.ini",
      "/Dymerz/StarCitizen-Localization/main/data/Localization/english/global.ini",
    ]) {
      fetchMock.get("https://raw.githubusercontent.com").intercept({ path }).reply(200, "only=one line");
    }

    const res = await SELF.fetch("http://localhost/api/admin/localization/ingest", {
      method: "POST",
      headers: { ...(await authHeaders(adminToken)), "Content-Length": "0" },
    });
    expect((await res.json() as { status: string }).status).toBe("skipped");
    // KV base untouched
    expect(await kv.get("localization:global-ini:4.8.0-live")).toBe("good=base\n");
  });
});
