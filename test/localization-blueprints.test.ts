import { describe, it, expect } from "vitest";
import {
  BP_APPEND_SENTINEL,
  generateContractOverrides,
  type ContractRow,
  type ContractOverrideOpts,
} from "../src/lib/localization";

/**
 * generateContractOverrides — pure grouping + rendering for the Localization
 * Builder's contract enhancements. Reputation and Blueprint Pools are
 * independent concerns toggled via opts:
 *   - includeRep: append a reputation line to the description and an
 *     [N Rep] tag to the title, for ANY rep-awarding contract.
 *   - includeBlueprints: append the (multi-)pool blueprint list to the
 *     description and a [BP] tag to the title, for blueprint-awarding ones.
 *
 * Both overrides use the BP_APPEND sentinel so the download endpoint appends
 * to the base value rather than replacing it.
 */

const BOTH: ContractOverrideOpts = { includeRep: true, includeBlueprints: true };

function row(over: Partial<ContractRow>): ContractRow {
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

describe("generateContractOverrides — blueprints", () => {
  it("appends a single 'Potential Blueprints' list to the description", () => {
    const out = generateContractOverrides(
      [row({ blueprintName: "R97 Shotgun" }), row({ blueprintName: "Monde Arms" })],
      BOTH,
    );
    const desc = out.find((o) => o.key === "Gen_desc");
    expect(desc).toBeDefined();
    expect(desc!.value.startsWith(BP_APPEND_SENTINEL)).toBe(true);
    expect(desc!.value).toContain("<EM4>Potential Blueprints</EM4>");
    expect(desc!.value).toContain("- R97 Shotgun");
    expect(desc!.value).toContain("- Monde Arms");
    expect(desc!.value).not.toContain("Multiple Blueprint Pools");
  });

  it("separates multiple pools into Pool 1 / Pool 2 (no collapse)", () => {
    const out = generateContractOverrides(
      [
        row({ poolKey: "poolA", blueprintName: "P8-AR Rifle" }),
        row({ poolKey: "poolB", blueprintName: "Prism Laser Shotgun" }),
      ],
      BOTH,
    );
    const desc = out.find((o) => o.key === "Gen_desc")!;
    expect(desc.value).toContain("<EM4>Multiple Blueprint Pools</EM4>");
    expect(desc.value).toContain("<EM4>Pool 1</EM4>");
    expect(desc.value).toContain("<EM4>Pool 2</EM4>");
    expect(desc.value).toContain("- P8-AR Rifle");
    expect(desc.value).toContain("- Prism Laser Shotgun");
  });

  it("annotates ship-component blueprint names with their (Type)", () => {
    const out = generateContractOverrides(
      [
        row({ blueprintName: "Cinch Scraper Module", componentType: "Salvage Module" }),
        row({ blueprintName: "R97 Shotgun", componentType: null }),
      ],
      BOTH,
    );
    const desc = out.find((o) => o.key === "Gen_desc")!;
    expect(desc.value).toContain("- Cinch Scraper Module (Salvage Module)");
    expect(desc.value).toContain("- R97 Shotgun");
    expect(desc.value).not.toContain("R97 Shotgun (");
  });

  it("tags the title with bare [BP] when rep is unknown", () => {
    const out = generateContractOverrides([row({ repReward: null })], BOTH);
    const title = out.find((o) => o.key === "Gen_title")!;
    expect(title.value).toContain("[BP]");
    expect(title.value).not.toContain("Rep]");
  });

  it("dedupes repeated blueprint names within a pool", () => {
    const out = generateContractOverrides(
      [row({ blueprintName: "R97 Shotgun" }), row({ blueprintName: "R97 Shotgun" })],
      BOTH,
    );
    const desc = out.find((o) => o.key === "Gen_desc")!;
    expect(desc.value.split("- R97 Shotgun").length - 1).toBe(1);
  });

  it("matches the ,P variant key when the base key is absent", () => {
    const validKeys = new Map<string, string>([["gen_desc,p", "Gen_desc,P"]]);
    const out = generateContractOverrides(
      [row({ titleLocKey: "", descLocKey: "Gen_desc" })],
      BOTH,
      validKeys,
    );
    expect(out.find((o) => o.key === "Gen_desc,P")).toBeDefined();
  });

  it("with includeBlueprints=false, omits pools even when present", () => {
    const out = generateContractOverrides(
      [row({ repReward: 100, blueprintName: "R97 Shotgun" })],
      { includeRep: true, includeBlueprints: false },
    );
    const desc = out.find((o) => o.key === "Gen_desc")!;
    expect(desc.value).not.toContain("Potential Blueprints");
    const title = out.find((o) => o.key === "Gen_title")!;
    expect(title.value).not.toContain("[BP]");
  });
});

describe("generateContractOverrides — reputation", () => {
  it("includes a reputation-awarded line when includeRep and rep is set", () => {
    const out = generateContractOverrides([row({ repReward: 100 })], BOTH);
    const desc = out.find((o) => o.key === "Gen_desc")!;
    expect(desc.value).toContain("<EM4>Reputation Awarded:</EM4> 100");
  });

  it("omits the reputation line when rep is null", () => {
    const out = generateContractOverrides([row({ repReward: null })], BOTH);
    const desc = out.find((o) => o.key === "Gen_desc")!;
    expect(desc.value).not.toContain("Reputation Awarded");
  });

  it("tags the title with [N Rep] [BP] when rep + blueprints both apply", () => {
    const out = generateContractOverrides([row({ repReward: 100 })], BOTH);
    const title = out.find((o) => o.key === "Gen_title")!;
    expect(title.value.startsWith(BP_APPEND_SENTINEL)).toBe(true);
    expect(title.value).toContain("[100 Rep]");
    expect(title.value).toContain("[BP]");
  });

  it("shows a rep range '(by difficulty)' when one description spans rep tiers", () => {
    const out = generateContractOverrides(
      [
        row({ descLocKey: "Shared_desc", repReward: 200 }),
        row({ descLocKey: "Shared_desc", repReward: 100 }),
      ],
      BOTH,
    );
    const desc = out.find((o) => o.key === "Shared_desc")!;
    expect(desc.value).toContain("<EM4>Reputation Awarded (by difficulty):</EM4> 100 / 200");
    expect(desc.value).not.toContain("<EM4>Reputation Awarded:</EM4>");
  });

  it("rep-only (no blueprint, includeBlueprints=false) still tags [N Rep] + rep line", () => {
    const out = generateContractOverrides(
      [{ titleLocKey: "Solo_title", descLocKey: "Solo_desc", repReward: 500, poolKey: null, blueprintName: null }],
      { includeRep: true, includeBlueprints: false },
    );
    const title = out.find((o) => o.key === "Solo_title")!;
    const desc = out.find((o) => o.key === "Solo_desc")!;
    expect(title.value).toContain("[500 Rep]");
    expect(title.value).not.toContain("[BP]");
    expect(desc.value).toContain("<EM4>Reputation Awarded:</EM4> 500");
    expect(desc.value).not.toContain("Potential Blueprints");
  });

  it("with includeRep=false, BP contract shows [BP] + pools but NO rep", () => {
    const out = generateContractOverrides(
      [row({ repReward: 100, blueprintName: "R97 Shotgun" })],
      { includeRep: false, includeBlueprints: true },
    );
    const title = out.find((o) => o.key === "Gen_title")!;
    const desc = out.find((o) => o.key === "Gen_desc")!;
    expect(title.value).toContain("[BP]");
    expect(title.value).not.toContain("Rep]");
    expect(desc.value).toContain("Potential Blueprints");
    expect(desc.value).not.toContain("Reputation Awarded");
  });

  it("emits no override for a contract with neither rep nor blueprints under rep-only", () => {
    const out = generateContractOverrides(
      [{ titleLocKey: "Bare_title", descLocKey: "Bare_desc", repReward: null, poolKey: null, blueprintName: null }],
      { includeRep: true, includeBlueprints: false },
    );
    expect(out).toHaveLength(0);
  });
});
