import { describe, it, expect } from "vitest";
import {
  preloadVehicleMap,
  findVehicleSlugLocal,
  findPaintLocal,
  normalizePaintTitle,
  type VehicleMap,
} from "../src/lib/fleet-import";
import { compactSlug, slugFromName, slugFromShipCode } from "../src/lib/slug";

/**
 * Issue #282 — "Hyūn" skipped on hangar sync.
 *
 * RSI titles Gatac ships with diacritics ("Hyūn", macron ū) while the vehicles
 * table names them in plain ASCII ("Gatac Hyun"). slugFromName drops non-ASCII
 * letters ("hyn") and the name lookup compared "hyūn" with "hyun", so the item
 * was dropped as unmatched. The matcher now folds diacritics on both sides.
 */
const SHIPS = [
  { id: 1, slug: "gama-hyun", name: "Gatac Hyun" },
  { id: 2, slug: "gama-syulen", name: "Gatac Syulen" },
  { id: 3, slug: "xnaa-santokyai", name: "Aopoa San'tok.yāi" },
];

/** Builds the map through the real preloadVehicleMap over a minimal D1 stub. */
function makeMap(): Promise<VehicleMap> {
  const db = {
    prepare: (sql: string) => ({
      all: async () => ({ results: sql.includes("v.removed = 0") ? SHIPS : [] }),
    }),
  } as unknown as D1Database;
  return preloadVehicleMap(db);
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

describe("fleet-import — diacritics in RSI titles (issue #282)", () => {
  it("matches 'Hyūn' (macron) to the plain-ASCII Gatac Hyun", async () => {
    expect(match(await makeMap(), "Hyūn", "GAMA")).toBe("gama-hyun");
  });

  it("matches the upper-case 'HYŪN' too", async () => {
    expect(match(await makeMap(), "HYŪN", "GAMA")).toBe("gama-hyun");
  });

  it("matches an ASCII title against a DB name that carries diacritics", async () => {
    expect(match(await makeMap(), "San'tok.yai", "AOPOA")).toBe("xnaa-santokyai");
  });

  it("still matches the DB's own diacritic spelling", async () => {
    expect(match(await makeMap(), "San'tok.yāi", "AOPOA")).toBe("xnaa-santokyai");
  });

  it("does not break plain ASCII titles (regression)", async () => {
    expect(match(await makeMap(), "Syulen", "GAMA")).toBe("gama-syulen");
  });

  it("folds diacritics when normalising paint titles", () => {
    expect(normalizePaintTitle("Hyūn - Mojave Paint")).toBe("hyun mojave");
    const paints = { normalizedToID: new Map([["hyun mojave", 7]]) };
    expect(findPaintLocal(paints, "Hyūn - Mojave Paint")).toBe(7);
  });
});
