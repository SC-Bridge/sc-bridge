/**
 * scunpacked-data paint sync — ported from internal/scunpacked/
 *
 * Key change from Go version: Instead of reading local JSON files,
 * this fetches paint metadata from GitHub raw URLs since Workers
 * don't have filesystem access.
 *
 * GitHub API is used to list paint files, then each is fetched via raw URL.
 */

import {
  upsertPaint,
  setPaintVehiclesBatch,
  loadVehicleMaps,
  insertSyncHistory,
  updateSyncHistory,
} from "../db/queries";
import type { VehicleRow } from "../db/queries";
import { concurrentMap } from "../lib/utils";
import { SYNC_SOURCE } from "../lib/constants";
import { logEvent } from "../lib/logger";

// --- Tag alias map (matches Go version) ---

const TAG_ALIASES: Record<string, string> = {
  "890j": "890-jump",
  "star-runner": "mercury-star-runner",
  starfighter: "ares-star-fighter",
  scout: "khartu-al",
  hornet: "%hornet%",
  "hornet-f7-mk2": "%hornet%mk-ii",
  "hornet-f7c-mk2": "%hornet%mk-ii",
  herald: "herald",
  msr: "mercury-star-runner",
  "hull-c": "hull-c",
  caterpillar: "caterpillar",
  golem: "%golem%",
  salvation: "salvation",
  ursa: "%ursa%",
};

// --- Types ---

interface PaintFile {
  Item: {
    className: string;
    name: string;
    required_tags: string;
    stdItem?: {
      Name: string;
      Description: string;
      ClassName: string;
      RequiredTags: string[];
    };
  };
}

interface ParsedPaint {
  className: string;
  name: string;
  description: string;
  vehicleTag: string;
}

// --- GitHub API ---

interface GitHubTreeEntry {
  path: string;
  type: string;
  sha: string;
  url: string;
}

interface GitHubTreeResponse {
  tree: GitHubTreeEntry[];
  truncated?: boolean;
}

/**
 * Fetch paint file list from GitHub API, then fetch each paint file.
 *
 * Uses a two-step tree approach to avoid the recursive tree API truncation
 * bug (the full-repo tree exceeds GitHub's 7MB limit and silently truncates,
 * returning only alphabetically-first files — i.e. just paint_100i_* entries).
 *
 * Step 1: fetch the root tree (non-recursive) to find the SHA of items/
 * Step 2: fetch just the items/ subtree (recursive) — small enough not to truncate
 */
async function fetchPaintFiles(repo: string, branch: string, githubToken?: string): Promise<ParsedPaint[]> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Fleet-Manager/1.0",
  };
  if (githubToken) {
    headers["Authorization"] = `token ${githubToken}`;
  }

  // Step 1: root tree (non-recursive) — find the SHA of the items/ subtree
  const rootURL = `https://api.github.com/repos/${repo}/git/trees/${branch}`;
  const rootResp = await fetch(rootURL, { headers });
  if (!rootResp.ok) {
    throw new Error(`GitHub API error (${rootResp.status}): ${await rootResp.text()}`);
  }
  const rootTree = (await rootResp.json()) as GitHubTreeResponse;
  const itemsEntry = rootTree.tree.find((e) => e.path === "items" && e.type === "tree");
  if (!itemsEntry) {
    throw new Error("[scunpacked] items/ directory not found in repo root tree");
  }

  // Step 2: items/ subtree (recursive) — safe, much smaller than full-repo tree
  const itemsURL = `https://api.github.com/repos/${repo}/git/trees/${itemsEntry.sha}?recursive=1`;
  const itemsResp = await fetch(itemsURL, { headers });
  if (!itemsResp.ok) {
    throw new Error(`GitHub API error (${itemsResp.status}): ${await itemsResp.text()}`);
  }
  const itemsTree = (await itemsResp.json()) as GitHubTreeResponse;
  if (itemsTree.truncated) {
    console.warn("[scunpacked] items/ subtree still truncated — results may be incomplete");
  }

  const paintFiles = itemsTree.tree.filter(
    (entry) =>
      entry.type === "blob" &&
      entry.path.startsWith("paint_") &&
      entry.path.endsWith(".json"),
  );

  console.log(`[scunpacked] Found ${paintFiles.length} paint files in GitHub repo`);

  // Fetch paint files concurrently (10 at a time)
  const rawHeaders: Record<string, string> = { "User-Agent": "Fleet-Manager/1.0" };
  if (githubToken) {
    rawHeaders["Authorization"] = `token ${githubToken}`;
  }

  const results = await concurrentMap(paintFiles, 10, async (file): Promise<ParsedPaint | null> => {
    try {
      // file.path is relative to items/ (e.g. "paint_100i_blue.json")
      const rawURL = `https://raw.githubusercontent.com/${repo}/${branch}/items/${file.path}`;
      const resp = await fetch(rawURL, { headers: rawHeaders });
      if (!resp.ok) return null;

      const pf = (await resp.json()) as PaintFile;
      const item = pf.Item;

      // Use stdItem fields if available
      let name = item.name;
      let description = "";
      let className = item.className;

      if (item.stdItem) {
        if (item.stdItem.Name) name = item.stdItem.Name;
        description = item.stdItem.Description ?? "";
        if (item.stdItem.ClassName) className = item.stdItem.ClassName;
      }

      // Filter out placeholders
      if (name.includes("PLACEHOLDER")) return null;

      // Generate readable name from className if empty
      if (!name) {
        name = nameFromClassName(className);
      }

      // Extract vehicle tag from required_tags
      let vehicleTag = item.required_tags ?? "";
      if (!vehicleTag && item.stdItem?.RequiredTags?.length) {
        vehicleTag = item.stdItem.RequiredTags[0];
      }
      if (vehicleTag.includes(" ")) {
        vehicleTag = vehicleTag.split(/\s+/)[0];
      }
      if (!vehicleTag || !isPaintTag(vehicleTag)) return null;

      return { className, name, description, vehicleTag };
    } catch {
      return null;
    }
  });

  const paints = results.filter((p): p is ParsedPaint => p !== null);
  const skipped = paintFiles.length - paints.length;

  console.log(`[scunpacked] Parsed ${paints.length} paints, skipped ${skipped}`);
  return paints;
}

