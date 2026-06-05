import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { setupTestDatabase } from "./apply-migrations";
import { getLootByUuid } from "../src/db/queries";

// Refuelling-nozzle deep stats (Phase B.1). The sold nozzles (Norfield/Harkin/
// RN-7s) get a loot_map row from the UEX backfill with vehicle_component_id=NULL
// and category='ship_component', so getLootByUuid resolves their stats via the
// UUID-fallback branch (match vehicle_components.uuid). This test proves the
// component_fuel_nozzles join surfaces hydrogen_flow_rate / quantum_flow_rate /
// max_integrity through that path.
describe("getLootByUuid — refuelling nozzle stats", () => {
  const NOZZLE_UUID = "b46eae55-2ed3-4008-9635-8fe26a1a3a4c"; // Norfield

  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    // vehicle_components row — Type=DockingCollar, integrity in base hp
    const ins = await env.DB
      .prepare(
        `INSERT INTO vehicle_components (uuid, name, class_name, type, sub_type, size, grade, hp, game_version_id)
         VALUES (?, 'Norfield', 'nozzle_fuelgiver_grin_nozzlefast', 'DockingCollar', 'UNDEFINED', 2, 'A', 7140, 1)
         RETURNING id`,
      )
      .bind(NOZZLE_UUID)
      .first<{ id: number }>();
    const componentId = ins!.id;
    // sub-table stats, keyed by the real component id
    await env.DB
      .prepare(
        `INSERT INTO component_fuel_nozzles (component_id, game_version_id, hydrogen_flow_rate, quantum_flow_rate, max_integrity)
         VALUES (?, 1, 1.45, 0.8, 7140)`,
      )
      .bind(componentId)
      .run();
    // loot_map row as the UEX backfill creates it: ship_component, no FK
    await env.DB
      .prepare(
        `INSERT INTO loot_map (uuid, name, category, vehicle_component_id, data_source, game_version_id)
         VALUES (?, 'Norfield', 'ship_component', NULL, 'terminal_inventory_backfill', 1)`,
      )
      .bind(NOZZLE_UUID)
      .run();
  });

  it("surfaces nozzle flow rates + integrity via the UUID-fallback branch", async () => {
    const row = await getLootByUuid(env.DB, NOZZLE_UUID);
    expect(row).not.toBeNull();
    expect(row!.name).toBe("Norfield");
    const det = row!.item_details as Record<string, unknown>;
    expect(det.type).toBe("DockingCollar");
    expect(det.hydrogen_flow_rate).toBe(1.45);
    expect(det.quantum_flow_rate).toBe(0.8);
    expect(det.max_integrity).toBe(7140);
  });

  it("returns nozzle stats from the FK branch when vehicle_component_id is linked", async () => {
    // Link the loot_map row to the component (as a full load would), then the
    // primary vehicle_component_id branch must also carry the nozzle stats.
    await env.DB
      .prepare(
        `UPDATE loot_map SET vehicle_component_id = (SELECT id FROM vehicle_components WHERE uuid = ?) WHERE uuid = ?`,
      )
      .bind(NOZZLE_UUID, NOZZLE_UUID)
      .run();
    const row = await getLootByUuid(env.DB, NOZZLE_UUID);
    const det = row!.item_details as Record<string, unknown>;
    expect(det.hydrogen_flow_rate).toBe(1.45);
    expect(det.quantum_flow_rate).toBe(0.8);
    expect(det.max_integrity).toBe(7140);
  });
});
