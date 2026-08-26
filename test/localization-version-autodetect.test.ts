import { describe, it, expect } from "vitest";
import {
  parseVersionFromCommit,
  compareVersionCodes,
  decideVersionedIngest,
  hashIni,
} from "../src/lib/localization";

const ini = (n: number, tag = "v"): string =>
  Array.from({ length: n }, (_, i) => `key_${i}=${tag}${i}`).join("\n");
const live = (code: string, build: string | null = null) => ({ code, channel: "live", build });
const ptu = (code: string, build: string | null = null) => ({ code, channel: "ptu", build });

describe("parseVersionFromCommit", () => {
  it("parses a Dymerz commit (version at the start, with build)", () => {
    expect(parseVersionFromCommit("4.8.1-live.11952564 English and Brazilian")).toEqual({
      code: "4.8.1-live",
      channel: "live",
      build: "11952564",
    });
  });

  it("parses a Dymerz PTU commit (channel matters — must NOT be treated as live)", () => {
    expect(parseVersionFromCommit("4.8.0-ptu.11817467 (EN)")).toEqual({
      code: "4.8.0-ptu",
      channel: "ptu",
      build: "11817467",
    });
  });

  it("parses a BeltaKoda commit (version inside feat(), no build)", () => {
    expect(
      parseVersionFromCommit("feat(4.8.0-live): release Star Citizen 4.8.0 LIVE compact naming remix"),
    ).toEqual({ code: "4.8.0-live", channel: "live", build: null });
  });

  it("parses the Dymerz 4.10+ message format (two-segment version, channel word, bare build)", () => {
    // Dymerz changed format at 4.10: "English+Brazilian 4.10 LIVE 12519617" — no X.Y.Z-live
    // token. Must normalise to the stable X.Y.0-live code so the cron can stage it.
    expect(parseVersionFromCommit("English+Brazilian 4.10 LIVE 12519617")).toEqual({
      code: "4.10.0-live",
      channel: "live",
      build: "12519617",
    });
  });

  it("parses the two-segment PTU form and keeps the channel", () => {
    expect(parseVersionFromCommit("4.10 PTU 12456044 (EN)")).toEqual({
      code: "4.10.0-ptu",
      channel: "ptu",
      build: "12456044",
    });
  });

  it("two-segment form without a build yields build null", () => {
    expect(parseVersionFromCommit("4.10 LIVE English")).toEqual({
      code: "4.10.0-live",
      channel: "live",
      build: null,
    });
  });

  it("does not mistake an unrelated number followed by a channel word for a version", () => {
    expect(parseVersionFromCommit("fix typo in 12 LIVE strings")).toBeNull();
  });

  it("returns null for a chore commit with no version token", () => {
    expect(parseVersionFromCommit("refactor: restructure repo from version-specific to channel-based folders")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(parseVersionFromCommit("")).toBeNull();
  });
});

describe("compareVersionCodes", () => {
  it("newer minor/patch is greater", () => {
    expect(compareVersionCodes("4.8.1-live", "4.8.0-live")).toBeGreaterThan(0);
    expect(compareVersionCodes("4.8.0-live", "4.8.1-live")).toBeLessThan(0);
  });

  it("equal codes compare to 0", () => {
    expect(compareVersionCodes("4.8.0-live", "4.8.0-live")).toBe(0);
  });

  it("compares numerically, not lexically (4.10 > 4.9)", () => {
    expect(compareVersionCodes("4.10.0-live", "4.9.0-live")).toBeGreaterThan(0);
  });

  it("unparseable input is treated as incomparable (0)", () => {
    expect(compareVersionCodes("garbage", "4.8.0-live")).toBe(0);
  });
});

describe("decideVersionedIngest", () => {
  const B = "BeltaKoda";
  const D = "Dymerz";

  it("stages a newer LIVE version published on Dymerz (BeltaKoda still behind)", () => {
    const cur = ini(8000, "v480");
    const r = decideVersionedIngest(
      [
        { name: B, content: ini(8000, "v480"), version: live("4.8.0-live") },
        { name: D, content: ini(8016, "v481"), version: live("4.8.1-live", "11952564") },
      ],
      "4.8.0-live",
      cur,
      ["4.8.0-live", "4.7.1-live"],
      { seen: { [B]: hashIni(ini(8000, "v480")), [D]: hashIni(ini(8000, "dold")) } },
    );
    expect(r.action).toBe("stage-new");
    expect(r.source).toBe(D);
    expect(r.targetCode).toBe("4.8.1-live");
    expect(r.version?.code).toBe("4.8.1-live");
    expect(r.diff?.added.length).toBeGreaterThan(0);
  });

  it("does NOT stage or refresh from a Dymerz PTU commit (channel gate protects LIVE)", () => {
    const cur = ini(8000, "v480");
    const r = decideVersionedIngest(
      [
        { name: B, content: ini(8000, "v480"), version: live("4.8.0-live") },
        { name: D, content: ini(8020, "ptu"), version: ptu("4.8.0-ptu", "123") },
      ],
      "4.8.0-live",
      cur,
      ["4.8.0-live"],
      { seen: { [B]: hashIni(ini(8000, "v480")), [D]: hashIni(ini(8000, "dold")) } },
    );
    expect(r.action).toBe("unchanged");
  });

  it("is idempotent: a newer version already in knownCodes is not re-staged", () => {
    const r = decideVersionedIngest(
      [
        { name: B, content: ini(8000, "v480"), version: live("4.8.0-live") },
        { name: D, content: ini(8016, "v481"), version: live("4.8.1-live") },
      ],
      "4.8.0-live",
      ini(8000, "v480"),
      ["4.8.0-live", "4.8.1-live"], // already staged
      { seen: { [B]: hashIni(ini(8000, "v480")), [D]: hashIni(ini(8000, "dold")) } },
    );
    expect(r.action).toBe("unchanged");
  });

  it("refreshes the current base on a same-patch update (canonical preferred)", () => {
    const cur = ini(8000, "v480");
    const r = decideVersionedIngest(
      [
        { name: B, content: ini(8000, "v480fix"), version: live("4.8.0-live") },
        { name: D, content: ini(8000, "dy"), version: live("4.8.0-live") },
      ],
      "4.8.0-live",
      cur,
      ["4.8.0-live"],
      { seen: { [B]: hashIni(ini(8000, "v480")), [D]: hashIni(ini(8000, "dy")) } },
    );
    expect(r.action).toBe("refresh-current");
    expect(r.source).toBe(B);
    expect(r.targetCode).toBe("4.8.0-live");
  });

  it("no-regression guard holds when a source is behind the current base (the 4.8.1 case)", () => {
    const r = decideVersionedIngest(
      [{ name: B, content: ini(8000, "belta480"), version: live("4.8.0-live") }],
      "4.8.1-live",
      ini(8016, "local481"),
      ["4.8.1-live"],
      { seen: { [B]: hashIni(ini(7000, "older")) } },
    );
    expect(r.action).toBe("unchanged");
  });

  it("prefers the canonical source when both publish the new version", () => {
    const r = decideVersionedIngest(
      [
        { name: B, content: ini(8016, "b481"), version: live("4.8.1-live") },
        { name: D, content: ini(8016, "d481"), version: live("4.8.1-live", "x") },
      ],
      "4.8.0-live",
      ini(8000, "v480"),
      ["4.8.0-live"],
      { seen: { [B]: hashIni(ini(8000, "b480")), [D]: hashIni(ini(8000, "d480")) } },
    );
    expect(r.action).toBe("stage-new");
    expect(r.source).toBe(B);
  });

  it("ignores an older version (never downgrades)", () => {
    const r = decideVersionedIngest(
      [{ name: B, content: ini(8000, "old"), version: live("4.7.0-live") }],
      "4.8.0-live",
      ini(8016, "cur480"),
      ["4.8.0-live"],
      { seen: { [B]: hashIni(ini(7000, "older")) } },
    );
    expect(r.action).toBe("unchanged");
  });

  it("skips when every source fails to fetch", () => {
    const r = decideVersionedIngest(
      [{ name: B, content: null, version: null }, { name: D, content: null, version: null }],
      "4.8.0-live",
      ini(8000),
      ["4.8.0-live"],
      { seen: {} },
    );
    expect(r.action).toBe("skip");
  });
});
