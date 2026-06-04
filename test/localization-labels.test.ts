import { describe, it, expect } from "vitest";
import {
  humanizeComponentType,
  missileSeekerCode,
  generateItemLabels,
  ALL_LABEL_FIELDS,
  CATEGORY_AVAILABLE_FIELDS,
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
    componentClass: null,
    type: null,
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

describe("generateItemLabels — componentClass field", () => {
  it("appends the component class (Military/Stealth/…) to the tag", () => {
    const rows: ItemRow[] = [
      itemRow({
        className: "cooler_godi_s2_military",
        name: "FullStop",
        manufacturerCode: "GODI",
        size: 2,
        grade: "C",
        subType: "Cooler",
        componentClass: "Military",
      }),
    ];
    const out = generateItemLabels(rows, {
      fields: ["manufacturer", "size", "grade", "subType", "componentClass"],
      format: "suffix",
    });
    expect(out[0].value).toBe("FullStop [GODI | S2 | Gr.C | Cooler | Military]");
  });

  it("omits the class when the row has none", () => {
    const rows: ItemRow[] = [
      itemRow({ name: "FullStop", subType: "Cooler", componentClass: null }),
    ];
    const out = generateItemLabels(rows, {
      fields: ["subType", "componentClass"],
      format: "suffix",
    });
    expect(out[0].value).toBe("FullStop [Cooler]");
  });
});

describe("generateItemLabels — Type field (subType) coalesce vs UNDEFINED", () => {
  // CIG sets AttachDef.SubType="UNDEFINED" for coolers/shields/quantum drives,
  // putting the real classification in AttachDef.Type ("Cooler"). The Type label
  // field should fall back to the humanized `type` column rather than print
  // the literal "UNDEFINED".
  it("falls back to humanized type when subType is UNDEFINED", () => {
    const rows: ItemRow[] = [
      itemRow({ name: "AbsoluteZero", subType: "UNDEFINED", type: "Cooler" }),
    ];
    const out = generateItemLabels(rows, { fields: ["subType"], format: "suffix" });
    expect(out[0].value).toBe("AbsoluteZero [Cooler]");
  });

  it("humanizes a PascalCase type fallback (QuantumDrive -> Quantum Drive)", () => {
    const rows: ItemRow[] = [
      itemRow({ name: "VK00", subType: "UNDEFINED", type: "QuantumDrive" }),
    ];
    const out = generateItemLabels(rows, { fields: ["subType"], format: "suffix" });
    expect(out[0].value).toBe("VK00 [Quantum Drive]");
  });

  it("keeps a meaningful subType instead of the type fallback", () => {
    const rows: ItemRow[] = [
      itemRow({ name: "Thruster_X", subType: "FixedThruster", type: "MainThruster" }),
    ];
    const out = generateItemLabels(rows, { fields: ["subType"], format: "suffix" });
    expect(out[0].value).toBe("Thruster_X [FixedThruster]");
  });

  it("drops the Type field entirely when subType is UNDEFINED and no type is available", () => {
    const rows: ItemRow[] = [
      itemRow({ name: "Pint Glass", subType: "UNDEFINED", type: null }),
    ];
    const out = generateItemLabels(rows, { fields: ["subType"], format: "suffix" });
    expect(out[0].value).toBe("Pint Glass");
  });
});

describe("label-field source of truth", () => {
  // The save endpoint's Zod enum is built from ALL_LABEL_FIELDS, so it must
  // contain every field any category can offer — otherwise saving a config
  // that uses that field fails validation (regression: componentClass was
  // selectable in the UI but rejected on save).
  it("ALL_LABEL_FIELDS covers every field in CATEGORY_AVAILABLE_FIELDS", () => {
    const allowed = new Set<string>(ALL_LABEL_FIELDS);
    for (const [cat, fields] of Object.entries(CATEGORY_AVAILABLE_FIELDS)) {
      for (const f of fields) {
        expect(allowed.has(f), `${cat} offers "${f}" but it's not in ALL_LABEL_FIELDS`).toBe(true);
      }
    }
  });

  it("includes componentClass", () => {
    expect(ALL_LABEL_FIELDS).toContain("componentClass");
  });
});
