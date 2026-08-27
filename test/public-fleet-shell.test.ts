import { describe, it, expect } from "vitest";
import {
  matchPublicFleetPath,
  renderPublicFleetShell,
  type PublicFleetPayload,
  type PublicFleetShip,
} from "../src/lib/publicFleet";

/**
 * Non-JS rendering of /u/:handle/fleet.
 *
 * The SPA shell is a bare index.html; AI web readers, link unfurlers and
 * search engines never run the React app, so the worker must put the ship
 * roster, title and Open Graph tags into the HTML it serves.
 */

const SHELL =
  `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" />` +
  `<title>SC Bridge — Star Citizen Companion</title></head>` +
  `<body><div id="root"></div></body></html>`;

function shell(): Response {
  return new Response(SHELL, { headers: { "Content-Type": "text/html" } });
}

function ship(over: Partial<PublicFleetShip> = {}): PublicFleetShip {
  return {
    id: 1,
    custom_name: null,
    org_visibility: "private",
    vehicle_name: "Carrack",
    vehicle_slug: "carrack",
    image_url: null,
    focus: "Expedition",
    size_label: "Large",
    cargo: 456,
    crew_min: 4,
    crew_max: 6,
    speed_scm: 100,
    classification: "Exploration",
    manufacturer_name: "Anvil Aerospace",
    manufacturer_code: "ANVL",
    insurance_label: "Lifetime Insurance",
    duration_months: null,
    is_lifetime: 1,
    paint_name: null,
    paint_slug: null,
    paint_image_url: null,
    paint_image_url_medium: null,
    paint_image_url_small: null,
    production_status: "flight-ready",
    ...over,
  };
}

describe("matchPublicFleetPath", () => {
  it("extracts the handle from /u/:handle/fleet", () => {
    expect(matchPublicFleetPath("/u/Mr_Xul/fleet")).toBe("Mr_Xul");
    expect(matchPublicFleetPath("/u/Mr_Xul/fleet/")).toBe("Mr_Xul");
  });

  it("ignores every other path", () => {
    expect(matchPublicFleetPath("/")).toBeNull();
    expect(matchPublicFleetPath("/fleet")).toBeNull();
    expect(matchPublicFleetPath("/u/Mr_Xul")).toBeNull();
    expect(matchPublicFleetPath("/u/bad handle/fleet")).toBeNull();
    expect(matchPublicFleetPath("/u/a/b/fleet")).toBeNull();
  });
});

describe("renderPublicFleetShell", () => {
  it("renders the roster, title and Open Graph tags into the shell", async () => {
    const data: PublicFleetPayload = {
      handle: "JeanLuc",
      ships: [
        ship({ id: 1, vehicle_name: "Carrack", custom_name: "Enterprise" }),
        ship({
          id: 2,
          vehicle_name: "Gladius",
          manufacturer_name: "Aegis Dynamics",
          insurance_label: "6 Month Insurance",
          is_lifetime: 0,
          paint_name: "Valiant",
        }),
      ],
    };
    const html = await renderPublicFleetShell(shell(), "jeanluc", data).text();

    expect(html).toContain("<title>JeanLuc's Fleet — SC Bridge</title>");
    expect(html).toContain(`property="og:title" content="JeanLuc's Fleet — SC Bridge"`);
    expect(html).toContain(`property="og:description" content="2 ships shared publicly on SC Bridge"`);
    expect(html).toContain(`name="description" content="2 ships shared publicly on SC Bridge"`);
    expect(html).toContain("Carrack");
    expect(html).toContain("Enterprise");
    expect(html).toContain("Anvil Aerospace");
    expect(html).toContain("Lifetime Insurance");
    expect(html).toContain("Gladius");
    expect(html).toContain("Valiant");
    expect(html).toContain("6 Month Insurance");
    // Roster lives inside #root so React replaces it on mount.
    expect(html).toMatch(/<div id="root">\s*<main[\s\S]*Gladius[\s\S]*<\/main>\s*<\/div>/);
  });

  it("escapes user-controlled text", async () => {
    const data: PublicFleetPayload = {
      handle: "Evil",
      ships: [ship({ custom_name: `<script>alert("x")</script>` })],
    };
    const html = await renderPublicFleetShell(shell(), "evil", data).text();
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  });

  it("renders a not-found page when the fleet is missing", async () => {
    const html = await renderPublicFleetShell(shell(), "nobody", null).text();
    expect(html).toContain("<title>No public fleet for nobody — SC Bridge</title>");
    expect(html).toContain("No public fleet for");
    expect(html).not.toContain("og:description");
  });

  it("preserves the shell's status and headers", async () => {
    const res = await renderPublicFleetShell(
      new Response(SHELL, {
        status: 200,
        headers: { "Content-Type": "text/html", "Cache-Control": "no-cache" },
      }),
      "x",
      null,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
  });
});
