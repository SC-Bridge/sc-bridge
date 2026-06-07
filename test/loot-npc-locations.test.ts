import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { setupTestDatabase, TEST_GAME_VERSION_ID } from "./apply-migrations";
import { seedLootItem } from "./helpers";
import { getLootByUuid } from "../src/db/queries";

/**
 * NPC "Where to find" quality. The loot_item_locations junction holds noisy NPC
 * rows: UUID faction fallbacks, the item's own mag/attachment loadout
 * containers, and faction-less loadouts. getLootByUuid must prefer the clean
 * class_name → npc_loadout_items enrichment, and only fall back to the
 * faction-RESOLVED junction rows when enrichment finds nothing.
 */
describe("getLootByUuid — NPC location quality", () => {
  let factionId: number;
  const LOADOUT_UUID = "11111111-2222-4333-8444-555555555555";

  beforeAll(async () => {
    await setupTestDatabase(env.DB);

    factionId = (await env.DB
      .prepare(
        `INSERT INTO npc_factions (code, name, slug, key)
         VALUES ('dusters', 'Dusters', 'dusters', 'dusters') RETURNING id`,
      )
      .first<{ id: number }>())!.id;

    await env.DB
      .prepare(
        `INSERT INTO npc_loadouts (loadout_name, faction_id, uuid, file_path, category, game_version_id)
         VALUES ('SLoadoutAssortment.Dusters_Grunt_Light_01', ?, ?, 'test/dusters_grunt_light_01.xml', 'enemy', ?)`,
      )
      .bind(factionId, LOADOUT_UUID, TEST_GAME_VERSION_ID)
      .run();
  });

  it("uses class_name enrichment and drops junk junction NPC rows", async () => {
    const item = await seedLootItem(env.DB, { name: "Enriched LMG" });
    await env.DB.prepare("UPDATE loot_map SET class_name = 'enriched_lmg_01' WHERE id = ?")
      .bind(item.id).run();

    // Clean Source B enrichment: this loadout carries the item.
    const loadoutId = (await env.DB
      .prepare("SELECT id FROM npc_loadouts WHERE uuid = ?").bind(LOADOUT_UUID)
      .first<{ id: number }>())!.id;
    await env.DB.prepare(
      `INSERT INTO npc_loadout_items (loadout_id, item_name, port_name, game_version_id)
       VALUES (?, 'enriched_lmg_01', 'wep_main', ?)`,
    ).bind(loadoutId, TEST_GAME_VERSION_ID).run();

    // Junk junction rows that must NOT surface.
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO loot_item_locations (loot_map_id, game_version_id, source_type, location_key, actor, faction, slot)
         VALUES (?, ?, 'npc', 'aaaaaaaa-0000-4000-8000-000000000001', 'attachments', 'unknown', 'wep_stocked_3')`,
      ).bind(item.id, TEST_GAME_VERSION_ID),
      env.DB.prepare(
        `INSERT INTO loot_item_locations (loot_map_id, game_version_id, source_type, location_key, actor, faction, slot)
         VALUES (?, ?, 'npc', 'bbbbbbbb-0000-4000-8000-000000000002', 'EnrichedLmg01_Mags', 'unknown', 'wep_stocked_3')`,
      ).bind(item.id, TEST_GAME_VERSION_ID),
    ]);

    const row = await getLootByUuid(env.DB, item.uuid);
    const npcs = (row!.locations as Record<string, Record<string, unknown>[]>).npcs;

    // Every surfaced NPC resolves to a real faction (no UUID/unknown junk).
    expect(npcs.length).toBeGreaterThan(0);
    for (const n of npcs) {
      expect(n.faction_code).toBe("dusters");
      expect(String(n.location_key)).not.toMatch(/^[0-9a-f]{8}-/i); // not a UUID
    }
    // No junk actors leaked through.
    const actors = npcs.map((n) => String(n.actor));
    expect(actors).not.toContain("attachments");
    expect(actors).not.toContain("EnrichedLmg01_Mags");
  });

  it("falls back to faction-resolved junction rows when enrichment is empty", async () => {
    const item = await seedLootItem(env.DB, { name: "Orphan LMG" });
    await env.DB.prepare("UPDATE loot_map SET class_name = 'orphan_lmg_99' WHERE id = ?")
      .bind(item.id).run();
    // No npc_loadout_items for orphan_lmg_99 → Source B empty.

    await env.DB.batch([
      // Faction-resolved junction row (location_key matches the Dusters loadout uuid).
      env.DB.prepare(
        `INSERT INTO loot_item_locations (loot_map_id, game_version_id, source_type, location_key, actor, faction, slot)
         VALUES (?, ?, 'npc', ?, 'raw_actor', 'unknown', 'wep_stocked_3')`,
      ).bind(item.id, TEST_GAME_VERSION_ID, LOADOUT_UUID),
      // Junk row with an unresolvable UUID — must be dropped.
      env.DB.prepare(
        `INSERT INTO loot_item_locations (loot_map_id, game_version_id, source_type, location_key, actor, faction, slot)
         VALUES (?, ?, 'npc', 'cccccccc-0000-4000-8000-000000000003', 'attachments', 'unknown', 'wep_stocked_3')`,
      ).bind(item.id, TEST_GAME_VERSION_ID),
    ]);

    const row = await getLootByUuid(env.DB, item.uuid);
    const npcs = (row!.locations as Record<string, Record<string, unknown>[]>).npcs;

    expect(npcs.length).toBe(1);
    expect(npcs[0].faction_code).toBe("dusters");
    expect(npcs[0].actor).toBe("SLoadoutAssortment.Dusters_Grunt_Light_01");
  });
});
