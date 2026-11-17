import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders } from "./helpers";
import { getOrCreatePrimaryAccountId } from "../src/lib/rsi-accounts";

describe("GET /api/account/paints", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  it("reports which RSI account owns each paint", async () => {
    const u = await createTestUser(env.DB);
    const a = await getOrCreatePrimaryAccountId(env.DB, u.userId);
    const alt = await env.DB
      .prepare("INSERT INTO user_rsi_accounts (user_id, label, is_primary, is_placeholder) VALUES (?, 'Alt', 0, 1)")
      .bind(u.userId)
      .run();
    const b = Number(alt.meta.last_row_id);
    const p1 = await env.DB
      .prepare("INSERT INTO paints (name, slug) VALUES ('Acct Paint 1', 'acct-paint-1') RETURNING id")
      .first<{ id: number }>();
    const p2 = await env.DB
      .prepare("INSERT INTO paints (name, slug) VALUES ('Acct Paint 2', 'acct-paint-2') RETURNING id")
      .first<{ id: number }>();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO user_paints (user_id, rsi_account_id, paint_id) VALUES (?, ?, ?)").bind(u.userId, a, p1!.id),
      env.DB.prepare("INSERT INTO user_paints (user_id, rsi_account_id, paint_id) VALUES (?, ?, ?)").bind(u.userId, b, p2!.id),
    ]);

    const res = await SELF.fetch("http://localhost/api/account/paints", { headers: await authHeaders(u.sessionToken) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      owned: number[];
      paints: { paint_id: number; rsi_account_id: number | null }[];
    };
    expect([...body.owned].sort()).toEqual([p1!.id, p2!.id].sort());
    expect(body.paints).toEqual(
      expect.arrayContaining([
        { paint_id: p1!.id, rsi_account_id: a },
        { paint_id: p2!.id, rsi_account_id: b },
      ]),
    );
  });
});
