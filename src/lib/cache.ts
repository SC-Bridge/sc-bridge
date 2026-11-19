const DEFAULT_TTL = 86400; // 24 hours

/** Sanitize a user-supplied value for use in cache keys. Strips colons to prevent namespace collision. */
export function cacheSlug(value: string): string {
  return value.replace(/:/g, "_");
}

/** Minimal context shape needed by cachedJson — accepts both HonoEnv and generic route contexts */
interface CacheableContext {
  env: { SC_BRIDGE_CACHE: KVNamespace; ENVIRONMENT?: string };
  executionCtx: { waitUntil(promise: Promise<unknown>): void };
  json(data: unknown, status?: number): Response;
}

/**
 * Read-through cache for JSON responses.
 *
 * - On cache HIT: returns KV value directly (no DB query)
 * - On cache MISS: calls dataFn(), writes result to KV, returns it
 * - Null/undefined results are NOT cached (for 404 handling)
 * - Adds X-Cache: HIT/MISS header for observability
 */
export async function cachedJson<T>(
  c: CacheableContext,
  cacheKey: string,
  dataFn: () => Promise<T>,
  options?: { ttl?: number; cacheControl?: string },
): Promise<Response> {
  const kv = c.env.SC_BRIDGE_CACHE;
  const ttl = options?.ttl ?? DEFAULT_TTL;
  const cacheControl = options?.cacheControl ?? "public, s-maxage=0, max-age=300";

  // Auto-namespace cache keys by active channel so LIVE and PTU never share
  // payloads. Resolved by channelMiddleware (sync read from context).
  // Defensive: c.get may not be wired in tests; default to "live" namespace.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channel = (typeof (c as any).get === "function"
    ? ((c as any).get("channel") as string | undefined)
    : undefined) ?? "LIVE";
  if (channel !== "LIVE") {
    cacheKey = `${channel.toLowerCase()}:${cacheKey}`;
  }

  // Skip cache when the KV binding isn't available (e.g. local `vite dev`
  // without SC_BRIDGE_CACHE bound) OR in the test environment (KV persists
  // across test files and caches stale empty results before data is seeded).
  // A read-through cache should degrade to direct DB reads, not crash.
  if (!kv || c.env.ENVIRONMENT === "test") {
    const data = await dataFn();
    if (data === null || data === undefined) {
      return c.json({ error: "Not found" }, 404);
    }
    const body = JSON.stringify(data);
    return new Response(body, {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Cache": "BYPASS" },
    });
  }

  // Attempt cache read
  const cached = await kv.get(cacheKey);
  if (cached !== null) {
    return new Response(cached, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": cacheControl,
        "X-Cache": "HIT",
      },
    });
  }

  // Cache miss — fetch from DB
  const data = await dataFn();

  // Don't cache null/undefined (let caller handle 404)
  if (data === null || data === undefined) {
    return c.json({ error: "Not found" }, 404);
  }

  const json = JSON.stringify(data);

  // Write to KV in background (don't block response)
  c.executionCtx.waitUntil(
    kv.put(cacheKey, json, { expirationTtl: ttl }).catch((err) => {
      console.error(`[cache] KV put failed for ${cacheKey}:`, err);
    }),
  );

  return new Response(json, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": cacheControl,
      "X-Cache": "MISS",
    },
  });
}

/**
 * KV operations one purgeByPrefix call may spend. A Worker invocation is capped
 * at 1,000 operations to external services, every KV list() and delete() costs
 * one (the binding has no bulk delete), and the cap is shared with anything
 * else the request does, so stay well under it.
 * https://developers.cloudflare.com/kv/platform/limits/
 */
export const KV_OPS_PER_PURGE_CALL = 900;

export interface PurgeResult {
  deleted: number;
  /** True once every matching key has been deleted. */
  complete: boolean;
  /** Pass back as `cursor` to continue an incomplete purge; null when complete. */
  cursor: string | null;
}

/**
 * Purge cached keys by prefix, spending at most `opBudget` KV operations.
 *
 * Each page is listed with a limit that leaves room to delete every key on it,
 * so the returned list cursor always points just past fully-deleted keys and a
 * later call (in a new request, with a fresh op budget) resumes from there.
 * A prefix with more keys than one budget covers returns complete: false.
 */
export async function purgeByPrefix(
  kv: KVNamespace,
  prefix?: string,
  opts: { cursor?: string; opBudget?: number } = {},
): Promise<PurgeResult> {
  const budget = opts.opBudget ?? KV_OPS_PER_PURGE_CALL;
  let deleted = 0;
  let opsUsed = 0;
  let cursor: string | undefined = opts.cursor || undefined;

  // A page costs 1 list + up to `limit` deletes, so it needs at least 2 ops.
  while (budget - opsUsed >= 2) {
    const listOpts: KVNamespaceListOptions = { limit: Math.min(1000, budget - opsUsed - 1) };
    if (prefix) listOpts.prefix = prefix;
    if (cursor) listOpts.cursor = cursor;

    const list = await kv.list(listOpts);
    opsUsed += 1;
    console.log(`[cache] purge list: ${list.keys.length} keys found (prefix=${prefix ?? "all"}, cursor=${!!cursor})`);

    // Filter out non-cache keys (localization data is persistent, not cache)
    const cacheKeys = list.keys.filter((key) => !key.name.startsWith("localization:"));
    if (cacheKeys.length > 0) {
      await Promise.all(cacheKeys.map((key) => kv.delete(key.name)));
      opsUsed += cacheKeys.length;
      deleted += cacheKeys.length;
    }

    if (list.list_complete) {
      console.log(`[cache] purge complete: ${deleted} keys deleted`);
      return { deleted, complete: true, cursor: null };
    }
    cursor = list.cursor;
  }

  console.warn(`[cache] purge paused at KV op budget: ${deleted} keys deleted, more remain (prefix=${prefix ?? "all"})`);
  return { deleted, complete: false, cursor: cursor ?? null };
}
