import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { setupTestDatabase } from "./apply-migrations";
import { parseRewardItemNames, rankRewardSets } from "../src/lib/loot-sets";

/**
 * Armour set <-> contract links are derived from data: a contract's
 * reward_text lists the reward items by display name (as extracted from the
 * game files), each name is matched exactly against loot_map.name, and the
 * matched armour pieces are grouped into sets with the same
 * extractSetName/makeSetSlug logic the /loot/sets pages use. No hand-written
 * reward-text map is involved.
 *
 * Fixture rows mirror real production data (4.10.3-live, contracts rebuilt
 * from game files in tools PR #35).
 */

describe("parseRewardItemNames", () => {
  it("splits the comma-joined reward list into item names", () => {
    expect(
      parseRewardItemNames(
        "Geist Armor Arms Snow Camo, Geist Armor Core Snow Camo, Geist Backpack Snow Camo",
      ),
    ).toEqual([
      "Geist Armor Arms Snow Camo",
      "Geist Armor Core Snow Camo",
      "Geist Backpack Snow Camo",
    ]);
  });

  it("strips the quantity prefix from stacked rewards", () => {
    expect(
      parseRewardItemNames(
        'Zenith "Snow Camo" Laser Sniper Rifle, 20x Zenith Laser Sniper Rifle Battery (22 Cap)',
      ),
    ).toEqual([
      'Zenith "Snow Camo" Laser Sniper Rifle',
      "Zenith Laser Sniper Rifle Battery (22 Cap)",
    ]);
  });

  it("keeps thousands separators inside a currency reward intact", () => {
    expect(parseRewardItemNames("15,000 aUEC")).toEqual(["15,000 aUEC"]);
  });

  it("returns an empty list for missing reward text", () => {
    expect(parseRewardItemNames(null)).toEqual([]);
    expect(parseRewardItemNames(undefined)).toEqual([]);
    expect(parseRewardItemNames("")).toEqual([]);
  });
});

describe("rankRewardSets", () => {
  it("orders sets by how many rewarded pieces belong to them", () => {
    const bySlug = new Map([
      ["Corbel Helmet Crush", "corbel-crush"],
      ["Corbel Core Crush", "corbel-crush"],
      ["Novikov Backpack Crush", "novikov-crush"],
    ]);
    expect(
      rankRewardSets(
        ["Novikov Backpack Crush", "Corbel Helmet Crush", "Corbel Core Crush", "Unknown Thing"],
        bySlug,
      ),
    ).toEqual(["corbel-crush", "novikov-crush"]);
  });

  it("returns nothing when no rewarded item is an armour piece", () => {
    expect(rankRewardSets(["Wikelo Favor"], new Map())).toEqual([]);
  });
});

const LOOT_ROWS = [
  // Geist Armor Snow Camo (KAP) + its CDS backpack, rewarded by "Hide Snow Suit"
  ["a0000000-0000-0000-0000-000000000001", "Geist Armor Arms Snow Camo", "armour", "KAP"],
  ["a0000000-0000-0000-0000-000000000002", "Geist Armor Core Snow Camo", "armour", "KAP"],
  ["a0000000-0000-0000-0000-000000000003", "Geist Armor Helmet Snow Camo", "helmet", "KAP"],
  ["a0000000-0000-0000-0000-000000000004", "Geist Armor Legs Snow Camo", "armour", "KAP"],
  ["a0000000-0000-0000-0000-000000000005", "Geist Backpack Snow Camo", "armour", "CDS"],
  // Antium Midnight Sun, rewarded alongside a weapon and a ship by "Most Special Wolf"
  ["a0000000-0000-0000-0000-000000000006", "Antium Helmet Midnight Sun", "helmet", "QRT"],
  ["a0000000-0000-0000-0000-000000000007", "Antium Core Midnight Sun", "armour", "QRT"],
  // Weapon reward: not an armour set
  ["a0000000-0000-0000-0000-000000000008", 'Zenith "Snow Camo" Laser Sniper Rifle', "weapon", "VOLT"],
  // Armour that no contract awards
  ["a0000000-0000-0000-0000-000000000009", "Palatino Helmet Mark II", "helmet", "QRT"],
] as const;

const CONTRACT_ROWS = [
  [
    "wikelo_thecollector_ad_snowsuit",
    "Hide Snow Suit",
    "Geist Armor Arms Snow Camo, Geist Armor Core Snow Camo, Geist Armor Helmet Snow Camo, Geist Armor Legs Snow Camo, Geist Backpack Snow Camo",
    null,
    1,
  ],
  [
    "wikelo_thecollector_vehicle_small_kruger_wolf_unique",
    "Most Special Wolf",
    'Antium Helmet Midnight Sun, Antium Core Midnight Sun, Fresnel "Deepwater" Energy LMG, Kruger L-21 Wolf Wikelo War Special',
    null,
    1,
  ],
  [
    "wikelo_thecollector_ad_snowsnipe",
    "Snow Snipe",
    'Zenith "Snow Camo" Laser Sniper Rifle, 20x Zenith Laser Sniper Rifle Battery (22 Cap)',
    null,
    1,
  ],
  [
    "wikelo_thecollector_vehicle_small_fortune",
    "Fortune ship for you",
    "MISC Fortune Wikelo Special",
    "misc-fortune-collector-industrial",
    1,
  ],
  // Inactive contract awarding the same set must not appear
  [
    "wikelo_thecollector_ad_snowsuit_old",
    "Old Snow Suit",
    "Geist Armor Core Snow Camo",
    null,
    0,
  ],
] as const;

