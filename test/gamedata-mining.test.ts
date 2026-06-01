import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase, TEST_GAME_VERSION_ID } from "./apply-migrations";

describe("GET /api/gamedata/mining - new tables", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);

    // Seed one composition + one rock entity + one global params row.
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO rock_compositions (uuid, name, rock_type, composition_json, deposit_name, game_version_id)
         VALUES ('comp-1', 'Asteroid_CType_Tin', 'asteroid_ctype', '[]', 'Asteroid (C-Type)', ?)`
      ).bind(TEST_GAME_VERSION_ID),
      env.DB.prepare(
        `INSERT INTO mineable_rock_entities
         (uuid, class_name, composition_uuid, rock_category, laser_damage_full_value,
          damage_strength_power_curve, filled_factor, game_version_id)
         VALUES ('rock-1', 'asteroidctypemineablerock_tin', 'comp-1', 'ship_asteroid', 2500.0, 0.2, 1.0, ?)`
      ).bind(TEST_GAME_VERSION_ID),
      env.DB.prepare(
        `INSERT INTO mining_global_params
         (scope, power_capacity_per_mass, optimal_window_size, optimal_window_factor,
          resistance_curve_factor, instability_wave_period, instability_curve_factor, game_version_id)
         VALUES ('ship', 10.0, 0.1, 0.75, 0.6, 3.0, 1.0, ?)`
      ).bind(TEST_GAME_VERSION_ID),
    ]);
  });

  it("returns rock_entities array with the new columns", async () => {
    const res = await SELF.fetch("http://localhost/api/gamedata/mining");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      rock_entities?: Array<Record<string, unknown>>;
      global_params?: Array<Record<string, unknown>>;
      compositions?: Array<Record<string, unknown>>;
    };

    expect(body.rock_entities).toBeDefined();
    const tinRock = body.rock_entities!.find(r => r.class_name === "asteroidctypemineablerock_tin");
    expect(tinRock).toBeDefined();
    expect(tinRock!.laser_damage_full_value).toBe(2500);
    expect(tinRock!.composition_uuid).toBe("comp-1");
  });

  it("returns global_params keyed by scope", async () => {
    const res = await SELF.fetch("http://localhost/api/gamedata/mining");
    const body = (await res.json()) as { global_params?: Array<Record<string, unknown>> };

    const shipParams = body.global_params!.find(g => g.scope === "ship");
    expect(shipParams).toBeDefined();
    expect(shipParams!.optimal_window_size).toBe(0.1);
    expect(shipParams!.resistance_curve_factor).toBe(0.6);
  });

  it("compositions include the deposit_name column", async () => {
    const res = await SELF.fetch("http://localhost/api/gamedata/mining");
    const body = (await res.json()) as { compositions?: Array<Record<string, unknown>> };

    const tinComp = body.compositions!.find(c => c.uuid === "comp-1");
    expect(tinComp!.deposit_name).toBe("Asteroid (C-Type)");
  });
});
