import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { seedVehicle } from "./helpers";
import { matchPreviewPath, previewFromPayload, renderLinkPreviewShell } from "../src/lib/linkPreview";

/**
 * Link previews (render-surfaces S11).
 *
 * Discord, Slack and other unfurlers never run the SPA, so the worker puts
 * og:title, og:description and og:image (the item's 512 render) into the
 * HTML shell for ship, paint, loot item and armour set pages.
 */

const SHELL =
  `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" />` +
  `<title>SC Bridge — Star Citizen Companion</title></head>` +
  `<body><div id="root"></div></body></html>`;

const shell = () => new Response(SHELL, { headers: { "Content-Type": "text/html" } });
const RENDER = { hash: "abcdef0123456789", width: 2010, height: 1112, view: "iso" };

describe("matchPreviewPath", () => {
  it("maps each item page to the API that describes it", () => {
    expect(matchPreviewPath("/ships/anvl-carrack")).toEqual({ kind: "ship", api: "/api/ships/anvl-carrack" });
    expect(matchPreviewPath("/paints/paint-100i-blue-gold")).toEqual({ kind: "paint", api: "/api/paints/paint-100i-blue-gold" });
    expect(matchPreviewPath("/loot/sets/geist-armor")).toEqual({ kind: "set", api: "/api/loot/sets/geist-armor" });
    expect(matchPreviewPath("/loot/ff40b10e-b358-4e20-8036-780d9c11984e")).toEqual({ kind: "loot", api: "/api/loot/ff40b10e-b358-4e20-8036-780d9c11984e" });
    expect(matchPreviewPath("/loot/ff40b10e-b358-4e20-8036-780d9c11984e/detail")).toEqual({ kind: "loot", api: "/api/loot/ff40b10e-b358-4e20-8036-780d9c11984e" });
  });

  it("ignores list pages and anything else", () => {
    expect(matchPreviewPath("/")).toBeNull();
    expect(matchPreviewPath("/ships")).toBeNull();
    expect(matchPreviewPath("/paints/")).toBeNull();
    expect(matchPreviewPath("/loot")).toBeNull();
    expect(matchPreviewPath("/loot/sets")).toBeNull();
    expect(matchPreviewPath("/ships/a/b")).toBeNull();
    expect(matchPreviewPath("/ships/bad%20slug")).toBeNull();
  });
});

describe("previewFromPayload", () => {
  it("uses the ship's prose description and its 512 render", () => {
    const p = previewFromPayload("ship", {
      name: "Anvil Carrack",
      description: "Manufacturer: Anvil Aerospace\r\nFocus: Expedition\r\n\r\nAdventure calls and Anvil answers.",
      render: RENDER,
    });
    expect(p).toEqual({
      title: "Anvil Carrack — SC Bridge",
      description: "Adventure calls and Anvil answers.",
      image: "https://renders.scbridge.app/abcdef0123456789/512.webp",
    });
  });

  it("describes an armour set by its piece count", () => {
    const p = previewFromPayload("set", { setName: "Geist Armor", pieces: [{}, {}, {}, {}], render: RENDER });
    expect(p?.title).toBe("Geist Armor — SC Bridge");
    expect(p?.description).toBe("Armour set · 4 pieces");
  });

  it("describes a loot item by maker and category", () => {
    const p = previewFromPayload("loot", { name: "Geist Armor Arms", manufacturer_name: "Kastak Arms", category: "armour", render: null });
    expect(p).toEqual({ title: "Geist Armor Arms — SC Bridge", description: "Kastak Arms · armour", image: null });
  });

  it("cuts a long description at a word", () => {
    const p = previewFromPayload("paint", { name: "Paint", description: "word ".repeat(100), render: null });
    expect(p!.description.length).toBeLessThanOrEqual(200);
    expect(p!.description.endsWith("…")).toBe(true);
  });

  it("returns null when the payload has no name", () => {
    expect(previewFromPayload("ship", { error: "Not found" })).toBeNull();
  });
});

describe("renderLinkPreviewShell", () => {
  it("writes the title and Open Graph tags, with og:image when there is a render", async () => {
    const html = await renderLinkPreviewShell(shell(), {
      title: "Anvil Carrack — SC Bridge",
      description: 'Built "tough" & <ready>',
      image: "https://renders.scbridge.app/abcdef0123456789/512.webp",
    }).text();
    expect(html).toContain("<title>Anvil Carrack — SC Bridge</title>");
    expect(html).toContain('<meta property="og:title" content="Anvil Carrack — SC Bridge">');
    expect(html).toContain('<meta property="og:description" content="Built &quot;tough&quot; &amp; &lt;ready&gt;">');
    expect(html).toContain('<meta property="og:image" content="https://renders.scbridge.app/abcdef0123456789/512.webp">');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
  });

  it("leaves og:image unset when the item has no render", async () => {
    const html = await renderLinkPreviewShell(shell(), { title: "X — SC Bridge", description: "", image: null }).text();
    expect(html).toContain('<meta property="og:title" content="X — SC Bridge">');
    expect(html).not.toContain("og:image");
    expect(html).not.toContain("twitter:card");
  });
});

describe("GET /ships/:slug HTML shell", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  it("carries the ship's render as og:image", async () => {
    const id = await seedVehicle(env.DB, { slug: "lp-carrack", name: "Lp Carrack" });
    await env.DB.prepare("UPDATE vehicles SET class_name = 'lp_carrack' WHERE id = ?").bind(id).run();
    await env.DB
      .prepare("INSERT INTO item_renders (kind, item_key, variant, view, hash, width, height, source_version) VALUES ('vehicle', 'lp_carrack', '', 'iso', '1234567890abcdef', 2048, 1536, '4.10.3-live')")
      .run();
    const res = await SELF.fetch("http://localhost/ships/lp-carrack");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<title>Lp Carrack — SC Bridge</title>");
    expect(html).toContain('<meta property="og:image" content="https://renders.scbridge.app/1234567890abcdef/512.webp">');
  });

  it("serves the plain shell for a ship that does not exist", async () => {
    const res = await SELF.fetch("http://localhost/ships/lp-nothing-here");
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain("og:title");
  });
});
