import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";

describe("GET /api/changelog (#124)", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  it("returns published entries newest-first and hides unpublished", async () => {
    // Clear the migration seed so assertions are deterministic.
    await env.DB.prepare("DELETE FROM changelog_entries").run();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO changelog_entries (entry_date, title, category, is_published)
         VALUES ('2026-01-01', 'Older', 'feature', 1)`,
      ),
      env.DB.prepare(
        `INSERT INTO changelog_entries (entry_date, title, category, is_published)
         VALUES ('2026-02-01', 'Newer', 'fix', 1)`,
      ),
      env.DB.prepare(
        `INSERT INTO changelog_entries (entry_date, title, category, is_published)
         VALUES ('2026-03-01', 'Draft', 'feature', 0)`,
      ),
    ]);

    const res = await SELF.fetch("http://localhost/api/changelog");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ title: string; entry_date: string }>;

    const titles = body.map((e) => e.title);
    expect(titles).toContain("Newer");
    expect(titles).toContain("Older");
    expect(titles).not.toContain("Draft"); // unpublished hidden
    // Newest first.
    expect(titles.indexOf("Newer")).toBeLessThan(titles.indexOf("Older"));
  });

  it("is public — no auth required", async () => {
    const res = await SELF.fetch("http://localhost/api/changelog");
    expect(res.status).toBe(200);
  });
});
