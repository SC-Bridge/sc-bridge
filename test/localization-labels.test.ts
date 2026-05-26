import { describe, it, expect } from "vitest";
import {
  humanizeComponentType,
  missileSeekerCode,
  generateItemLabels,
  type ItemRow,
} from "../src/lib/localization";

/**
 * Item-label parity helpers for the Localization Builder:
 *   - humanizeComponentType turns PascalCase vehicle_components.type values
 *     (WeaponMining, SalvageModifier) into the readable noun shown in a
 *     blueprint's "(Type)" annotation.
 *   - missileSeekerCode maps a missile's tracking_signal to the short seeker
 *     tag StarStrings prefixes (Electromagnetic -> EM).
 *   - generateItemLabels supports a "seeker" field so missile labels can lead
 *     with [EM]/[IR]/[CS].
 */

function itemRow(over: Partial<ItemRow>): ItemRow {
  return {
    className: "dominator_ii_missile",
    name: "Dominator II Missile",
    manufacturerCode: null,
    size: null,
    grade: null,
    subType: null,
    seeker: null,
    ...over,
  };
}

describe("humanizeComponentType", () => {
  it("maps known PascalCase component types to readable nouns", () => {
    expect(humanizeComponentType("QuantumDrive")).toBe("Quantum Drive");
    expect(humanizeComponentType("PowerPlant")).toBe("Power Plant");
    expect(humanizeComponentType("WeaponMining")).toBe("Mining Laser");
    expect(humanizeComponentType("SalvageModifier")).toBe("Salvage Module");
  });

  it("passes single-word types through unchanged", () => {
    expect(humanizeComponentType("Radar")).toBe("Radar");
    expect(humanizeComponentType("Cooler")).toBe("Cooler");
    expect(humanizeComponentType("Shield")).toBe("Shield");
  });

  it("splits unknown PascalCase into spaced words as a fallback", () => {
    expect(humanizeComponentType("FooBarBaz")).toBe("Foo Bar Baz");
  });

  it("returns null for empty/nullish input", () => {
    expect(humanizeComponentType("")).toBeNull();
    expect(humanizeComponentType(null)).toBeNull();
  });
});

describe("missileSeekerCode", () => {
  it("maps tracking signals to short seeker codes", () => {
    expect(missileSeekerCode("Electromagnetic")).toBe("EM");
    expect(missileSeekerCode("Infrared")).toBe("IR");
    expect(missileSeekerCode("CrossSection")).toBe("CS");
  });

  it("returns null for unknown or missing signals", () => {
    expect(missileSeekerCode(null)).toBeNull();
    expect(missileSeekerCode("")).toBeNull();
    expect(missileSeekerCode("Mystery")).toBeNull();
  });
});

describe("generateItemLabels — seeker field", () => {
  it("prefixes a missile label with its seeker tag", () => {
    const rows: ItemRow[] = [itemRow({ seeker: "EM" })];
    const out = generateItemLabels(rows, { fields: ["seeker"], format: "prefix" });
    expect(out).toHaveLength(1);
    expect(out[0].value).toBe("[EM] Dominator II Missile");
  });

  it("omits the seeker tag when the row has no seeker", () => {
    const rows: ItemRow[] = [itemRow({ seeker: null })];
    const out = generateItemLabels(rows, { fields: ["seeker"], format: "prefix" });
    expect(out[0].value).toBe("Dominator II Missile");
  });
});
