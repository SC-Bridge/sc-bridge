import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders } from "./helpers";
import { searchGlobalIniKeys } from "../src/lib/localization";

/**
 * searchGlobalIniKeys — backend-paginated search over a global.ini blob for
 * the Localization Builder's Key Browser. Matches a query against the key
 * name OR the value (case-insensitive), returns the total match count plus a
 * single page of {key, value} rows.
 */

const INI = [
  "# a comment",
  "",
  "vehicle_NameAEGS_Gladius=Aegis Gladius",
  "vehicle_NameAEGS_Sabre=Aegis Sabre",
  "item_NameKLWE_LaserRepeater=Laser Repeater",
  "; another comment",
  "ui_ButtonConfirm=Confirm",
].join("\n");

describe("searchGlobalIniKeys", () => {
  it("returns all keys (paginated) when no query", () => {
    const r = searchGlobalIniKeys(INI, { limit: 2 });
    expect(r.total).toBe(4); // 4 real key=value lines, comments/blank skipped
    expect(r.items).toHaveLength(2);
    expect(r.items[0]).toEqual({ key: "vehicle_NameAEGS_Gladius", value: "Aegis Gladius" });
  });

  it("matches the key name case-insensitively", () => {
    const r = searchGlobalIniKeys(INI, { q: "sabre" });
    expect(r.total).toBe(1);
    expect(r.items[0].key).toBe("vehicle_NameAEGS_Sabre");
  });

  it("matches the value case-insensitively", () => {
    const r = searchGlobalIniKeys(INI, { q: "repeater" });
    expect(r.total).toBe(1);
    expect(r.items[0].key).toBe("item_NameKLWE_LaserRepeater");
  });

  it("matches across both key and value", () => {
    const r = searchGlobalIniKeys(INI, { q: "aegis" });
    // value "Aegis ..." on two rows
    expect(r.total).toBe(2);
  });

  it("applies offset within the filtered set", () => {
    const r = searchGlobalIniKeys(INI, { q: "aegs", offset: 1, limit: 10 });
    expect(r.total).toBe(2);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].key).toBe("vehicle_NameAEGS_Sabre");
  });

  it("reports total independent of page size", () => {
    const r = searchGlobalIniKeys(INI, { limit: 1 });
    expect(r.total).toBe(4);
    expect(r.items).toHaveLength(1);
  });

  it("returns an empty page past the end", () => {
    const r = searchGlobalIniKeys(INI, { offset: 99 });
    expect(r.total).toBe(4);
    expect(r.items).toEqual([]);
  });
});

describe("GET /api/localization/keys", () => {
  let sessionToken: string;

  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    const user = await createTestUser(env.DB);
    sessionToken = user.sessionToken;

    await env.DB.prepare("UPDATE game_versions SET is_default = 0").run();
    await env.DB.prepare(
      `INSERT INTO game_versions (uuid, code, channel, is_default, released_at)
       VALUES ('uuid-keys', '4.8.0-live', 'LIVE', 1, '2026-05-14')`,
    ).run();

    await (env as unknown as { LOCALIZATION_KV: KVNamespace }).LOCALIZATION_KV.put(
      "localization:global-ini:4.8.0-live",
      ["vehicle_NameAEGS_Gladius=Aegis Gladius", "ui_ButtonConfirm=Confirm"].join("\n"),
    );
  });

  it("requires authentication", async () => {
    const res = await SELF.fetch("http://localhost/api/localization/keys");
    expect(res.status).toBe(401);
  });

  it("searches the base global.ini and paginates", async () => {
    const res = await SELF.fetch("http://localhost/api/localization/keys?q=gladius", {
      headers: await authHeaders(sessionToken),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      version: string;
      total: number;
      items: { key: string; value: string }[];
    };
    expect(body.version).toBe("4.8.0-live");
    expect(body.total).toBe(1);
    expect(body.items[0]).toMatchObject({
      key: "vehicle_NameAEGS_Gladius",
      value: "Aegis Gladius",
    });
  });
});
