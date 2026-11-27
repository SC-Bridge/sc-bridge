import { describe, it, expect, beforeAll } from "vitest";
import { env, SELF } from "cloudflare:test";
import { setupTestDatabase, TEST_GAME_VERSION_ID } from "./apply-migrations";

// /api/components/:type attaches each component's render (plan S2, render-surfaces.md).
describe("GET /api/components/:type renders", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO vehicle_components (uuid, name, slug, class_name, type, size, grade, game_version_id)
         VALUES ('cmp-shield-r', 'Rendered Shield', 'rendered-shield', 'SHLD_TEST_S1_Rendered', 'Shield', 1, 'A', ?),
                ('cmp-shield-n', 'Plain Shield', 'plain-shield', 'shld_test_s1_plain', 'Shield', 1, 'B', ?)`,
      ).bind(TEST_GAME_VERSION_ID, TEST_GAME_VERSION_ID),
      env.DB.prepare(
        `INSERT INTO item_renders (kind, item_key, variant, view, hash, width, height, source_version)
         VALUES ('vehicle_component', 'shld_test_s1_rendered', '', 'iso', 'aaaabbbbccccdddd', 2048, 1400, '4.10.3-live')`,
      ),
    ]);
  });

  it("returns render, kind and key for a component with a render, and null for one without", async () => {
    const res = await SELF.fetch("http://localhost/api/components/shield");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { components: Array<Record<string, unknown>> };
    const rendered = body.components.find((c) => c.uuid === "cmp-shield-r")!;
    const plain = body.components.find((c) => c.uuid === "cmp-shield-n")!;

    expect(rendered.render).toEqual({ hash: "aaaabbbbccccdddd", width: 2048, height: 1400, view: "iso" });
    expect(rendered.render_variants_kind).toBe("vehicle_component");
    expect(rendered.render_item_key).toBe("shld_test_s1_rendered");
    expect(rendered).not.toHaveProperty("render_hash");

    expect(plain.render).toBeNull();
  });
});
