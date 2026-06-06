import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { setupTestDatabase } from "./apply-migrations";
import { getLootByUuid } from "../src/db/queries";

// Ship bombs (Colossus/Stormburst/Thunderball) live in ship_missiles, but their
// UEX-backfill loot_map rows are category='ship_weapon' with ship_missile_id=NULL,
// so they resolve via the ship_missiles UUID-fallback in getLootByUuid.
describe("getLootByUuid — ship bomb stats via ship_missiles fallback", () => {
  const COLOSSUS = "2b8a744d-c0a0-4f92-b0e6-bf4ae077cc11";

  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO ship_missiles (uuid, name, type, sub_type, size, grade, missile_type, damage, damage_type, blast_radius, ammo_count, game_version_id)
         VALUES (?, 'Colossus Bomb', 'Bomb', 'Bomb', 10, 'A', 'Bomb', 568296.99, 'Physical, Energy', 250, 1, 1)`,
      ).bind(COLOSSUS),
      env.DB.prepare(
        `INSERT INTO loot_map (uuid, name, category, vehicle_component_id, ship_missile_id, data_source, game_version_id)
         VALUES (?, 'Colossus Bomb', 'ship_weapon', NULL, NULL, 'terminal_inventory_backfill', 1)`,
      ).bind(COLOSSUS),
    ]);
  });

  it("surfaces blast radius + damage for a ship_weapon bomb not in vehicle_components", async () => {
    const row = await getLootByUuid(env.DB, COLOSSUS);
    expect(row).not.toBeNull();
    expect(row!.name).toBe("Colossus Bomb");
    const det = row!.item_details as Record<string, unknown>;
    expect(det.blast_radius).toBe(250);
    expect(det.damage).toBe(568296.99);
    expect(det.damage_type).toBe("Physical, Energy");
  });
});
