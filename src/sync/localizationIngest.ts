import type { Env } from "../lib/types";
import { evaluateLocalizationIngest } from "../lib/localization";

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

export async function runLocalizationIngest(env: Env): Promise<IngestRunResult> {
  const ver = await env.DB
    .prepare("SELECT code FROM game_versions WHERE is_default = 1 LIMIT 1")
    .first<{ code: string }>();
  if (!ver) return { status: "skipped", reason: "No default game version configured" };

  const key = `localization:global-ini:${ver.code}`;
  const current = await env.LOCALIZATION_KV.get(key);

  let lastReason = "All sources failed to fetch";
  for (const src of BASE_SOURCES) {
    let content: string | null = null;
    try {
      const resp = await fetch(src.url, { cf: { cacheTtl: 0 } });
      if (!resp.ok) {
        lastReason = `${src.name} fetch failed (HTTP ${resp.status})`;
        continue;
      }
      content = await resp.text();
    } catch {
      lastReason = `${src.name} fetch threw`;
      continue;
    }

    const d = evaluateLocalizationIngest(content, current);
    if (!d.changed) {
      return { status: "unchanged", source: src.name, versionCode: ver.code, keyCount: d.keyCount, reason: d.reason };
    }
    if (!d.ok) {
      lastReason = `${src.name}: ${d.reason}`;
      await notify(env, `⚠️ Localization auto-ingest skipped ${src.name} for ${ver.code}: ${d.reason}`);
      continue; // try the next source
    }

    await env.LOCALIZATION_KV.put(key, content);
    const sign = d.delta >= 0 ? "+" : "";
    await notify(
      env,
      `✅ Base global.ini auto-refreshed for ${ver.code} from ${src.name} — ${d.keyCount} keys (Δ${sign}${d.delta})`,
    );
    return { status: "ingested", source: src.name, versionCode: ver.code, keyCount: d.keyCount, delta: d.delta, reason: d.reason };
  }

  return { status: "skipped", versionCode: ver.code, reason: lastReason };
}
