import { describe, it, expect } from "vitest";
import { evaluateLocalizationIngest, decideLocalizationIngest, hashIni } from "../src/lib/localization";

/**
 * evaluateLocalizationIngest — the safety brain for auto-ingesting a community
 * vanilla base global.ini. Decides whether a freshly-fetched file should
 * replace the current KV base: only when it actually CHANGED and passes sanity
 * (enough keys, not a suspicious shrink vs the current base). This guards
 * against a broken/truncated upstream publish silently nuking everyone's base.
 */

// Build an ini blob with N `key=value` lines.
function ini(n: number, tag = "v"): string {
  return Array.from({ length: n }, (_, i) => `key_${i}=${tag}${i}`).join("\n");
}

describe("evaluateLocalizationIngest", () => {
  it("accepts the first-ever ingest when there's no current base", () => {
    const r = evaluateLocalizationIngest(ini(5000), null);
    expect(r.changed).toBe(true);
    expect(r.ok).toBe(true);
    expect(r.keyCount).toBe(5000);
  });

  it("is a no-op when the new content is identical to current", () => {
    const same = ini(5000);
    const r = evaluateLocalizationIngest(same, same);
    expect(r.changed).toBe(false);
  });

  it("accepts a normal patch delta (changed + sane)", () => {
    const r = evaluateLocalizationIngest(ini(8200, "new"), ini(8000, "old"));
    expect(r.changed).toBe(true);
    expect(r.ok).toBe(true);
  });

  it("rejects content with too few keys (broken/empty upstream)", () => {
    const r = evaluateLocalizationIngest(ini(50), ini(8000));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/few keys/i);
  });

  it("rejects a suspicious shrink vs the current base", () => {
    // current 8000 keys, new only 4000 (>20% drop) → reject
    const r = evaluateLocalizationIngest(ini(4000), ini(8000));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/shrink|drop/i);
  });

  it("reports the key delta vs current", () => {
    const r = evaluateLocalizationIngest(ini(8200), ini(8000));
    expect(r.keyCount).toBe(8200);
    expect(r.delta).toBe(200);
  });
});

/**
 * decideLocalizationIngest — multi-source selection across BeltaKoda (canonical)
 * + Dymerz (fallback). Fixes the original bug where BeltaKoda being "unchanged"
 * short-circuited the loop so a fresh publish from Dymerz was never seen. Adds a
 * no-regression guard so the hourly cron can't revert a base we extracted ahead
 * of the community (the 4.8.1-via-local-extraction case).
 */
describe("decideLocalizationIngest", () => {
  const BELTA = "BeltaKoda";
  const DYM = "Dymerz";

  it("catches a fresh Dymerz publish even when BeltaKoda is unchanged (the bug fix)", () => {
    const cur = ini(8000, "v");
    const belta = ini(8000, "v"); // identical to current → 'unchanged' for canonical
    const dymerzOld = ini(8000, "dyold");
    const dymerzNew = ini(8050, "new"); // Dymerz just shipped a new patch
    const state = { seen: { [BELTA]: hashIni(belta), [DYM]: hashIni(dymerzOld) } };
    const r = decideLocalizationIngest(
      [{ name: BELTA, content: belta }, { name: DYM, content: dymerzNew }],
      cur,
      state,
    );
    expect(r.action).toBe("ingest");
    expect(r.source).toBe(DYM);
  });

  it("does NOT thrash: a non-canonical source that differs but isn't a fresh publish is held", () => {
    const cur = ini(8000, "v");
    const belta = ini(8000, "v");
    const dymerz = ini(8050, "dy"); // differs from current, but SAME as last run
    const state = { seen: { [BELTA]: hashIni(belta), [DYM]: hashIni(dymerz) } };
    const r = decideLocalizationIngest(
      [{ name: BELTA, content: belta }, { name: DYM, content: dymerz }],
      cur,
      state,
    );
    expect(r.action).toBe("unchanged");
  });

  it("prefers the canonical source when both have moved", () => {
    const cur = ini(8000, "v");
    const belta = ini(8100, "newB");
    const dymerz = ini(8050, "newD");
    const state = { seen: { [BELTA]: hashIni(ini(8000, "v")), [DYM]: hashIni(ini(8000, "dold")) } };
    const r = decideLocalizationIngest(
      [{ name: BELTA, content: belta }, { name: DYM, content: dymerz }],
      cur,
      state,
    );
    expect(r.action).toBe("ingest");
    expect(r.source).toBe(BELTA);
  });

  it("no-regression guard: won't revert a richer base to a source with fewer keys", () => {
    // Our base is 8016 keys (e.g. a locally-extracted 4.8.1); BeltaKoda still
    // serves 8000 (4.8.0). The cron must NOT overwrite the newer base.
    const cur = ini(8016, "local481");
    const belta = ini(8000, "belta480");
    const state = { seen: { [BELTA]: hashIni(ini(7000, "older")) } }; // belta 'changed' since seen
    const r = decideLocalizationIngest([{ name: BELTA, content: belta }], cur, state);
    expect(r.action).toBe("unchanged"); // held by the guard, not ingested
  });

  it("resumes once the canonical source catches up (delta >= 0)", () => {
    const cur = ini(8016, "local481");
    const belta = ini(8016, "belta481"); // BeltaKoda now also 4.8.1, same key count, real content
    const state = { seen: { [BELTA]: hashIni(ini(8000, "belta480")) } };
    const r = decideLocalizationIngest([{ name: BELTA, content: belta }], cur, state);
    expect(r.action).toBe("ingest");
    expect(r.source).toBe(BELTA);
  });

  it("seeds from the canonical source when there's no base yet", () => {
    const r = decideLocalizationIngest(
      [{ name: BELTA, content: ini(8000) }, { name: DYM, content: ini(8050) }],
      null,
      { seen: {} },
    );
    expect(r.action).toBe("ingest");
    expect(r.source).toBe(BELTA);
  });

  it("falls through a broken canonical publish to a good fresh fallback", () => {
    const cur = ini(8000, "v");
    const belta = ini(50); // too few keys → rejected by the sanity gate
    const dymerzNew = ini(8050, "new");
    const state = { seen: { [DYM]: hashIni(ini(8000, "dold")) } };
    const r = decideLocalizationIngest(
      [{ name: BELTA, content: belta }, { name: DYM, content: dymerzNew }],
      cur,
      state,
    );
    expect(r.action).toBe("ingest");
    expect(r.source).toBe(DYM);
  });

  it("skips when every source fails to fetch", () => {
    const r = decideLocalizationIngest(
      [{ name: BELTA, content: null }, { name: DYM, content: null }],
      ini(8000),
      { seen: {} },
    );
    expect(r.action).toBe("skip");
    expect(r.reason).toMatch(/fetch/i);
  });

  it("records updated per-source hashes for the next run", () => {
    const belta = ini(8000);
    const r = decideLocalizationIngest([{ name: BELTA, content: belta }], ini(8000), { seen: {} });
    expect(r.seen[BELTA]).toBe(hashIni(belta));
  });
});
