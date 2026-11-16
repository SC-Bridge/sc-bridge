import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders } from "./helpers";
import { createRsiAccount } from "../src/lib/rsi-accounts";

describe("POST /api/orgs/:slug/ops/:opId/rate/:userId — RSI identity gate", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  async function setupOp() {
    const rater = await createTestUser(env.DB);
    const ratee = await createTestUser(env.DB);
    const orgId = crypto.randomUUID();
    const slug = `zzrate-${orgId.slice(0, 8)}`;
    await env.DB
      .prepare(`INSERT INTO "organization" (id, name, slug, createdAt) VALUES (?, 'Zzrate Org', ?, ?)`)
      .bind(orgId, slug, new Date().toISOString())
      .run();
    for (const u of [rater, ratee]) {
      await env.DB
        .prepare(`INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, 'member', ?)`)
        .bind(crypto.randomUUID(), orgId, u.userId, new Date().toISOString())
        .run();
    }
    await env.DB.prepare("INSERT OR IGNORE INTO op_types (key, label) VALUES ('zzrate', 'Zzrate')").run();
    const opType = await env.DB.prepare("SELECT id FROM op_types WHERE key = 'zzrate'").first<{ id: number }>();
    const op = await env.DB
      .prepare("INSERT INTO org_ops (org_id, name, op_type_id, status, created_by) VALUES (?, 'Op', ?, 'completed', ?) RETURNING id")
      .bind(orgId, opType!.id, rater.userId)
      .first<{ id: number }>();
    for (const u of [rater, ratee]) {
      await env.DB
        .prepare("INSERT INTO org_op_participants (org_op_id, user_id) VALUES (?, ?)")
        .bind(op!.id, u.userId)
        .run();
    }
    return { rater, ratee, slug, opId: op!.id };
  }

  async function rate(ctx: Awaited<ReturnType<typeof setupOp>>) {
    const res = await SELF.fetch(`http://localhost/api/orgs/${ctx.slug}/ops/${ctx.opId}/rate/${ctx.ratee.userId}`, {
      method: "POST",
      headers: { ...(await authHeaders(ctx.rater.sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ ratings: [{ category: "reliability", score: 5 }] }),
    });
    return { status: res.status, error: ((await res.json()) as { error?: string }).error };
  }

  it("rejects a rater with no verified RSI account", async () => {
    const ctx = await setupOp();
    const out = await rate(ctx);
    expect(out.status).toBe(403);
    expect(out.error).toBe("You must verify your RSI identity before rating");
  });

  it("passes the identity gate for a rater whose RSI account exists but who has no user_rsi_profiles row", async () => {
    const ctx = await setupOp();
    await createRsiAccount(env.DB, ctx.rater.userId, { handle: "Rater", referralCode: null, placeholder: false });
    const profile = await env.DB
      .prepare("SELECT 1 FROM user_rsi_profiles WHERE user_id = ?")
      .bind(ctx.rater.userId)
      .first();
    expect(profile).toBeNull();

    // A brand-new test user is under 7 days old, so the next gate is the one that answers.
    const out = await rate(ctx);
    expect(out.status).toBe(403);
    expect(out.error).toBe("Account must be at least 7 days old to submit ratings");
  });

  it("does not accept a placeholder account as verification", async () => {
    const ctx = await setupOp();
    await createRsiAccount(env.DB, ctx.rater.userId, { handle: null, referralCode: null, placeholder: true });
    const out = await rate(ctx);
    expect(out.error).toBe("You must verify your RSI identity before rating");
  });
});
