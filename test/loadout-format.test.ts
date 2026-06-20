import { describe, it, expect } from "vitest";
import { humanizePortName } from "../src/lib/loadout-format";

describe("humanizePortName", () => {
  it("humanizes hardpoint weapon ports", () => {
    expect(humanizePortName("hardpoint_weapon_top_left_1")).toBe("Weapon Top Left 1");
    expect(humanizePortName("hardpoint_weapon_top_right_2")).toBe("Weapon Top Right 2");
  });

  it("handles non-hardpoint ports", () => {
    expect(humanizePortName("shield_port")).toBe("Shield Port");
    expect(humanizePortName("powerplant")).toBe("Powerplant");
  });

  it("handles empty / null", () => {
    expect(humanizePortName("")).toBe("");
    expect(humanizePortName(null)).toBe("");
    expect(humanizePortName(undefined)).toBe("");
  });
});
