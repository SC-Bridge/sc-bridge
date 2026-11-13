import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase, TEST_GAME_VERSION_ID } from "./apply-migrations";
import { seedVehicle } from "./helpers";

// Modular ships carry their cargo in a swappable module. The module read API
// must return each module's own cargo SCU so the UI can show
// hull + (equipped module - default module). A module with no cargo grid is
// null, not 0 — same convention as a hull with no grid.

const SLUG = "module-cargo-ship";

type ModuleRow = { class_name: string; cargo: number | null; is_default: number };

async function seedModules(db: D1Database) {
  const vehicleId = await seedVehicle(db, { slug: SLUG, name: "Module Cargo Ship" });
  const insert = (uuid: string, className: string, isDefault: number, cargo: number | null) =>
    db
      .prepare(
        `INSERT INTO vehicle_modules (uuid, vehicle_id, port_name, class_name, display_name, size, tags, is_default, has_loadout, cargo, game_version_id, data_source)
         VALUES (?, ?, 'hardpoint_module', ?, ?, 1, 'TestTag', ?, 1, ?, ?, 'p4k')`,
      )
      .bind(uuid, vehicleId, className, className, isDefault, cargo, TEST_GAME_VERSION_ID);
  await db.batch([
    insert("mc-base", "Test_Module_Base", 1, null),
    insert("mc-cargo", "Test_Module_Cargo", 0, 656),
    insert("mc-medical", "Test_Module_Medical", 0, 4),
  ]);
}

describe("Module read API — cargo per module", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    await seedModules(env.DB);
  });

  it("returns each module's cargo SCU", async () => {
    const res = await SELF.fetch(`http://localhost/api/loadout/${SLUG}/modules`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ModuleRow[];
    const byClass = Object.fromEntries(body.map((m) => [m.class_name, m.cargo]));
    expect(byClass).toEqual({
      Test_Module_Base: null,
      Test_Module_Cargo: 656,
      Test_Module_Medical: 4,
    });
  });

  it("the PTU shadow table has the cargo column too", async () => {
    const col = await env.DB
      .prepare("SELECT name FROM pragma_table_info('ptu_vehicle_modules') WHERE name = 'cargo'")
      .first<{ name: string }>();
    expect(col?.name).toBe("cargo");
  });
});
