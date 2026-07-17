import { describe, it, expect } from "vitest";
import {
  humanizeComponentType,
  missileSeekerCode,
  generateItemLabels,
  generateContrabandWarnings,
  generateMaterialShortNames,
  ALL_LABEL_FIELDS,
  CATEGORY_AVAILABLE_FIELDS,
  BP_APPEND_SENTINEL,
  BP_PREPEND_SENTINEL,
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

  it("treats the CIG 'UNDEFINED' sentinel as null (never a real type)", () => {
    expect(humanizeComponentType("UNDEFINED")).toBeNull();
    expect(humanizeComponentType("undefined")).toBeNull();
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

  it("drops the Type field when BOTH subType and type are UNDEFINED (the medical-canister case)", () => {
    const rows: ItemRow[] = [
      itemRow({ name: "Pancea MedGel Canister", size: 1, grade: "1", subType: "UNDEFINED", type: "UNDEFINED" }),
    ];
    const out = generateItemLabels(rows, { fields: ["size", "grade", "subType"], format: "suffix" });
    expect(out[0].value).toBe("Pancea MedGel Canister [S1 | Gr.1]");
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

/**
 * Commodity key resolution — a trade_commodities.class_name does not always
 * match the game's own global.ini key. Real 4.9 cases:
 *   class "quantanium"        -> key items_commodities_quantainium   (class misspelt)
 *   class "raw_quantainium"   -> key items_commodities_quantainium_raw (prefix vs suffix)
 *   class "medicalSupplies_medPens" -> key items_commodities_medpens
 * The DB `name` is authoritative and matches the base value, so it drives the
 * fallback candidates. A RAW item must never fall back to the refined key.
 */
describe("commodity key resolution", () => {
  const keys = (...ks: string[]) => new Map(ks.map((k) => [k.toLowerCase(), k]));

  it("resolves the exact class_name key", () => {
    const out = generateContrabandWarnings(
      [{ className: "titanium", name: "Titanium" }],
      keys("items_commodities_titanium"),
    );
    expect(out).toEqual([
      { key: "items_commodities_titanium", value: "[!] Titanium", original: "Titanium" },
    ]);
  });

  it("falls back to the display-name key when class_name is misspelt (quantanium -> quantainium)", () => {
    const out = generateContrabandWarnings(
      [{ className: "quantanium", name: "Quantainium" }],
      keys("items_commodities_quantainium"),
    );
    expect(out[0]?.key).toBe("items_commodities_quantainium");
  });

  it("maps a raw_* class to the game's <stem>_raw key", () => {
    const out = generateContrabandWarnings(
      [{ className: "raw_quantainium", name: "Quantainium (Raw)" }],
      keys("items_commodities_quantainium_raw"),
    );
    expect(out[0]?.key).toBe("items_commodities_quantainium_raw");
  });

  it("NEVER falls back to the refined key for a raw item", () => {
    // Hephaestanite (R) has no _raw key in the 4.9 base. Matching the refined
    // key would stamp the raw item's label onto a different commodity.
    const out = generateContrabandWarnings(
      [{ className: "raw_hephaestanite", name: "Hephaestanite (R)" }],
      keys("items_commodities_hephaestanite"),
    );
    expect(out).toEqual([]);
  });

  it("resolves via the ,P parameter variant when only that form exists", () => {
    // 4.9: Hephaestanite (R)'s only raw key is items_commodities_hephaestanite_raw,P
    // — the bare form doesn't exist. Same ,P handling the contract resolver uses.
    const out = generateContrabandWarnings(
      [{ className: "raw_hephaestanite", name: "Hephaestanite (R)" }],
      keys("items_commodities_hephaestanite_raw,P"),
    );
    expect(out[0]?.key).toBe("items_commodities_hephaestanite_raw,P");
  });

  it("prefers the raw ,P key over a refined bare key", () => {
    // Both present: the raw item must still never take the refined key.
    const out = generateContrabandWarnings(
      [{ className: "raw_hephaestanite", name: "Hephaestanite (R)" }],
      keys("items_commodities_hephaestanite", "items_commodities_hephaestanite_raw,P"),
    );
    expect(out[0]?.key).toBe("items_commodities_hephaestanite_raw,P");
  });

  it("normalises an underscored/camelCase class via its display name", () => {
    const out = generateContrabandWarnings(
      [{ className: "medicalSupplies_medPens", name: "MedPens" }],
      keys("items_commodities_medpens"),
    );
    expect(out[0]?.key).toBe("items_commodities_medpens");
  });

  it("emits nothing when no candidate exists in the base", () => {
    const out = generateContrabandWarnings(
      [{ className: "hpmc", name: "HexaPolyMesh Coating" }],
      keys("items_commodities_unrelated"),
    );
    expect(out).toEqual([]);
  });

  it("shortens a raw material via its _raw key", () => {
    const out = generateMaterialShortNames(
      [{ className: "raw_quantainium", name: "Quantainium (Raw)" }],
      keys("items_commodities_quantainium_raw"),
    );
    expect(out[0]).toEqual({
      key: "items_commodities_quantainium_raw",
      value: "Quant (Raw)",
      original: "Quantainium (Raw)",
    });
  });

  it("does not shorten a raw material onto the refined key", () => {
    const out = generateMaterialShortNames(
      [{ className: "raw_hephaestanite", name: "Hephaestanite (R)" }],
      keys("items_commodities_hephaestanite"),
    );
    expect(out).toEqual([]);
  });
});


/**
 * Short-form labels — the game ships a second, shorter string for many items
 * (item_Name<class>_short; 715 of them in the 4.9 base) used in compact UI.
 * StarStrings sets both (item_NameGMISL_..._short=[CS1] Spark-G). Only the base
 * knows the short text, so the tag is wrapped around it at merge time via a
 * sentinel — the same trick the contract overrides use.
 */
describe("generateItemLabels — _short variants", () => {
  const keys = (...ks: string[]) => new Map(ks.map((k) => [k.toLowerCase(), k]));

  it("appends the tag to the game's short value (suffix format)", () => {
    const rows: ItemRow[] = [itemRow({ className: "cooler_x", name: "FullStop", subType: "Cooler" })];
    const out = generateItemLabels(rows, { fields: ["subType"], format: "suffix" },
      keys("item_Namecooler_x", "item_Namecooler_x_short"));
    const short = out.find((o) => o.key === "item_Namecooler_x_short");
    expect(short?.value).toBe(`${BP_APPEND_SENTINEL} [Cooler]`);
  });

  it("prepends the tag to the game's short value (prefix format)", () => {
    const rows: ItemRow[] = [itemRow({ className: "gmisl_x", name: "Spark-G Missile", seeker: "CS" })];
    const out = generateItemLabels(rows, { fields: ["seeker"], format: "prefix" },
      keys("item_Namegmisl_x", "item_Namegmisl_x_short"));
    const short = out.find((o) => o.key === "item_Namegmisl_x_short");
    expect(short?.value).toBe(`${BP_PREPEND_SENTINEL}[CS] `);
  });

  it("still emits the long label alongside the short one", () => {
    const rows: ItemRow[] = [itemRow({ className: "cooler_x", name: "FullStop", subType: "Cooler" })];
    const out = generateItemLabels(rows, { fields: ["subType"], format: "suffix" },
      keys("item_Namecooler_x", "item_Namecooler_x_short"));
    expect(out.find((o) => o.key === "item_Namecooler_x")?.value).toBe("FullStop [Cooler]");
    expect(out).toHaveLength(2);
  });

  it("omits the short override when the base has no _short key", () => {
    const rows: ItemRow[] = [itemRow({ className: "cooler_x", name: "FullStop", subType: "Cooler" })];
    const out = generateItemLabels(rows, { fields: ["subType"], format: "suffix" },
      keys("item_Namecooler_x"));
    expect(out.map((o) => o.key)).toEqual(["item_Namecooler_x"]);
  });

  it("omits the short override when there is no tag to add", () => {
    const rows: ItemRow[] = [itemRow({ className: "cooler_x", name: "FullStop", subType: null, type: null })];
    const out = generateItemLabels(rows, { fields: ["subType"], format: "suffix" },
      keys("item_Namecooler_x", "item_Namecooler_x_short"));
    expect(out.map((o) => o.key)).toEqual(["item_Namecooler_x"]);
  });

  it("emits no short override when no base key set is supplied", () => {
    // Without validKeys we cannot know a _short key exists; emitting one would
    // invent a phantom key.
    const rows: ItemRow[] = [itemRow({ seeker: "EM" })];
    const out = generateItemLabels(rows, { fields: ["seeker"], format: "prefix" });
    expect(out).toHaveLength(1);
  });
});


/**
 * Item key conventions — CIG writes item labels under BOTH
 *   item_Name<class>   (weapons, most components)
 *   item_Name_<class>  (armour, helmets — note the underscore)
 * Only building the first form left every fps_armour (1472) and fps_helmet
 * (549) label unresolved in the 4.9 base, so those toggles did nothing.
 */
describe("generateItemLabels — item_Name_<class> underscore convention", () => {
  const keys = (...ks: string[]) => new Map(ks.map((k) => [k.toLowerCase(), k]));

  it("resolves the underscore variant when the bare form is absent (armour/helmets)", () => {
    const rows: ItemRow[] = [
      itemRow({ className: "ccc_heavy_armor_helmet_01_01_01", name: "Neoni Tengubi Helmet", subType: "Helmet" }),
    ];
    const out = generateItemLabels(rows, { fields: ["subType"], format: "suffix" },
      keys("item_Name_ccc_heavy_armor_helmet_01_01_01"));
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe("item_Name_ccc_heavy_armor_helmet_01_01_01");
    expect(out[0].value).toBe("Neoni Tengubi Helmet [Helmet]");
  });

  it("prefers the bare item_Name<class> when both forms exist", () => {
    const rows: ItemRow[] = [itemRow({ className: "cooler_x", name: "FullStop", subType: "Cooler" })];
    const out = generateItemLabels(rows, { fields: ["subType"], format: "suffix" },
      keys("item_Namecooler_x", "item_Name_cooler_x"));
    expect(out[0].key).toBe("item_Namecooler_x");
  });

  it("derives the _short key from whichever convention resolved", () => {
    const rows: ItemRow[] = [itemRow({ className: "armor_x", name: "Pembroke", subType: "Backpack" })];
    const out = generateItemLabels(rows, { fields: ["subType"], format: "suffix" },
      keys("item_Name_armor_x", "item_Name_armor_x_short"));
    expect(out.map((o) => o.key)).toEqual(["item_Name_armor_x", "item_Name_armor_x_short"]);
    expect(out[1].value).toBe(`${BP_APPEND_SENTINEL} [Backpack]`);
  });

  it("still emits nothing when neither convention exists", () => {
    const rows: ItemRow[] = [itemRow({ className: "ghost_item", name: "Ghost", subType: "X" })];
    const out = generateItemLabels(rows, { fields: ["subType"], format: "suffix" },
      keys("item_Namesomething_else"));
    expect(out).toEqual([]);
  });
});
