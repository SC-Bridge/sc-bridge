import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders } from "./helpers";

const FROM = "2026-06-01T00:00:00Z";
const TO = "2026-07-01T00:00:00Z";

async function seed(userId: string, amount: number, category: string | null, source = "manual", occurred_at = "2026-06-15T00:00:00Z") {
  await env.DB.prepare(
    `INSERT INTO accountant_entries (user_id, occurred_at, amount, category, source) VALUES (?, ?, ?, ?, ?)`,
  ).bind(userId, occurred_at, amount, category, source).run();
}
const io = async (t: string, qs = `from=${FROM}&to=${TO}`) =>
  SELF.fetch(`http://localhost/api/accountant/reports/investment-option?${qs}`, { headers: await authHeaders(t) });

describe("Accountant — GET /reports/investment-option", () => {
  beforeAll(async () => { await setupTestDatabase(env.DB); });

  it("returns the positive surplus when cash flow is positive", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    await seed(userId, 500000, "trading");
    await seed(userId, -80000, "running_cost");
    const body = (await (await io(sessionToken)).json()) as { surplus: number; cashFlowNet: number; positive: boolean };
    expect(body.cashFlowNet).toBe(420000);
    expect(body.surplus).toBe(420000);
    expect(body.positive).toBe(true);
  });

  it("is hidden (positive=false, surplus=0) when cash flow is neutral or negative", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    await seed(userId, 100000, "trading");
    await seed(userId, -150000, "running_cost");
    const body = (await (await io(sessionToken)).json()) as { surplus: number; positive: boolean };
    expect(body.positive).toBe(false);
    expect(body.surplus).toBe(0);
  });

  it("defaults to the current calendar month when from/to omitted", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const res = await io(sessionToken, "");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { from: string; to: string };
    expect(typeof body.from).toBe("string");
    expect(typeof body.to).toBe("string");
  });
});
