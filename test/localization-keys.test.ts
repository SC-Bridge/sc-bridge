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

  it("PUT /override is reflected as userOverride in /keys, then DELETE clears it", async () => {
    // Save an ad-hoc override
    const put = await SELF.fetch("http://localhost/api/localization/override", {
      method: "PUT",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ key: "vehicle_NameAEGS_Gladius", value: "Gladius (mine)" }),
    });
    expect(put.status).toBe(200);

    const after = await SELF.fetch("http://localhost/api/localization/keys?q=gladius", {
      headers: await authHeaders(sessionToken),
    });
    const body = (await after.json()) as { items: { key: string; userOverride?: string }[] };
    expect(body.items[0].userOverride).toBe("Gladius (mine)");

    // Reset it
    const del = await SELF.fetch(
      "http://localhost/api/localization/override?key=vehicle_NameAEGS_Gladius",
      { method: "DELETE", headers: { ...(await authHeaders(sessionToken)), "Content-Length": "0" } },
    );
    expect(del.status).toBe(200);

    const cleared = await SELF.fetch("http://localhost/api/localization/keys?q=gladius", {
      headers: await authHeaders(sessionToken),
    });
    const body2 = (await cleared.json()) as { items: { userOverride?: string }[] };
    expect(body2.items[0].userOverride).toBeUndefined();
  });

  it("PUT /override requires authentication", async () => {
    const res = await SELF.fetch("http://localhost/api/localization/override", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "k", value: "v" }),
    });
    expect(res.status).toBe(401);
  });

  it("DELETE /overrides clears all of the user's customisations", async () => {
    const h = { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" };
    await SELF.fetch("http://localhost/api/localization/override", {
      method: "PUT", headers: h, body: JSON.stringify({ key: "ui_ButtonConfirm", value: "A" }),
    });
    await SELF.fetch("http://localhost/api/localization/override", {
      method: "PUT", headers: h, body: JSON.stringify({ key: "vehicle_NameAEGS_Gladius", value: "B" }),
    });

    const before = (await (await SELF.fetch("http://localhost/api/localization/keys", {
      headers: await authHeaders(sessionToken),
    })).json()) as { userOverrideTotal: number };
    expect(before.userOverrideTotal).toBe(2);

    const del = await SELF.fetch("http://localhost/api/localization/overrides", {
      method: "DELETE",
      headers: { ...(await authHeaders(sessionToken)), "Content-Length": "0" },
    });
    expect(del.status).toBe(200);
    expect((await del.json() as { cleared: number }).cleared).toBe(2);

    const after = (await (await SELF.fetch("http://localhost/api/localization/keys", {
      headers: await authHeaders(sessionToken),
    })).json()) as { userOverrideTotal: number };
    expect(after.userOverrideTotal).toBe(0);
  });

  it("returns per-pack values for cross-pack compare", async () => {
    await env.DB.prepare(
      `INSERT INTO localization_overlay_packs (name, label, version_code, key_count, is_active, sort_order)
       VALUES ('compare-pack', 'Compare Pack', '4.8.0-live', 1, 1, 5)`,
    ).run();
    await (env as unknown as { LOCALIZATION_KV: KVNamespace }).LOCALIZATION_KV.put(
      "localization:pack:compare-pack:4.8.0-live",
      "ui_ButtonConfirm=Affirmative",
    );

    const res = await SELF.fetch("http://localhost/api/localization/keys?q=ButtonConfirm", {
      headers: await authHeaders(sessionToken),
    });
    const data = (await res.json()) as { items: { key: string; packs?: { name: string; label: string; value: string }[] }[] };
    const item = data.items.find((i) => i.key === "ui_ButtonConfirm");
    expect(item?.packs).toEqual([{ name: "compare-pack", label: "Compare Pack", value: "Affirmative" }]);
  });

  it("POST /import ingests only the changed keys from an uploaded global.ini", async () => {
    // Base (seeded in beforeAll): vehicle_NameAEGS_Gladius=Aegis Gladius, ui_ButtonConfirm=Confirm
    const uploaded = ["vehicle_NameAEGS_Gladius=Aegis Gladius", "ui_ButtonConfirm=Yes please"].join("\n");
    const res = await SELF.fetch("http://localhost/api/localization/import", {
      method: "POST",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "text/plain" },
      body: uploaded,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { imported: number };
    expect(body.imported).toBe(1); // only ui_ButtonConfirm differs from base

    const kb = await SELF.fetch("http://localhost/api/localization/keys?q=ButtonConfirm", {
      headers: await authHeaders(sessionToken),
    });
    const data = (await kb.json()) as { items: { key: string; userOverride?: string }[] };
    expect(data.items.find((i) => i.key === "ui_ButtonConfirm")?.userOverride).toBe("Yes please");
  });
});
