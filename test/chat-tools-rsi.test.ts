import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { executeChatTool } from "../src/lib/chat-tools";
import { rsiUrlFor } from "../src/lib/chat-tools/rsi-page";

type Route = { status: number; body?: string; location?: string };

/** A fake fetch keyed by full URL. Records the URLs it was asked for. Nothing reaches the network. */
function fakeFetch(routes: Record<string, Route | "throw">) {
  const seen: string[] = [];
  const fn = (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    seen.push(url);
    const r = routes[url];
    if (r === "throw") throw new Error("network down");
    if (!r) return new Response("not found", { status: 404 });
    const headers: Record<string, string> = { "Content-Type": "text/html" };
    if (r.location) headers.Location = r.location;
    return new Response(r.body ?? "", { status: r.status, headers });
  }) as typeof fetch;
  return { fn, seen };
}

const RSI = "https://robertsspaceindustries.com";

async function read(path: string, fetchFn: typeof fetch) {
  return JSON.parse(
    await executeChatTool(env.DB, "user-x", { id: "c", name: "read_rsi_page", arguments: { path } }, null, fetchFn),
  ) as Record<string, any>;
}

describe("chat tools — read_rsi_page", () => {
  it("rejects other hosts", async () => {
    expect(rsiUrlFor("https://evil.example/patch-notes")).toBeNull();
    const { fn, seen } = fakeFetch({});
    const out = await read("https://evil.example/patch-notes", fn);
    expect(out.error).toBeTruthy();
    expect(seen).toEqual([]);
  });

  it("rejects disallowed paths", () => {
    for (const p of ["/pledge/ships", "/account/settings", "/patch-notes?x=1", "/comm-link/../account", "/patch-notes#top", "http://robertsspaceindustries.com/patch-notes"]) {
      expect(rsiUrlFor(p), p).toBeNull();
    }
  });

  it("accepts locale prefix", () => {
    expect(rsiUrlFor("/en/patch-notes")?.href).toBe(`${RSI}/en/patch-notes`);
    expect(rsiUrlFor("/comm-link/Patch-Notes/21429-Star-Citizen-Alpha-4103")?.href).toBe(
      `${RSI}/comm-link/Patch-Notes/21429-Star-Citizen-Alpha-4103`,
    );
  });

  it("follows allowed redirect", async () => {
    const { fn } = fakeFetch({
      [`${RSI}/patch-notes`]: { status: 301, location: "/en/patch-notes" },
      [`${RSI}/en/patch-notes`]: { status: 200, body: "<html><head><title>Patch Notes</title></head><body><p>Alpha 4.10.3 is live</p></body></html>" },
    });
    const out = await read("/patch-notes", fn);
    expect(out.url).toBe(`${RSI}/en/patch-notes`);
    expect(out.title).toBe("Patch Notes");
    expect(out.text).toContain("Alpha 4.10.3 is live");
  });

  it("refuses redirect off allowlist", async () => {
    const { fn } = fakeFetch({ [`${RSI}/patch-notes`]: { status: 302, location: "https://evil.example/" } });
    const out = await read("/patch-notes", fn);
    expect(out.error).toContain("Redirected");
  });

  it("keeps allowlisted links only", async () => {
    const body = `<html><body><script>var secret = 1;</script><style>p{}</style>
      <a href="/comm-link/Patch-Notes/1-X">4.10.3</a> and <a href="/pledge">store</a></body></html>`;
    const { fn } = fakeFetch({ [`${RSI}/comm-link`]: { status: 200, body } });
    const out = await read("/comm-link", fn);
    expect(out.text).toContain("4.10.3 (/comm-link/Patch-Notes/1-X)");
    expect(out.text).toContain("store");
    expect(out.text).not.toContain("/pledge");
    expect(out.text).not.toContain("secret");
  });

  it("non-200 returns error", async () => {
    const { fn } = fakeFetch({ [`${RSI}/patch-notes`]: { status: 403 } });
    const out = await read("/patch-notes", fn);
    expect(out.error).toBe("RSI returned 403");
  });

  it("fetch throws returns error", async () => {
    const { fn } = fakeFetch({ [`${RSI}/patch-notes`]: "throw" });
    const out = await read("/patch-notes", fn);
    expect(out.error).toBe("Could not reach RSI");
  });

  it("truncates to 12000 with truncated true", async () => {
    const body = `<html><body><p>${"word ".repeat(5000)}</p></body></html>`;
    const { fn } = fakeFetch({ [`${RSI}/patch-notes`]: { status: 200, body } });
    const out = await read("/patch-notes", fn);
    expect(out.text.length).toBeLessThanOrEqual(12000);
    expect(out.truncated).toBe(true);
  });
});