async function seed(lootTable: string, contractsTable: string) {
  await env.DB.batch([
    ...LOOT_ROWS.map(([uuid, name, category, mfr]) =>
      env.DB.prepare(
        `INSERT INTO ${lootTable} (uuid, name, category, manufacturer_name, game_version_id) VALUES (?, ?, ?, ?, 1)`,
      ).bind(uuid, name, category, mfr),
    ),
    ...CONTRACT_ROWS.map(([key, title, reward, vehicleSlug, active]) =>
      env.DB.prepare(
        `INSERT INTO ${contractsTable} (contract_key, giver, giver_slug, category, title, reward_text, reward_vehicle_slug, is_active, game_version_id)
         VALUES (?, 'Wikelo', 'wikelo', 'Standard', ?, ?, ?, ?, 1)`,
      ).bind(key, title, reward, vehicleSlug, active),
    ),
  ]);
}

type SetDetail = { awardingContracts: { id: number; title: string; giver_slug: string }[] };
type ContractRow = { title: string; reward_set_slug?: string; reward_set_slugs?: string[] };

describe("GET /api/loot/sets/:setSlug awardingContracts (data-derived)", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    await seed("loot_map", "contracts");
  });

  it("links a set to the active contract whose rewards include its pieces", async () => {
    const res = await SELF.fetch("http://localhost/api/loot/sets/geist-armor-snow-camo");
    expect(res.status).toBe(200);
    const body = (await res.json()) as SetDetail;
    expect(body.awardingContracts.map((c) => c.title)).toEqual(["Hide Snow Suit"]);
    expect(body.awardingContracts[0].giver_slug).toBe("wikelo");
  });

  it("links a set whose only rewarded piece is a backpack from another maker", async () => {
    const res = await SELF.fetch("http://localhost/api/loot/sets/geist-snow-camo");
    expect(res.status).toBe(200);
    const body = (await res.json()) as SetDetail;
    expect(body.awardingContracts.map((c) => c.title)).toEqual(["Hide Snow Suit"]);
  });

  it("links a set rewarded together with a weapon and a ship", async () => {
    const res = await SELF.fetch("http://localhost/api/loot/sets/antium-midnight-sun");
    expect(res.status).toBe(200);
    const body = (await res.json()) as SetDetail;
    expect(body.awardingContracts.map((c) => c.title)).toEqual(["Most Special Wolf"]);
  });

  it("returns no contracts for a set nothing awards", async () => {
    const res = await SELF.fetch("http://localhost/api/loot/sets/palatino-mark-ii");
    expect(res.status).toBe(200);
    const body = (await res.json()) as SetDetail;
    expect(body.awardingContracts).toEqual([]);
  });
});

describe("GET /api/contracts reward_set_slug (data-derived)", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    await seed("loot_map", "contracts");
  });

  async function fetchContracts(): Promise<Map<string, ContractRow>> {
    const res = await SELF.fetch("http://localhost/api/contracts?giver=wikelo");
    expect(res.status).toBe(200);
    const rows = (await res.json()) as ContractRow[];
    return new Map(rows.map((r) => [r.title, r]));
  }

  it("attaches the dominant set and every rewarded set to an armour contract", async () => {
    const row = (await fetchContracts()).get("Hide Snow Suit")!;
    expect(row.reward_set_slug).toBe("geist-armor-snow-camo");
    expect(row.reward_set_slugs).toEqual(["geist-armor-snow-camo", "geist-snow-camo"]);
  });

  it("finds the armour set inside a mixed reward", async () => {
    const row = (await fetchContracts()).get("Most Special Wolf")!;
    expect(row.reward_set_slug).toBe("antium-midnight-sun");
  });

  it("attaches no set to weapon or vehicle rewards", async () => {
    const rows = await fetchContracts();
    expect(rows.get("Snow Snipe")!.reward_set_slug).toBeUndefined();
    expect(rows.get("Fortune ship for you")!.reward_set_slug).toBeUndefined();
  });
});

describe("armour set contract links honour ?channel=PTU", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    await seed("ptu_loot_map", "ptu_contracts");
  });

  it("reads PTU contracts for a PTU set", async () => {
    const res = await SELF.fetch(
      "http://localhost/api/loot/sets/antium-midnight-sun?channel=PTU",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as SetDetail;
    expect(body.awardingContracts.map((c) => c.title)).toEqual(["Most Special Wolf"]);
  });
});
