import { describe, it, expect } from "vitest";
import { buildFleetPayload } from "../src/lib/fleet-payload";
import type { UserFleetEntry } from "../src/lib/types";

// One representative fleet entry with both spec + personal fields populated.
const ENTRY = {
  vehicle_name: "RSI Hermes",
  vehicle_slug: "rsi-hermes",
  focus: "Transporter",
  size_label: "medium",
  classification: "Medium Freight",
  cargo: 288,
  crew_min: 1,
  crew_max: 3,
  speed_scm: 210,
  pledge_price: 250,
  manufacturer_name: "Roberts Space Industries",
  insurance_label: "LTI",
  is_lifetime: 1,
  production_status: "flight_ready",
  warbond: 0,
  custom_name: "Quicksilver",
  pledge_cost: "$250.00 USD",
  pledge_date: "2025-01-01",
} as unknown as UserFleetEntry;

describe("buildFleetPayload", () => {
  it("always includes ship specs (cargo, focus, classification, name)", () => {
    const [row] = buildFleetPayload([ENTRY], { includePersonal: false });
    expect(row.vehicle_name).toBe("RSI Hermes");
    expect(row.cargo).toBe(288);
    expect(row.focus).toBe("Transporter");
    expect(row.classification).toBe("Medium Freight");
  });

  it("omits personal fields when includePersonal is false (Analysis mode)", () => {
    const [row] = buildFleetPayload([ENTRY], { includePersonal: false });
    expect(row).not.toHaveProperty("custom_name");
    expect(row).not.toHaveProperty("pledge_cost");
    expect(row).not.toHaveProperty("pledge_date");
  });

  it("includes personal fields when includePersonal is true (Chat mode)", () => {
    const [row] = buildFleetPayload([ENTRY], { includePersonal: true });
    expect(row.custom_name).toBe("Quicksilver");
    expect(row.pledge_cost).toBe("$250.00 USD");
    expect(row.pledge_date).toBe("2025-01-01");
    // specs still present
    expect(row.cargo).toBe(288);
  });
});
