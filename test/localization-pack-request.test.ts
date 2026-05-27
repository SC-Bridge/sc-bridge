import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders } from "./helpers";

/**
 * POST /api/localization/pack-request — a logged-in user submits a link to a
 * community pack they'd like added. Records the request (no user_id stored)
 * and best-effort notifies Discord; the notification is skipped cleanly when
 * no webhook is configured (as in tests).
 */
describe("POST /api/localization/pack-request", () => {
  let sessionToken: string;

  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    const user = await createTestUser(env.DB);
    sessionToken = user.sessionToken;
  });

  it("requires authentication", async () => {
    const res = await SELF.fetch("http://localhost/api/localization/pack-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/pack" }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects a non-URL", async () => {
    const res = await SELF.fetch("http://localhost/api/localization/pack-request", {
      method: "POST",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ url: "not a url" }),
    });
    expect(res.status).toBe(400);
  });

  it("records a request (no webhook configured → still succeeds)", async () => {
    const res = await SELF.fetch("http://localhost/api/localization/pack-request", {
      method: "POST",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://github.com/MrKraken/StarStrings", note: "blueprint pools" }),
    });
    expect(res.status).toBe(200);

    const row = await env.DB.prepare(
      "SELECT url, note, status FROM pack_requests WHERE url = ?",
    )
      .bind("https://github.com/MrKraken/StarStrings")
      .first<{ url: string; note: string; status: string }>();
    expect(row).toBeTruthy();
    expect(row!.note).toBe("blueprint pools");
    expect(row!.status).toBe("new");
  });

  it("rate-limits a user after the hourly cap (429)", async () => {
    const headers = { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" };
    const submit = (n: number) =>
      SELF.fetch("http://localhost/api/localization/pack-request", {
        method: "POST",
        headers,
        body: JSON.stringify({ url: `https://example.com/p${n}` }),
      });
    // First 10 succeed; the 11th is blocked.
    for (let i = 0; i < 10; i++) {
      const ok = await submit(i);
      expect(ok.status).toBe(200);
    }
    const blocked = await submit(99);
    expect(blocked.status).toBe(429);
  });
});
