import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";

const INSERT_SQL =
  "INSERT INTO item_renders (kind, item_key, variant, view, hash, width, height, source_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";

function insertRender(variant: string) {
  return env.DB
    .prepare(INSERT_SQL)
    .bind("vehicle", "aegs_gladius", variant, "iso", "3fa9c01e7d22b410", 2048, 1536, "4.10.3-live")
    .run();
}

describe("item_renders", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  it("accepts one row per (kind,item_key,variant,view)", async () => {
    await insertRender("");
    await expect(insertRender("")).rejects.toThrow(/UNIQUE/i);
    await expect(insertRender("paint_gladius_valiant")).resolves.toBeDefined();
  });

  it("has the variant and item_key lookup indexes", async () => {
    const rows = await env.DB
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='item_renders'")
      .all<{ name: string }>();
    const names = rows.results.map((r) => r.name);
    expect(names).toContain("idx_item_renders_variant");
    expect(names).toContain("idx_item_renders_item_key");
  });
});