// --- Paint tag helpers ---

function isPaintTag(tag: string): boolean {
  const lower = tag.toLowerCase();
  return lower.startsWith("paint_") || lower.endsWith("_paint");
}

function nameFromClassName(className: string): string {
  let s = className.replace(/^Paint_/, "");
  s = s.replace(/_/g, " ");
  return s;
}

function slugFromClassName(className: string): string {
  let s = className.replace(/^Paint_/, "");
  s = s.replace(/_/g, "-");
  return s.toLowerCase();
}

// --- Vehicle ID resolution (in-memory, zero DB cost) ---

function resolveVehicleIDsFromMaps(
  tag: string,
  bySlug: Map<string, number>,
  allRows: VehicleRow[],
): number[] {
  // Normalize: strip Paint_ prefix / _Paint suffix, replace _ with -, lowercase
  let normalized = tag.toLowerCase();
  normalized = normalized.replace(/^paint_/, "");
  normalized = normalized.replace(/_paint$/, "");
  normalized = normalized.replace(/_/g, "-");

  if (!normalized) return [];

  // Check alias map
  const alias = TAG_ALIASES[normalized];
  if (alias) {
    if (alias.includes("%")) {
      // Convert SQL LIKE pattern to in-memory matching
      const ids = matchSlugLike(alias, allRows);
      if (ids.length > 0) return ids;
    } else {
      normalized = alias;
    }
  }

  // Try exact slug match
  const exactID = bySlug.get(normalized);
  if (exactID !== undefined) return [exactID];

  // Try prefix match
  const prefixIDs: number[] = [];
  for (const row of allRows) {
    if (row.slug.startsWith(normalized)) {
      prefixIDs.push(row.id);
    }
  }
  if (prefixIDs.length > 0) return prefixIDs;

  // Try name-contains match
  const nameTerm = normalized.replace(/-/g, " ").toLowerCase();
  const nameIDs: number[] = [];
  for (const row of allRows) {
    if (row.name.toLowerCase().includes(nameTerm)) {
      nameIDs.push(row.id);
    }
  }
  if (nameIDs.length > 0) return nameIDs;

  console.debug(`[scunpacked] No vehicle match for tag "${tag}" (normalized: "${normalized}")`);
  return [];
}

/** Convert SQL LIKE patterns (with %) to in-memory matching */
function matchSlugLike(pattern: string, allRows: VehicleRow[]): number[] {
  // Convert SQL LIKE pattern to regex: % → .*, _ → .
  const regexStr = "^" + pattern.replace(/%/g, ".*").replace(/_/g, ".") + "$";
  const re = new RegExp(regexStr);
  const ids: number[] = [];
  for (const row of allRows) {
    if (re.test(row.slug)) {
      ids.push(row.id);
    }
  }
  return ids;
}

// --- Sync ---

export async function syncPaints(
  db: D1Database,
  repo: string,
  branch: string,
  githubToken?: string,
): Promise<number> {
  const syncID = await insertSyncHistory(db, SYNC_SOURCE.SCUNPACKED, "paints", "running");

  try {
    // Pre-load vehicle Maps for in-memory matching (1 query instead of 500+)
    const vehicleMaps = await loadVehicleMaps(db);

    const paints = await fetchPaintFiles(repo, branch, githubToken);
    let count = 0;
    let unmatched = 0;

    for (const pp of paints) {
      try {
        // In-memory vehicle resolution (zero DB cost)
        const vehicleIDs = resolveVehicleIDsFromMaps(
          pp.vehicleTag,
          vehicleMaps.bySlug,
          vehicleMaps.allRows,
        );
        const slug = slugFromClassName(pp.className);

        const paintID = await upsertPaint(db, {
          name: pp.name,
          slug,
          class_name: pp.className,
          description: pp.description,
        });

        if (vehicleIDs.length > 0) {
          await setPaintVehiclesBatch(db, paintID, vehicleIDs);
        } else {
          unmatched++;
        }
        count++;
      } catch (err) {
        console.warn(`[scunpacked] Failed to upsert paint ${pp.className}:`, err);
      }
    }

    await updateSyncHistory(db, syncID, "success", count, "");
    console.log(`[scunpacked] Paint sync complete: ${count} synced, ${unmatched} unmatched`);
    logEvent("sync_paints", {
      parsed: paints.length,
      synced: count,
      unmatched,
    });
    return count;
  } catch (err) {
    await updateSyncHistory(db, syncID, "error", 0, String(err));
    throw err;
  }
}
