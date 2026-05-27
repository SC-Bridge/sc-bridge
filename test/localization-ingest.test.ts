import { describe, it, expect } from "vitest";
import { evaluateLocalizationIngest } from "../src/lib/localization";

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
