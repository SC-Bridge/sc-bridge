import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { setupTestDatabase } from "./apply-migrations";
import { runLocalizationIngest, type IngestDeps } from "../src/sync/localizationIngest";
import { hashIni } from "../src/lib/localization";
import type { Env } from "../src/lib/types";

// The cloudflare:test `env` is structurally our Env for the bindings this code
// touches (DB + LOCALIZATION_KV); cast through unknown for the call signature.
const appEnv = env as unknown as Env;

/**
 * Exercises the version-aware orchestration end-to-end against the real test D1
 * + KV, with network fetches stubbed (the vitest-4 pool dropped fetchMock).
 */
const ini = (n: number, tag = "v"): string =>
  Array.from({ length: n }, (_, i) => `key_${i}=${tag}${i}`).join("\n");
const KV = () => (env as unknown as { LOCALIZATION_KV: KVNamespace }).LOCALIZATION_KV;

describe("runLocalizationIngest orchestration", () => {
  beforeEach(async () => {
    await setupTestDatabase(env.DB);
    await env.DB.batch([
      env.DB.prepare("UPDATE game_versions SET is_default = 0"),
      env.DB.prepare(
        "INSERT OR IGNORE INTO game_versions (uuid, code, channel, is_default, build_number) VALUES ('4.8.0-live-1','4.8.0-live','LIVE',0,'1')",
      ),
      env.DB.prepare("DELETE FROM game_versions WHERE code = '4.8.1-live'"),
      env.DB.prepare("UPDATE game_versions SET is_default = 1 WHERE code = '4.8.0-live'"),
    ]);
    await KV().delete("localization:ingest-state");
    await KV().delete("localization:global-ini:4.8.1-live");
    await KV().put("localization:global-ini:4.8.0-live", ini(8000, "v480"));
  });

  it("stages a NEW version (row + base) without flipping the default", async () => {
    const deps: IngestDeps = {
      fetchContent: async (url) => (url.includes("Dymerz") ? ini(8016, "v481") : ini(8000, "v480")),
      fetchVersion: async (src) =>
        src.name.includes("Dymerz")
          ? { code: "4.8.1-live", channel: "live", build: "11952564" }
          : { code: "4.8.0-live", channel: "live", build: null },
    };
    const r = await runLocalizationIngest(appEnv, deps);
    expect(r.status).toBe("staged");
    expect(r.versionCode).toBe("4.8.1-live");

    const row = await env.DB
      .prepare("SELECT code, is_default, build_number FROM game_versions WHERE code = '4.8.1-live'")
      .first<{ code: string; is_default: number; build_number: string }>();
    expect(row).toBeTruthy();
    expect(row!.is_default).toBe(0); // never auto-promoted
    expect(row!.build_number).toBe("11952564");

    expect(await KV().get("localization:global-ini:4.8.1-live")).toBe(ini(8016, "v481"));
    expect(await KV().get("localization:global-ini:4.8.0-live")).toBe(ini(8000, "v480")); // preserved

    const def = await env.DB.prepare("SELECT code FROM game_versions WHERE is_default = 1").first<{ code: string }>();
    expect(def!.code).toBe("4.8.0-live"); // still the old default
  });

  it("refreshes the current base on a same-patch update (no new row)", async () => {
    const deps: IngestDeps = {
      fetchContent: async (url) => (url.includes("Belta") ? ini(8000, "v480fix") : ini(8000, "v480")),
      fetchVersion: async () => ({ code: "4.8.0-live", channel: "live", build: null }),
    };
    const r = await runLocalizationIngest(appEnv, deps);
    expect(r.status).toBe("ingested");
    expect(await KV().get("localization:global-ini:4.8.0-live")).toBe(ini(8000, "v480fix"));
    const count = await env.DB
      .prepare("SELECT COUNT(*) AS n FROM game_versions WHERE code = '4.8.1-live'")
      .first<{ n: number }>();
    expect(count!.n).toBe(0);
  });

  it("does NOT revert the current base to a source with fewer keys", async () => {
    await KV().put("localization:global-ini:4.8.0-live", ini(8016, "rich"));
    const deps: IngestDeps = {
      fetchContent: async () => ini(8000, "poorer"),
      fetchVersion: async () => ({ code: "4.8.0-live", channel: "live", build: null }),
    };
    const r = await runLocalizationIngest(appEnv, deps);
    expect(r.status).toBe("unchanged");
    expect(await KV().get("localization:global-ini:4.8.0-live")).toBe(ini(8016, "rich"));
  });

  it("ignores a Dymerz PTU publish (does not stage or pollute LIVE)", async () => {
    const deps: IngestDeps = {
      fetchContent: async (url) => (url.includes("Dymerz") ? ini(8020, "ptu") : ini(8000, "v480")),
      fetchVersion: async (src) =>
        src.name.includes("Dymerz")
          ? { code: "4.8.0-ptu", channel: "ptu", build: "999" }
          : { code: "4.8.0-live", channel: "live", build: null },
    };
    const r = await runLocalizationIngest(appEnv, deps);
    expect(r.status).toBe("unchanged");
    expect(await KV().get("localization:global-ini:4.8.0-live")).toBe(ini(8000, "v480"));
    const ptuRow = await env.DB
      .prepare("SELECT COUNT(*) AS n FROM game_versions WHERE code = '4.8.0-ptu'")
      .first<{ n: number }>();
    expect(ptuRow!.n).toBe(0);
  });
  it("still resolves + stages a version whose content was already SEEN by an earlier run", async () => {
    // 4.10 incident: Dymerz published "English+Brazilian 4.10 LIVE 12519617"; the
    // old parser returned null, the run recorded the content hash as seen, and
    // every later run skipped version resolution ("unchanged since last run") —
    // so fixing the parser alone could never stage it. Seen-ness must not gate
    // resolution while the source still differs from the current base.
    const dymerz = ini(8016, "v481");
    await KV().put(
      "localization:ingest-state",
      JSON.stringify({ seen: { "Dymerz StarCitizen-Localization (english)": hashIni(dymerz) } }),
    );
    let resolved = 0;
    const deps: IngestDeps = {
      fetchContent: async (url) => (url.includes("Dymerz") ? dymerz : ini(8000, "v480")),
      fetchVersion: async (src) => {
        resolved += 1;
        return src.name.includes("Dymerz")
          ? { code: "4.8.1-live", channel: "live", build: "11952564" }
          : { code: "4.8.0-live", channel: "live", build: null };
      },
    };
    const r = await runLocalizationIngest(appEnv, deps);
    expect(resolved).toBeGreaterThan(0);
    expect(r.status).toBe("staged");
    expect(r.versionCode).toBe("4.8.1-live");
    expect(await KV().get("localization:global-ini:4.8.1-live")).toBe(dymerz);
  });

  it("does not hit GitHub for a source that already equals the current base", async () => {
    let resolved = 0;
    const deps: IngestDeps = {
      fetchContent: async () => ini(8000, "v480"), // both sources == current base
      fetchVersion: async () => {
        resolved += 1;
        return { code: "4.8.0-live", channel: "live", build: null };
      },
    };
    const r = await runLocalizationIngest(appEnv, deps);
    expect(r.status).toBe("unchanged");
    expect(resolved).toBe(0);
  });
});
