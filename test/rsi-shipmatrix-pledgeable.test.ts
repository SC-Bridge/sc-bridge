import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { seedVehicle } from "./helpers";
import { applyPledgeableFlags, D1_MAX_BINDS } from "../src/sync/rsi";

/**
 * Ship-matrix sync — is_pledgeable flags.
 *
 * Regression for the nightly `production_status` failure ("D1_ERROR: too
 * many SQL variables", every night from 2026-04-21): the matched-id list
 * (~300 ids) was bound into ONE `id IN (?,?,...)` statement, over D1's
 * 100-parameter cap, and the whole final batch rolled back. The flags must
 * be applied in chunks of D1_MAX_BINDS while keeping the same semantics.
 */

const MATCHED = 130; // > D1_MAX_BINDS so the id list must be chunked

async function seedWithUuid(pledgeable: number, uuid: string | null): Promise<number> {
  const id = await seedVehicle(env.DB);
  await env.DB
    .prepare("UPDATE vehicles SET is_pledgeable = ?, uuid = ? WHERE id = ?")
    .bind(pledgeable, uuid, id)
    .run();
  return id;
}

describe("applyPledgeableFlags", () => {
  const matched: number[] = [];
  let unmatchedP4k: number[] = [];
  let unmatchedConcept: number;

  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    for (let i = 0; i < MATCHED; i++) {
      matched.push(await seedWithUuid(0, `uuid-matched-${i}`));
    }
    unmatchedP4k = [
      await seedWithUuid(1, "uuid-variant-a"),
      await seedWithUuid(1, "uuid-variant-b"),
    ];
    unmatchedConcept = await seedWithUuid(1, null);
    await applyPledgeableFlags(env.DB, matched);
  });

  it("caps each statement at D1's bind limit", () => {
    expect(D1_MAX_BINDS).toBe(100);
    expect(MATCHED).toBeGreaterThan(D1_MAX_BINDS);
  });

  it("flags every matched ship pledgeable, across chunks", async () => {
    const row = await env.DB
      .prepare(
        "SELECT COUNT(*) AS c FROM vehicles WHERE is_pledgeable = 1 AND uuid LIKE 'uuid-matched-%'",
      )
      .first<{ c: number }>();
    expect(row!.c).toBe(MATCHED);
  });

  it("resets unmatched p4k vehicles (uuid set) to not pledgeable", async () => {
    for (const id of unmatchedP4k) {
      const row = await env.DB
        .prepare("SELECT is_pledgeable FROM vehicles WHERE id = ?")
        .bind(id)
        .first<{ is_pledgeable: number }>();
      expect(row!.is_pledgeable).toBe(0);
    }
  });

  it("leaves unmatched NULL-uuid concept ships alone", async () => {
    const row = await env.DB
      .prepare("SELECT is_pledgeable FROM vehicles WHERE id = ?")
      .bind(unmatchedConcept)
      .first<{ is_pledgeable: number }>();
    expect(row!.is_pledgeable).toBe(1);
  });

  it("is a no-op with nothing matched", async () => {
    await applyPledgeableFlags(env.DB, []);
    const row = await env.DB
      .prepare("SELECT is_pledgeable FROM vehicles WHERE id = ?")
      .bind(matched[0])
      .first<{ is_pledgeable: number }>();
    expect(row!.is_pledgeable).toBe(1);
  });
});
