import type { Env } from "../lib/types";
import {
  decideVersionedIngest,
  parseVersionFromCommit,
  hashIni,
  type VersionedSourceFetch,
  type IngestSeenState,
  type DetectedVersion,
} from "../lib/localization";

/**
 * Version-aware auto-ingest of a clean, *unmodified* base global.ini from
 * community sources (BeltaKoda canonical, Dymerz fallback) so SC Bridge's
 * localization stays fresh within hours of a patch — without a local game
 * install or a human extracting.
 *
 *  - SAME patch: refresh the current default version's base in KV (guarded
 *    against thrash + regressing a base we extracted ahead of the community).
 *  - NEW patch: detect the version from the source's GitHub commit, STAGE it
 *    under its own code (preserve the current base, never flip the default),
 *    and Discord-ping the diff so a human can review + promote.
 *
 * The GitHub commit lookup only fires when a source's *content* changed, so an
 * idle hourly run makes a single raw fetch per source and never touches the
 * (rate-limited, unauthenticated) GitHub API.
 */
interface BaseSource {
  name: string;
  url: string; // raw global.ini
  repo: string; // owner/repo for the commits API
  path: string; // file path within the repo (its latest commit names the version)
}

const BASE_SOURCES: BaseSource[] = [
  {
    name: "BeltaKoda ScCompLangPackRemix (stock)",
    url: "https://raw.githubusercontent.com/BeltaKoda/ScCompLangPackRemix/refs/heads/main/LIVE/stock-global.ini",
    repo: "BeltaKoda/ScCompLangPackRemix",
    path: "LIVE/stock-global.ini",
  },
  {
    name: "Dymerz StarCitizen-Localization (english)",
    url: "https://raw.githubusercontent.com/Dymerz/StarCitizen-Localization/main/data/Localization/english/global.ini",
    repo: "Dymerz/StarCitizen-Localization",
    path: "data/Localization/english/global.ini",
  },
];

export interface IngestRunResult {
  status: "ingested" | "staged" | "unchanged" | "skipped" | "rejected";
  source?: string;
  versionCode?: string;
  keyCount?: number;
  delta?: number;
  reason: string;
}

/** Injectable network so the orchestration (D1 + KV writes) is testable without
 *  live fetches (the vitest-4 pool dropped the fetch mock). */
export interface IngestDeps {
  fetchContent: (url: string) => Promise<string | null>;
  fetchVersion: (src: BaseSource) => Promise<DetectedVersion | null>;
}

async function defaultFetchContent(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, { cf: { cacheTtl: 0 } });
    return resp.ok ? await resp.text() : null;
  } catch {
    return null;
  }
}

