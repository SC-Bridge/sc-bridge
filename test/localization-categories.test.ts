import { describe, it, expect } from "vitest";
import { classifyKey, applyCategoryPacks, KEY_CATEGORIES } from "../src/lib/localization";

/**
 * Per-category pack assignment (StarMeld parity): a global.ini key is
 * classified into a category by its prefix, and a user can assign a specific
 * pack to a category so that pack's values win for keys in that category.
 */

describe("classifyKey", () => {
  it("classifies by key prefix", () => {
    expect(classifyKey("vehicle_NameAEGS_Gladius")).toBe("ship_names");
    expect(classifyKey("item_NameKLWE_LaserRepeater")).toBe("items");
    expect(classifyKey("items_commodities_raw_ice")).toBe("commodities");
    expect(classifyKey("Journal_General_Mining_Compendium_Content")).toBe("journal");
    expect(classifyKey("ui_ButtonConfirm")).toBe("ui");
    expect(classifyKey("SomeContract_Title_001")).toBe("other");
  });

  it("is case-insensitive on the prefix", () => {
    expect(classifyKey("VEHICLE_NAMEfoo")).toBe("ship_names");
  });

  it("every category id is in KEY_CATEGORIES", () => {
    const ids = new Set(KEY_CATEGORIES.map((c) => c.id));
    for (const k of ["vehicle_Namex", "item_Namex", "items_commodities_x", "Journal_x", "ui_x", "zzz"]) {
      expect(ids.has(classifyKey(k))).toBe(true);
    }
  });
});

describe("applyCategoryPacks", () => {
  function pack(entries: Record<string, string>): Map<string, string> {
    return new Map(Object.entries(entries).map(([k, v]) => [k.toLowerCase(), v]));
  }

  it("a category's assigned pack wins for keys in that category only", () => {
    const overrideMap = new Map<string, string>([
      ["vehicle_nameaegs_gladius", "wholesale gladius"],
      ["item_namefoo", "wholesale foo"],
    ]);
    const packEntries = {
      shipPack: pack({ vehicle_NameAEGS_Gladius: "shipPack gladius", item_NameBar: "shipPack bar" }),
    };
    applyCategoryPacks(overrideMap, { ship_names: "shipPack" }, packEntries);

    // ship_names key overridden by the assigned pack
    expect(overrideMap.get("vehicle_nameaegs_gladius")).toBe("shipPack gladius");
    // item key NOT touched (item_NameBar is 'items' category, not assigned)
    expect(overrideMap.get("item_namefoo")).toBe("wholesale foo");
    expect(overrideMap.has("item_namebar")).toBe(false);
  });

  it("ignores assignments whose pack isn't loaded", () => {
    const overrideMap = new Map<string, string>([["ui_x", "base"]]);
    applyCategoryPacks(overrideMap, { ui: "missing-pack" }, {});
    expect(overrideMap.get("ui_x")).toBe("base");
  });

  it("does nothing with no assignments", () => {
    const overrideMap = new Map<string, string>([["ui_x", "base"]]);
    applyCategoryPacks(overrideMap, {}, { p: pack({ ui_x: "p" }) });
    expect(overrideMap.get("ui_x")).toBe("base");
  });
});
