import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders } from "./helpers";

const FROM = "2026-06-01T00:00:00Z";
const TO = "2026-06-08T00:00:00Z"; // 7 days → daily default

async function seed(userId: string, amount: number, category: string | null, occurred_at: string, source = "manual") {
  await env.DB.prepare(
    `INSERT INTO accountant_entries (user_id, occurred_at, amount, category, source) VALUES (?, ?, ?, ?, ?)`,
  ).bind(userId, occurred_at, amount, category, source).run();
}

const auth = (t: string) => authHeaders(t);

describe("Accountant — net-worth + cash-flow series", () => {
  beforeAll(async () => { await setupTestDatabase(env.DB); });

  it("cash-flow buckets in/out/net per daily interval", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    await seed(userId, 100000, "trading", "2026-06-01T06:00:00Z");
    await seed(userId, -30000, "running_cost", "2026-06-01T08:00:00Z");
    await seed(userId, 50000, "trading", "2026-06-03T06:00:00Z");
    await seed(userId, 5000, null, "2026-06-03T07:00:00Z", "adjustment"); // EXCLUDED from cash flow
    const res = await SELF.fetch(`http://localhost/api/accountant/reports/cash-flow?from=${FROM}&to=${TO}`, { headers: await auth(sessionToken) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { interval: string; series: Array<{ bucket: string; in: number; out: number; net: number }> };
    expect(body.interval).toBe("daily");
    const d1 = body.series.find((b) => b.bucket.startsWith("2026-06-01"));
    expect(d1?.in).toBe(100000);
    expect(d1?.out).toBe(-30000);
    expect(d1?.net).toBe(70000);
    const d3 = body.series.find((b) => b.bucket.startsWith("2026-06-03"));
    expect(d3?.net).toBe(50000); // adjustment excluded
  });

  it("net-worth series is cumulative equity at each interval boundary", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    await seed(userId, 100000, "trading", "2026-06-01T06:00:00Z");
    await seed(userId, 50000, "trading", "2026-06-03T06:00:00Z");
    const res = await SELF.fetch(`http://localhost/api/accountant/reports/net-worth?from=${FROM}&to=${TO}`, { headers: await auth(sessionToken) });
    const body = (await res.json()) as { series: Array<{ bucket: string; equity: number }> };
    // last bucket equity reflects the full cumulative total
    expect(body.series[body.series.length - 1].equity).toBe(150000);
    // a bucket before 06-03 must not yet include the second entry
    const early = body.series.find((b) => b.bucket.startsWith("2026-06-02"));
    if (early) expect(early.equity).toBe(100000);
  });

  it("honors an explicit ?interval=weekly", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const res = await SELF.fetch(`http://localhost/api/accountant/reports/cash-flow?from=${FROM}&to=${TO}&interval=weekly`, { headers: await auth(sessionToken) });
    expect(((await res.json()) as { interval: string }).interval).toBe("weekly");
  });

  it("rejects an invalid interval with 400", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const res = await SELF.fetch(`http://localhost/api/accountant/reports/cash-flow?from=${FROM}&to=${TO}&interval=yearly`, { headers: await auth(sessionToken) });
    expect(res.status).toBe(400);
  });
});
