import { describe, it, expect } from "vitest";
import { stripManufacturer, findVehicleSlugLocal, type VehicleMap } from "../src/lib/fleet-import";
import { compactSlug, slugFromName, slugFromShipCode } from "../src/lib/slug";

/**
 * Issue #280 — CCU'd pack items "Ares Ion" / "Ares Inferno" skipped on hangar sync.
 *
 * RSI titles the pledge items "Ares Ion" / "Ares Inferno" (manufacturer CRUS),
 * but the vehicles table names them "Crusader Ares Star Fighter Ion/Inferno"
 * (slugs crus-starfighter-ion/inferno). None of the slug/name heuristics bridge
 * the missing "Star Fighter" words, so the items were dropped as unmatched.
 * The RSI ship-name alias table already knew these names; the hangar matcher
 * now consults it too.
 */
function makeMap(): VehicleMap {
  const slugToID = new Map<string, number>();
  const nameToSlug = new Map<string, string>();
  const compactToSlug = new Map<string, string>();
  const ships = [
    { id: 1, slug: "crus-starfighter-inferno", name: "Crusader Ares Star Fighter Inferno" },
    { id: 2, slug: "crus-starfighter-inferno-collector-military", name: "Crusader Ares Star Fighter Inferno Wikelo War Special" },
    { id: 3, slug: "crus-starfighter-ion", name: "Crusader Ares Star Fighter Ion" },
    { id: 4, slug: "crus-starfighter-ion-collector-stealth", name: "Crusader Ares Star Fighter Ion Wikelo Sneak Special" },
    { id: 5, slug: "tmbl-cyclone", name: "Tumbril Cyclone" },
    { id: 6, slug: "drak-mercury", name: "Crusader Mercury Star Runner" },
  ];
  for (const s of ships) {
    slugToID.set(s.slug, s.id);
    nameToSlug.set(s.name.toLowerCase(), s.slug);
    const stripped = stripManufacturer(s.name);
    if (stripped.toLowerCase() !== s.name.toLowerCase()) nameToSlug.set(stripped.toLowerCase(), s.slug);
    compactToSlug.set(compactSlug(s.slug), s.slug);
  }
  return { slugToID, nameToSlug, compactToSlug };
}

/** Same candidate list the hangar-sync route builds for a pledge Ship item. */
function match(map: VehicleMap, title: string, mfr: string): string | null {
  const nameSlug = slugFromName(title);
  const codeSlug = slugFromShipCode(`${mfr}_${title.replace(/\s+/g, "_")}`);
  const candidates = [
    codeSlug, nameSlug, compactSlug(codeSlug), compactSlug(nameSlug),
    `${mfr.toLowerCase()}-${nameSlug}`, `${mfr.toLowerCase()}${compactSlug(nameSlug)}`,
  ];
  return findVehicleSlugLocal(map, candidates, title);
}

describe("fleet-import — RSI ship-name aliases (issue #280)", () => {
  it("matches 'Ares Ion' to the base Ion, not a Wikelo variant", () => {
    expect(match(makeMap(), "Ares Ion", "CRUS")).toBe("crus-starfighter-ion");
  });

  it("matches 'Ares Inferno' to the base Inferno, not a Wikelo variant", () => {
    expect(match(makeMap(), "Ares Inferno", "CRUS")).toBe("crus-starfighter-inferno");
  });

  it("applies aliases case-insensitively (RSI sends upper-case titles too)", () => {
    expect(match(makeMap(), "ARES ION", "CRUS")).toBe("crus-starfighter-ion");
  });

  it("applies other aliases from the shared table", () => {
    expect(match(makeMap(), "Mercury", "CRUS")).toBe("drak-mercury");
  });

  it("still matches direct names first (regression)", () => {
    expect(match(makeMap(), "Cyclone", "TMBL")).toBe("tmbl-cyclone");
  });
});