async function defaultFetchVersion(src: BaseSource): Promise<DetectedVersion | null> {
  try {
    const api = `https://api.github.com/repos/${src.repo}/commits?path=${encodeURIComponent(src.path)}&per_page=1`;
    const resp = await fetch(api, {
      headers: { "User-Agent": "scbridge-localization-ingest", Accept: "application/vnd.github+json" },
      cf: { cacheTtl: 0 },
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as Array<{ commit?: { message?: string } }>;
    const msg = data?.[0]?.commit?.message;
    return msg ? parseVersionFromCommit(msg) : null;
  } catch {
    return null;
  }
}

const DEFAULT_DEPS: IngestDeps = { fetchContent: defaultFetchContent, fetchVersion: defaultFetchVersion };

async function notify(env: Env, content: string): Promise<void> {
  // Reuse the single Discord webhook (shared with pack requests) — different
  // message, same channel.
  const hook = env.DISCORD_PACK_REQUEST_WEBHOOK;
  if (!hook) return;
  try {
    await fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  } catch {
    /* notification is best-effort */
  }
}

const STATE_KEY = "localization:ingest-state";

export async function runLocalizationIngest(env: Env, deps: IngestDeps = DEFAULT_DEPS): Promise<IngestRunResult> {
  const ver = await env.DB
    .prepare("SELECT code FROM game_versions WHERE is_default = 1 LIMIT 1")
    .first<{ code: string }>();
  if (!ver) return { status: "skipped", reason: "No default game version configured" };
  const currentDefaultCode = ver.code;

  const currentBase = await env.LOCALIZATION_KV.get(`localization:global-ini:${currentDefaultCode}`);

  // Per-source content fingerprints from the previous run.
  let state: IngestSeenState = { seen: {} };
  try {
    const raw = await env.LOCALIZATION_KV.get(STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as IngestSeenState;
      if (parsed && typeof parsed === "object" && parsed.seen) state = { seen: parsed.seen };
    }
  } catch {
    state = { seen: {} };
  }

  // Fetch every source; resolve its version from GitHub ONLY when the content
  // changed since last run (keeps the GitHub API calls to ~once per patch).
  const fetched: VersionedSourceFetch[] = [];
  for (const src of BASE_SOURCES) {
    const content = await deps.fetchContent(src.url);
    let version: DetectedVersion | null = null;
    if (content !== null && state.seen[src.name] !== hashIni(content)) {
      version = await deps.fetchVersion(src);
    }
    fetched.push({ name: src.name, content, version });
  }

  const knownRows = await env.DB.prepare("SELECT code FROM game_versions").all<{ code: string }>();
  const knownCodes = knownRows.results.map((r) => r.code);

  const d = decideVersionedIngest(fetched, currentDefaultCode, currentBase, knownCodes, state);

  // Persist refreshed per-source hashes regardless of outcome.
  await env.LOCALIZATION_KV.put(STATE_KEY, JSON.stringify({ seen: d.seen }));

  if (d.action === "stage-new") {
    const v = d.version!;
    const uuid = `${v.code}-${v.build ?? "0"}`;
    // is_default=0 — staging NEVER flips the live default; a human promotes via
    // PUT /api/admin/versions/default after reviewing the diff.
    await env.DB
      .prepare(
        "INSERT OR IGNORE INTO game_versions (uuid, code, channel, is_default, build_number, released_at) VALUES (?, ?, 'LIVE', 0, ?, date('now'))",
      )
      .bind(uuid, v.code, v.build)
      .run();
    await env.LOCALIZATION_KV.put(`localization:global-ini:${d.targetCode}`, d.content!);
    const diff = d.diff ?? { added: [], removed: [], changed: [] };
    await notify(
      env,
      `🆕 Localization base **${d.targetCode}** staged from ${d.source} — ` +
        `+${diff.added.length} / ~${diff.changed.length} / -${diff.removed.length} vs ${currentDefaultCode}. ` +
        `Review the diff and promote at Admin → Versions.`,
    );
    return { status: "staged", source: d.source, versionCode: d.targetCode, keyCount: d.keyCount, reason: d.reason };
  }

  if (d.action === "refresh-current") {
    await env.LOCALIZATION_KV.put(`localization:global-ini:${d.targetCode}`, d.content!);
    const delta = d.delta ?? 0;
    const sign = delta >= 0 ? "+" : "";
    await notify(
      env,
      `✅ Base global.ini auto-refreshed for ${currentDefaultCode} from ${d.source} — ${d.keyCount} keys (Δ${sign}${delta})`,
    );
    return { status: "ingested", source: d.source, versionCode: currentDefaultCode, keyCount: d.keyCount, delta: d.delta, reason: d.reason };
  }

  if (d.action === "skip") {
    if (!/fail/i.test(d.reason)) {
      await notify(env, `⚠️ Localization auto-ingest skipped for ${currentDefaultCode}: ${d.reason}`);
    }
    return { status: "skipped", versionCode: currentDefaultCode, reason: d.reason };
  }

  return { status: "unchanged", versionCode: currentDefaultCode, reason: d.reason };
}
