import { describe, it, expect } from "vitest";
import { cargoBackfillValue } from "../src/sync/rsi";

/**
 * Ship-matrix sync — cargo backfill.
 *
 * vehicles.cargo comes from the game files. A hull the pipeline found no
 * cargo grid for keeps NULL (the site shows a dash), and modular hulls get
 * their cargo from the fitted module. The nightly sync used to fill every
 * NULL from RSI's ship matrix, so each night after a load it wrote 102 onto
 * the Retaliator (a modular hull), 32 onto the Golem, 2 onto the F7C Hornet
 * Mk I and 0 onto every other grid-less hull. The matrix figure is only wanted
 * for RSI-only concept ships: rows with no game record, i.e. a NULL uuid.
 */
describe("cargoBackfillValue", () => {
  it("fills a concept ship (no game record) that has no cargo yet", () => {
    expect(cargoBackfillValue({ uuid: null, cargo: null }, { cargocapacity: 576 })).toBe(576);
  });

  it("accepts 0 for a concept ship", () => {
    expect(cargoBackfillValue({ uuid: null, cargo: null }, { cargocapacity: 0 })).toBe(0);
  });

  it("never fills a ship that has a game record, whatever the matrix says", () => {
    const retaliator = { uuid: "a7c0b2f0-retaliator", cargo: null };
    expect(cargoBackfillValue(retaliator, { cargocapacity: 102 })).toBeNull();
    expect(cargoBackfillValue(retaliator, { cargocapacity: 0 })).toBeNull();
  });

  it("never overwrites a value that is already there", () => {
    expect(cargoBackfillValue({ uuid: null, cargo: 500 }, { cargocapacity: 576 })).toBeNull();
    expect(cargoBackfillValue({ uuid: "x", cargo: 96 }, { cargocapacity: 102 })).toBeNull();
    expect(cargoBackfillValue({ uuid: null, cargo: 0 }, { cargocapacity: 12 })).toBeNull();
  });

  it("ignores a matrix row with no usable cargo figure", () => {
    expect(cargoBackfillValue({ uuid: null, cargo: null }, { cargocapacity: null })).toBeNull();
  });
});
