import { escapeHtml } from "./utils";
import type { RenderRef } from "./types";

/**
 * Link previews for item pages.
 *
 * Unfurlers (Discord, Slack, search) never run the SPA, so the worker writes
 * og:title, og:description and og:image into the HTML shell. The data comes
 * from the page's own public API route, so the preview matches the page.
 */

export type PreviewKind = "ship" | "paint" | "set" | "loot";

export interface PreviewTarget {
  kind: PreviewKind;
  api: string;
}

export interface LinkPreview {
  title: string;
  description: string;
  image: string | null;
}

const RENDER_ORIGIN = "https://renders.scbridge.app";
const PREVIEW_SIZE = 512;
const MAX_DESCRIPTION = 200;
const SLUG = "[A-Za-z0-9._-]+";

const PATHS: Array<[RegExp, PreviewKind, (id: string) => string]> = [
  [new RegExp(`^/ships/(${SLUG})/?$`), "ship", (id) => `/api/ships/${id}`],
  [new RegExp(`^/paints/(${SLUG})/?$`), "paint", (id) => `/api/paints/${id}`],
  [new RegExp(`^/loot/sets/(${SLUG})/?$`), "set", (id) => `/api/loot/sets/${id}`],
  [/^\/loot\/([0-9a-fA-F-]{36})(?:\/detail)?\/?$/, "loot", (id) => `/api/loot/${id}`],
];

/** The API route that describes an item page, or null for any other path. */
export function matchPreviewPath(pathname: string): PreviewTarget | null {
  for (const [re, kind, api] of PATHS) {
    const m = re.exec(pathname);
    if (m) return { kind, api: api(m[1]) };
  }
  return null;
}

/** Drop "Key: value" header lines, collapse whitespace and cut at a word. */
function summarise(text: unknown): string {
  if (typeof text !== "string") return "";
  const prose = text
    .split(/\r?\n/)
    .filter((line) => !/^\s*[A-Z][\w ]{0,30}:\s/.test(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (prose.length <= MAX_DESCRIPTION) return prose;
  const cut = prose.slice(0, MAX_DESCRIPTION - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > 0 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

function renderImage(render: unknown): string | null {
  const hash = (render as RenderRef | null)?.hash;
  return typeof hash === "string" && hash ? `${RENDER_ORIGIN}/${hash}/${PREVIEW_SIZE}.webp` : null;
}

/** Build the preview from the page's API payload; null when it names no item. */
export function previewFromPayload(kind: PreviewKind, data: Record<string, unknown>): LinkPreview | null {
  const name = kind === "set" ? data.setName : data.name;
  if (typeof name !== "string" || !name) return null;

  let description: string;
  if (kind === "set") {
    const n = Array.isArray(data.pieces) ? data.pieces.length : 0;
    description = `Armour set · ${n} ${n === 1 ? "piece" : "pieces"}`;
  } else if (kind === "loot") {
    description = [data.manufacturer_name, data.category]
      .filter((v): v is string => typeof v === "string" && v !== "")
      .join(" · ");
  } else {
    description = summarise(data.description);
  }

  return { title: `${name} — SC Bridge`, description, image: renderImage(data.render) };
}

/** Write the title and Open Graph tags into the SPA shell. */
export function renderLinkPreviewShell(shell: Response, preview: LinkPreview): Response {
  const tags = [
    `<meta property="og:title" content="${escapeHtml(preview.title)}">`,
    `<meta property="og:type" content="website">`,
  ];
  if (preview.description) {
    tags.push(`<meta name="description" content="${escapeHtml(preview.description)}">`);
    tags.push(`<meta property="og:description" content="${escapeHtml(preview.description)}">`);
  }
  if (preview.image) {
    tags.push(`<meta property="og:image" content="${escapeHtml(preview.image)}">`);
    tags.push(`<meta name="twitter:card" content="summary_large_image">`);
  }
  const html = tags.join("");

  return new HTMLRewriter()
    .on("title", {
      element(el) {
        el.setInnerContent(preview.title);
      },
    })
    .on("head", {
      element(el) {
        el.append(html, { html: true });
      },
    })
    .transform(shell);
}
