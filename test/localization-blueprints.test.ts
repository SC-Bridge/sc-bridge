import { describe, it, expect } from "vitest";
import {
  BP_APPEND_SENTINEL,
  generateContractBlueprintOverrides,
  type ContractBpRow,
} from "../src/lib/localization";

/**
 * generateContractBlueprintOverrides — pure grouping + rendering for the
 * Localization Builder's "Blueprint Pools" enhancement. Given flat
 * (contract × pool × blueprint-name) rows it produces global.ini overrides
 * that:
 *   - append the (possibly multi-)pool blueprint list to the contract
 *     description, with a reputation-awarded line,
 *   - tag the contract title with [N Rep] [BP].
 *
 * Both overrides use the BP_APPEND sentinel so the download endpoint appends
 * to the base value rather than replacing it.
 */

function row(over: Partial<ContractBpRow>): ContractBpRow {
  return {
    titleLocKey: "Gen_title",
    descLocKey: "Gen_desc",
    repReward: null,
    poolKey: "poolA",
    blueprintName: "R97 Shotgun",
    componentType: null,
    ...over,
  };
}

describe("generateContractBlueprintOverrides", () => {
  it("appends a single 'Potential Blueprints' list to the description", () => {
    const out = generateContractBlueprintOverrides([
      row({ blueprintName: "R97 Shotgun" }),
      row({ blueprintName: "Monde Arms" }),
    ]);
    const desc = out.find((o) => o.key === "Gen_desc");
    expect(desc).toBeDefined();
    expect(desc!.value.startsWith(BP_APPEND_SENTINEL)).toBe(true);
    expect(desc!.value).toContain("<EM4>Potential Blueprints</EM4>");
    expect(desc!.value).toContain("- R97 Shotgun");
    expect(desc!.value).toContain("- Monde Arms");
    // Single pool must NOT use the multi-pool heading
    expect(desc!.value).not.toContain("Multiple Blueprint Pools");
  });

  it("separates multiple pools into Pool 1 / Pool 2 (no collapse)", () => {
    const out = generateContractBlueprintOverrides([
      row({ poolKey: "poolA", blueprintName: "P8-AR Rifle" }),
      row({ poolKey: "poolB", blueprintName: "Prism Laser Shotgun" }),
    ]);
    const desc = out.find((o) => o.key === "Gen_desc")!;
    expect(desc.value).toContain("<EM4>Multiple Blueprint Pools</EM4>");
    expect(desc.value).toContain("<EM4>Pool 1</EM4>");
    expect(desc.value).toContain("<EM4>Pool 2</EM4>");
    expect(desc.value).toContain("- P8-AR Rifle");
    expect(desc.value).toContain("- Prism Laser Shotgun");
  });

  it("includes a reputation-awarded line when repReward is set", () => {
    const out = generateContractBlueprintOverrides([
      row({ repReward: 100 }),
    ]);
    const desc = out.find((o) => o.key === "Gen_desc")!;
    expect(desc.value).toContain("<EM4>Reputation Awarded:</EM4> 100");
  });

  it("omits the reputation line when repReward is null", () => {
    const out = generateContractBlueprintOverrides([row({ repReward: null })]);
    const desc = out.find((o) => o.key === "Gen_desc")!;
    expect(desc.value).not.toContain("Reputation Awarded");
  });

  it("tags the title with [N Rep] [BP] when rep is known", () => {
    const out = generateContractBlueprintOverrides([
      row({ titleLocKey: "Gen_title", repReward: 100 }),
    ]);
    const title = out.find((o) => o.key === "Gen_title");
    expect(title).toBeDefined();
    expect(title!.value.startsWith(BP_APPEND_SENTINEL)).toBe(true);
    expect(title!.value).toContain("[100 Rep]");
    expect(title!.value).toContain("[BP]");
  });

  it("tags the title with bare [BP] when rep is unknown", () => {
    const out = generateContractBlueprintOverrides([
      row({ titleLocKey: "Gen_title", repReward: null }),
    ]);
    const title = out.find((o) => o.key === "Gen_title")!;
    expect(title.value).toContain("[BP]");
    expect(title.value).not.toContain("Rep]");
  });

  it("annotates ship-component blueprint names with their (Type)", () => {
    const out = generateContractBlueprintOverrides([
      row({ blueprintName: "Cinch Scraper Module", componentType: "Salvage Module" }),
      row({ blueprintName: "R97 Shotgun", componentType: null }),
    ]);
    const desc = out.find((o) => o.key === "Gen_desc")!;
    expect(desc.value).toContain("- Cinch Scraper Module (Salvage Module)");
    // FPS gear (no componentType) stays bare
    expect(desc.value).toContain("- R97 Shotgun");
    expect(desc.value).not.toContain("R97 Shotgun (");
  });

  it("shows a rep range '(by difficulty)' when one description is shared across rep tiers", () => {
    const out = generateContractBlueprintOverrides([
      row({ descLocKey: "Shared_desc", repReward: 200 }),
      row({ descLocKey: "Shared_desc", repReward: 100 }),
    ]);
    const desc = out.find((o) => o.key === "Shared_desc")!;
    expect(desc.value).toContain("<EM4>Reputation Awarded (by difficulty):</EM4> 100 / 200");
    expect(desc.value).not.toContain("<EM4>Reputation Awarded:</EM4>");
  });

  it("dedupes repeated blueprint names within a pool", () => {
    const out = generateContractBlueprintOverrides([
      row({ blueprintName: "R97 Shotgun" }),
      row({ blueprintName: "R97 Shotgun" }),
    ]);
    const desc = out.find((o) => o.key === "Gen_desc")!;
    const occurrences = desc.value.split("- R97 Shotgun").length - 1;
    expect(occurrences).toBe(1);
  });

  it("emits exactly one override per distinct title/desc key", () => {
    const out = generateContractBlueprintOverrides([
      row({ blueprintName: "A" }),
      row({ blueprintName: "B" }),
    ]);
    expect(out.filter((o) => o.key === "Gen_desc")).toHaveLength(1);
    expect(out.filter((o) => o.key === "Gen_title")).toHaveLength(1);
  });

  it("resolves keys case-insensitively via validKeys and skips unknown keys", () => {
    const validKeys = new Map<string, string>([
      ["gen_desc", "Gen_Desc"], // real global.ini casing differs
    ]);
    const out = generateContractBlueprintOverrides(
      [row({ titleLocKey: "Missing_title", descLocKey: "Gen_desc" })],
      validKeys,
    );
    // desc resolves to the real-cased key
    expect(out.find((o) => o.key === "Gen_Desc")).toBeDefined();
    // title key absent from validKeys → no title override
    expect(out.some((o) => o.key.toLowerCase() === "missing_title")).toBe(false);
  });

  it("matches the ,P variant key when the base key is absent", () => {
    const validKeys = new Map<string, string>([["gen_desc,p", "Gen_desc,P"]]);
    const out = generateContractBlueprintOverrides(
      [row({ titleLocKey: "", descLocKey: "Gen_desc" })],
      validKeys,
    );
    expect(out.find((o) => o.key === "Gen_desc,P")).toBeDefined();
  });
});
