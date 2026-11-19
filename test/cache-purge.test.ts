import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders } from "./helpers";
import { purgeByPrefix, KV_OPS_PER_PURGE_CALL } from "../src/lib/cache";

/**
 * A Worker invocation may make at most 1,000 KV operations, and every list()
 * and every delete() counts as one (the binding has no bulk delete). This fake
 * enforces that cap, which miniflare does not, so an over-budget purge fails
 * here the way it fails in production.
 */
const WORKER_KV_OP_LIMIT = 1000;

function makeLimitedKv(keys: string[]) {
  const store = new Set(keys);
  let ops = 0;
  const charge = () => {
    ops += 1;
    if (ops > WORKER_KV_OP_LIMIT) throw new Error("Too many API requests by single Worker invocation");
  };
  const kv = {
    async list(opts: KVNamespaceListOptions = {}) {
      charge();
      const limit = opts.limit ?? 1000;
      const all = [...store].filter((k) => !opts.prefix || k.startsWith(opts.prefix)).sort();
      // Like real KV, the cursor marks a position in key order (after the
      // last key returned), so deleting earlier keys does not shift it.
      const after = opts.cursor ? all.filter((k) => k > opts.cursor!) : all;
      const page = after.slice(0, limit);
      const complete = page.length === after.length;
      return {
        keys: page.map((name) => ({ name })),
        list_complete: complete,
        cursor: complete ? undefined : page[page.length - 1],
      };
    },
    async delete(key: string) {
      charge();
      store.delete(key);
    },
  };
  return {
    kv: kv as unknown as KVNamespace,
    store,
    newInvocation: () => { ops = 0; },
    opsUsed: () => ops,
  };
}

const keyNames = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${prefix}${String(i).padStart(5, "0")}`);

describe("purgeByPrefix KV operation budget", () => {
  it("stays under the per-invocation KV op limit for a prefix with more than 1,000 keys", async () => {
    const fake = makeLimitedKv(keyNames("paints:", 2500));
    const result = await purgeByPrefix(fake.kv, "paints:");
    expect(fake.opsUsed()).toBeLessThanOrEqual(KV_OPS_PER_PURGE_CALL);
    expect(result.complete).toBe(false);
    expect(result.cursor).toBeTruthy();
    expect(result.deleted).toBeGreaterThan(0);
  });

  it("purges a large prefix completely when resumed with the returned cursor", async () => {
    const fake = makeLimitedKv([...keyNames("paints:", 2500), ...keyNames("ships:", 10)]);
    let cursor: string | undefined;
    let total = 0;
    let calls = 0;
    do {
      fake.newInvocation();
      const r = await purgeByPrefix(fake.kv, "paints:", { cursor });
      total += r.deleted;
      cursor = r.complete ? undefined : r.cursor ?? undefined;
      calls += 1;
      expect(calls).toBeLessThan(20);
    } while (cursor);
    expect(total).toBe(2500);
    expect([...fake.store].filter((k) => k.startsWith("paints:"))).toHaveLength(0);
    expect([...fake.store].filter((k) => k.startsWith("ships:"))).toHaveLength(10);
  });

  it("reports complete in one call for a small prefix", async () => {
    const fake = makeLimitedKv(keyNames("patches:", 5));
    const r = await purgeByPrefix(fake.kv, "patches:");
    expect(r).toEqual({ deleted: 5, complete: true, cursor: null });
  });

  it("never deletes localization keys", async () => {
    const fake = makeLimitedKv([...keyNames("localization:", 3), ...keyNames("gd:x", 3)]);
    const r = await purgeByPrefix(fake.kv);
    expect(r.deleted).toBe(3);
    expect([...fake.store].sort()).toEqual(keyNames("localization:", 3));
  });
});

describe("POST /api/admin/cache/purge", () => {
  let superToken: string;
  let adminToken: string;

  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    superToken = (await createTestUser(env.DB, { role: "super_admin" })).sessionToken;
    adminToken = (await createTestUser(env.DB, { role: "admin" })).sessionToken;
  });

  beforeEach(async () => {
    await Promise.all(keyNames("purgetest:", 1200).map((k) => env.SC_BRIDGE_CACHE.put(k, "x")));
  });

  const post = async (token: string, body: unknown) =>
    SELF.fetch("https://test.local/api/admin/cache/purge", {
      method: "POST",
      headers: { ...(await authHeaders(token)), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  it("purges more than 1,000 keys across cursor-resumed requests", async () => {
    let cursor: string | null = null;
    let total = 0;
    let calls = 0;
    let done = false;
    while (!done) {
      const res = await post(superToken, cursor ? { prefix: "purgetest:", cursor } : { prefix: "purgetest:" });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { deleted: number; complete: boolean; cursor: string | null };
      total += data.deleted;
      done = data.complete;
      cursor = data.cursor;
      calls += 1;
      expect(calls).toBeLessThan(10);
    }
    expect(calls).toBeGreaterThan(1);
    expect(total).toBe(1200);
    const left = await env.SC_BRIDGE_CACHE.list({ prefix: "purgetest:" });
    expect(left.keys).toHaveLength(0);
  });

  it("rejects an admin (non-super_admin) account with 403", async () => {
    const res = await post(adminToken, { prefix: "purgetest:" });
    expect(res.status).toBe(403);
  });
});
