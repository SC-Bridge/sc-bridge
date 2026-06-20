/**
 * Unit tests for the Fleetyards → vehicle_loaners matrix builder.
 *
 * buildLoanerPairs is pure (no network / DB), so we feed it synthetic
 * Fleetyards ships + our vehicle rows and assert the resolved edges. Covers the
 * alias map, slug/name fallbacks, dedup, and self-reference / unresolved skips.
 */
import { describe, it, expect } from "vitest";
import { buildLoanerPairs, resolveVehicleId } from "../src/sync/fleetyards";

type Ship = { slug: string; name: string; productionStatus: string; loaners?: Array<{ slug: string; name: string }> };

const vehicles = [
  { id: 1, slug: "anvl-odin", name: "Anvil Odin" },
  { id: 2, slug: "aegs-idris-p", name: "Aegis Idris-P" },
  { id: 3, slug: "rsi-ursa-rover", name: "RSI Ursa" }, // FY slug is "rsi-ursa" (alias)
  { id: 4, slug: "misc-fury", name: "Mirai Fury" }, // FY slug is "mrai-fury" (alias)
  { id: 5, slug: "drak-cutlass-black", name: "Drake Cutlass Black" },
  { id: 6, slug: "krig-p52-merlin", name: "Kruger P-52 Merlin" }, // matched by name
];

describe("buildLoanerPairs", () => {
  it("resolves an exact slug edge", () => {
    const ships: Ship[] = [
      { slug: "anvl-odin", name: "Odin", productionStatus: "in-concept", loaners: [{ slug: "aegs-idris-p", name: "Idris-P" }] },
    ];
    expect(buildLoanerPairs(ships, vehicles)).toEqual([[1, 2]]);
  });

  it("resolves via the alias map (rsi-ursa → rsi-ursa-rover, mrai-fury → misc-fury)", () => {
    const ships: Ship[] = [
      { slug: "anvl-odin", name: "Odin", productionStatus: "in-concept", loaners: [
        { slug: "rsi-ursa", name: "Ursa" },
        { slug: "mrai-fury", name: "Fury" },
      ] },
    ];
    expect(buildLoanerPairs(ships, vehicles)).toEqual([[1, 3], [1, 4]]);
  });

  it("falls back to a normalized-name match when the slug differs", () => {
    const ships: Ship[] = [
      { slug: "anvl-odin", name: "Odin", productionStatus: "in-concept", loaners: [{ slug: "krig-p-52-merlin", name: "P-52 Merlin" }] },
    ];
    expect(buildLoanerPairs(ships, vehicles)).toEqual([[1, 6]]);
  });

  it("keeps separate matrix rows when two ships grant the same loaner", () => {
    const ships: Ship[] = [
      { slug: "anvl-odin", name: "Odin", productionStatus: "in-concept", loaners: [{ slug: "aegs-idris-p", name: "Idris-P" }] },
      { slug: "drak-cutlass-black", name: "Cutlass Black", productionStatus: "flight-ready", loaners: [{ slug: "aegs-idris-p", name: "Idris-P" }] },
    ];
    // Different vehicle_id, same loaner_id — the per-user endpoint dedupes to one.
    expect(buildLoanerPairs(ships, vehicles)).toEqual([[1, 2], [5, 2]]);
  });

  it("dedupes an identical edge listed twice", () => {
    const ships: Ship[] = [
      { slug: "anvl-odin", name: "Odin", productionStatus: "in-concept", loaners: [
        { slug: "aegs-idris-p", name: "Idris-P" },
        { slug: "aegs-idris-p", name: "Idris-P" },
      ] },
    ];
    expect(buildLoanerPairs(ships, vehicles)).toEqual([[1, 2]]);
  });

  it("skips unresolved ships and unresolved loaners", () => {
    const ships: Ship[] = [
      { slug: "made-up-ship", name: "Nonexistent", productionStatus: "in-concept", loaners: [{ slug: "aegs-idris-p", name: "Idris-P" }] },
      { slug: "anvl-odin", name: "Odin", productionStatus: "in-concept", loaners: [{ slug: "no-such-loaner", name: "Ghost" }] },
    ];
    expect(buildLoanerPairs(ships, vehicles)).toEqual([]);
  });

  it("skips a self-referential edge and ships with no loaners", () => {
    const ships: Ship[] = [
      { slug: "anvl-odin", name: "Odin", productionStatus: "in-concept", loaners: [{ slug: "anvl-odin", name: "Odin" }] },
      { slug: "drak-cutlass-black", name: "Cutlass Black", productionStatus: "flight-ready" },
    ];
    expect(buildLoanerPairs(ships, vehicles)).toEqual([]);
  });
});

describe("resolveVehicleId", () => {
  const slugToId = new Map(vehicles.map((v) => [v.slug, v.id]));
  const normSlug = new Map(vehicles.map((v) => [v.slug.replace(/[^a-z0-9]/g, ""), v.id]));
  const normName = new Map(vehicles.map((v) => [v.name.toLowerCase().replace(/[^a-z0-9]/g, ""), v.id]));

  it("strips the manufacturer prefix when our slug omits it", () => {
    const map = new Map([["m80", 99]]);
    expect(resolveVehicleId("orig-m80", "Origin M80", map, new Map(), new Map())).toBe(99);
  });

  it("returns null when nothing matches", () => {
    expect(resolveVehicleId("totally-unknown", "Unknown", slugToId, normSlug, normName)).toBeNull();
  });
});
