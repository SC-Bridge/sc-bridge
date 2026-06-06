import type { Env } from "../lib/types";
import { decideLocalizationIngest, type SourceFetch, type IngestSeenState } from "../lib/localization";

/**
 * Auto-ingest a clean, *unmodified* base global.ini from community CDN sources
 * so SC Bridge's localization stays fresh within hours of a patch — without a
 * local game install or a human extracting. Refreshes ONLY the current default
 * version's base in KV; never creates version rows or flips the default (that
 * stays with patch cutover), so an unattended run can't corrupt version state.
 *
 * Sources are tried in order; the first that fetches AND passes the sanity
 * gate (evaluateLocalizationIngest) wins. A suspicious/broken upstream is
 * skipped (and reported), falling through to the next source.
 */
const BASE_SOURCES: { name: string; url: string }[] = [
  {
    name: "BeltaKoda ScCompLangPackRemix (stock)",
    url: "https://raw.githubusercontent.com/BeltaKoda/ScCompLangPackRemix/refs/heads/main/LIVE/stock-global.ini",
  },
  {
    name: "Dymerz StarCitizen-Localization (english)",
    url: "https://raw.githubusercontent.com/Dymerz/StarCitizen-Localization/main/data/Localization/english/global.ini",
  },
];

export interface IngestRunResult {
  status: "ingested" | "unchanged" | "skipped" | "rejected";
  source?: string;
  versionCode?: string;
  keyCount?: number;
  delta?: number;
  reason: string;
}

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

export async function runLocalizationIngest(env: Env): Promise<IngestRunResult> {
  const ver = await env.DB
    .prepare("SELECT code FROM game_versions WHERE is_default = 1 LIMIT 1")
    .first<{ code: string }>();
  if (!ver) return { status: "skipped", reason: "No default game version configured" };

  const key = `localization:global-ini:${ver.code}`;
  const current = await env.LOCALIZATION_KV.get(key);

  // Per-source content fingerprints from the previous run — lets us detect when
  // a SOURCE actually publishes something new (so a fresh INI from EITHER source
  // is caught) without thrashing between two sources that ship different bytes
  // for the same patch.
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

  // Fetch EVERY source (no short-circuit) so a fresh publish from any of them
  // is considered this run.
  const fetched: SourceFetch[] = [];
  for (const src of BASE_SOURCES) {
    try {
      const resp = await fetch(src.url, { cf: { cacheTtl: 0 } });
      fetched.push({ name: src.name, content: resp.ok ? await resp.text() : null });
    } catch {
      fetched.push({ name: src.name, content: null });
    }
  }

  const d = decideLocalizationIngest(fetched, current, state);

  // Persist the refreshed per-source hashes regardless of outcome (records
  // baselines on the first run; marks a publish as seen after we act on it).
  await env.LOCALIZATION_KV.put(STATE_KEY, JSON.stringify({ seen: d.seen }));

  if (d.action === "ingest") {
    await env.LOCALIZATION_KV.put(key, d.content!);
    const delta = d.delta ?? 0;
    const sign = delta >= 0 ? "+" : "";
    await notify(
      env,
      `✅ Base global.ini auto-refreshed for ${ver.code} from ${d.source} — ${d.keyCount} keys (Δ${sign}${delta})`,
    );
    return { status: "ingested", source: d.source, versionCode: ver.code, keyCount: d.keyCount, delta: d.delta, reason: d.reason };
  }

  if (d.action === "skip") {
    // Only ping on a genuine rejection (a source published something broken),
    // not on the transient all-fetch-failed case.
    if (!/fail/i.test(d.reason)) {
      await notify(env, `⚠️ Localization auto-ingest skipped for ${ver.code}: ${d.reason}`);
    }
    return { status: "skipped", versionCode: ver.code, reason: d.reason };
  }

  return { status: "unchanged", versionCode: ver.code, reason: d.reason };
}
