import { describe, it, expect } from "vitest";
import { classifyEntry } from "../src/lib/accountant/categorize";

describe("accountant auto-categorizer", () => {
  it("classifies ship_purchase as assets", () => {
    expect(classifyEntry("ship_purchase", undefined)).toEqual({ category: "assets", tag: null });
  });

  it("classifies repair as running_cost / ship_consumables", () => {
    expect(classifyEntry("repair", undefined)).toEqual({ category: "running_cost", tag: "ship_consumables" });
  });

  it("classifies fuel on a standard ship as running_cost / ship_consumables", () => {
    expect(classifyEntry("fuel", "Avenger Titan")).toEqual({ category: "running_cost", tag: "ship_consumables" });
  });

  it("classifies fuel with no ship name as running_cost / ship_consumables", () => {
    expect(classifyEntry("fuel", undefined)).toEqual({ category: "running_cost", tag: "ship_consumables" });
  });

  it("routes fuel on a fuel hauler to the sorting list (null category)", () => {
    expect(classifyEntry("fuel", "Starfarer Gemini")).toEqual({ category: null, tag: null });
  });

  it("routes fuel on an all-uppercase hauler name to the sorting list", () => {
    expect(classifyEntry("fuel", "STARFARER GEMINI")).toEqual({ category: null, tag: null });
  });

  it("routes fuel on capital ships with refuel bays to the sorting list", () => {
    expect(classifyEntry("fuel", "Idris-P")).toEqual({ category: null, tag: null });
    expect(classifyEntry("fuel", "kraken")).toEqual({ category: null, tag: null });
    expect(classifyEntry("fuel", "CNOU Pioneer")).toEqual({ category: null, tag: null });
  });

  it("routes unknown hints to the sorting list", () => {
    expect(classifyEntry("mystery_event", undefined)).toEqual({ category: null, tag: null });
  });

  it("routes missing hint to the sorting list", () => {
    expect(classifyEntry(undefined, undefined)).toEqual({ category: null, tag: null });
  });
});
