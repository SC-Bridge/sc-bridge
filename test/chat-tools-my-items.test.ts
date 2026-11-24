import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { setupTestDatabase, TEST_GAME_VERSION_ID } from "./apply-migrations";
import { createTestUser } from "./helpers";
import { createRsiAccount } from "../src/lib/rsi-accounts";
import { executeChatTool } from "../src/lib/chat-tools";

let seq = 0;

async function run(userId: string, args: Record<string, unknown>, scopeIds: number[] | null = null) {
  return JSON.parse(
    await executeChatTool(env.DB, userId, { id: "c", name: "get_my_items", arguments: args }, scopeIds),
  ) as Record<string, any>;
}

async function account(userId: string): Promise<number> {
  seq++;
  return createRsiAccount(env.DB, userId, { handle: `mine${seq}`, referralCode: null, placeholder: false });
}

async function seedPledge(
  userId: string,
  accountId: number,
  opts: { name?: string; cents?: number; ccuFrom?: string; ccuTo?: string } = {},
): Promise<void> {
  seq++;
  await env.DB.prepare("INSERT INTO user_hangar_syncs (user_id, source) VALUES (?, 'extension')").bind(userId).run();
  const sync = await env.DB
    .prepare("SELECT id FROM user_hangar_syncs WHERE user_id = ? ORDER BY id DESC LIMIT 1")
    .bind(userId)
    .first<{ id: number }>();
  await env.DB
    .prepare(
      `INSERT INTO user_pledges (user_id, sync_id, rsi_pledge_id, name, value, value_cents, currency, is_upgraded,
         is_reclaimable, rsi_account_id, ccu_from_name, ccu_to_name)
       VALUES (?, ?, ?, ?, '$0', ?, 'Store Credit', 0, 1, ?, ?, ?)`,
    )
    .bind(userId, sync!.id, 70000 + seq, opts.name ?? `Pledge ${seq}`, opts.cents ?? 10000, accountId, opts.ccuFrom ?? null, opts.ccuTo ?? null)
    .run();
}

async function seedBuyback(userId: string, accountId: number, name: string): Promise<void> {
  seq++;
  await env.DB
    .prepare("INSERT INTO user_buyback_pledges (user_id, rsi_pledge_id, name, value_cents, rsi_account_id) VALUES (?, ?, ?, 4500, ?)")
    .bind(userId, 80000 + seq, name, accountId)
    .run();
}

async function seedCollection(userId: string, itemName: string): Promise<void> {
  seq++;
  const uuid = `mine-loot-${seq}-${crypto.randomUUID().slice(0, 6)}`;
  await env.DB
    .prepare("INSERT INTO loot_map (uuid, name, category, game_version_id) VALUES (?, ?, 'armour', ?)")
    .bind(uuid, itemName, TEST_GAME_VERSION_ID)
    .run();
  await env.DB.prepare("INSERT INTO user_loot_collection (user_id, loot_uuid, quantity) VALUES (?, ?, 2)").bind(userId, uuid).run();
}

describe("chat tools — get_my_items", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  it("never returns another user's rows", async () => {
    const a = await createTestUser(env.DB);
    const b = await createTestUser(env.DB);
    const acct = await account(a.userId);
    await seedPledge(a.userId, acct, { name: "A's Carrack" });
    await seedPledge(a.userId, acct, { name: "A's CCU", ccuFrom: "Cutlass Black", ccuTo: "Corsair" });
    await seedBuyback(a.userId, acct, "A's Buyback");
    await seedCollection(a.userId, "A's Helmet");
    for (const section of ["pledges", "ccus", "upgrade_history", "buyback", "paints", "collection", "wishlist", "blueprints", "builds", "cart"]) {
      const out = await run(b.userId, { section });
      expect(out.total, section).toBe(0);
      expect(out.items, section).toEqual([]);
    }
  });

  it("account scope narrows pledges", async () => {
    const { userId } = await createTestUser(env.DB);
    const one = await account(userId);
    const two = await account(userId);
    await seedPledge(userId, one, { name: "On account one" });
    await seedPledge(userId, two, { name: "On account two" });
    const all = await run(userId, { section: "pledges" });
    expect(all.total).toBe(2);
    const scoped = await run(userId, { section: "pledges" }, [one]);
    expect(scoped.items.map((p: { name: string }) => p.name)).toEqual(["On account one"]);
  });

  it("ccus lists from and to", async () => {
    const { userId } = await createTestUser(env.DB);
    const acct = await account(userId);
    await seedPledge(userId, acct, { name: "Plain pledge" });
    await seedPledge(userId, acct, { name: "Upgrade - Cutlass Black to Corsair", ccuFrom: "Cutlass Black", ccuTo: "Corsair" });
    const out = await run(userId, { section: "ccus" });
    expect(out.total).toBe(1);
    expect(out.items[0]).toMatchObject({ from: "Cutlass Black", to: "Corsair" });
  });

  it("value_usd is value_cents / 100", async () => {
    const { userId } = await createTestUser(env.DB);
    const acct = await account(userId);
    await seedPledge(userId, acct, { cents: 22050 });
    const out = await run(userId, { section: "pledges" });
    expect(out.items[0].value_usd).toBe(220.5);
  });

  it("collection returns item names and quantity", async () => {
    const { userId } = await createTestUser(env.DB);
    await seedCollection(userId, "Mine Helmet");
    const out = await run(userId, { section: "collection" });
    expect(out.items).toEqual([{ name: "Mine Helmet", category: "armour", quantity: 2 }]);
  });

  it("unknown section returns error listing sections", async () => {
    const { userId } = await createTestUser(env.DB);
    const out = await run(userId, { section: "bank_details" });
    expect(out.error).toContain("pledges");
    expect(out.error).toContain("buyback");
  });

  it("caps at 100 with total", async () => {
    const { userId } = await createTestUser(env.DB);
    const acct = await account(userId);
    for (let i = 0; i < 105; i++) await seedBuyback(userId, acct, `Buyback ${i}`);
    const out = await run(userId, { section: "buyback" });
    expect(out.items).toHaveLength(100);
    expect(out.total).toBe(105);
  });
});
