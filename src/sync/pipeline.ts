/**
 * Sync pipeline orchestration
 *
 * Orchestrates the sync chain:
 * 1. scunpacked paint metadata (via GitHub API)
 * 2. RSI API images (ships + paints)
 *
 * Vehicle and component data is populated via DataCore extraction scripts
 * in scbridge/tools/scripts/ — not via live sync.
 *
 * Workers are single-threaded per invocation, so no sync mutex needed.
 */

import { syncPaints as syncScunpackedPaints } from "./scunpacked";
import { syncAll as syncRSI } from "./rsi";
import { getVehicleCount } from "../db/queries";
import type { Env } from "../lib/types";
import { logEvent } from "../lib/logger";

// --- Individual sync functions (for manual triggers) ---

export async function triggerPaintSync(env: Env): Promise<string> {
  const repo = env.SCUNPACKED_REPO || "StarCitizenWiki/scunpacked-data";
  const branch = env.SCUNPACKED_BRANCH || "main";

  console.log("[pipeline] Paint sync triggered");
  logEvent("sync_start", { source: "paint_sync" });
  const start = Date.now();
  try {
    await syncScunpackedPaints(env.DB, repo, branch, env.GITHUB_TOKEN);
    logEvent("sync_complete", { source: "paint_sync", duration_s: (Date.now() - start) / 1000 });
  } catch (err) {
    logEvent("sync_error", { source: "paint_sync", error: String(err) });
    throw err;
  }

  return "Paint sync complete";
}

export async function triggerRSISync(env: Env): Promise<string> {
  if (env.RSI_API_ENABLED !== "true") {
    return "RSI API sync not enabled (set RSI_API_ENABLED=true)";
  }

  const baseURL = env.RSI_BASE_URL || "https://robertsspaceindustries.com";
  const rateLimitMs = parseFloat(env.RSI_RATE_LIMIT || "1") * 1000;

  console.log("[pipeline] RSI API image sync triggered");
  logEvent("sync_start", { source: "rsi_images" });
  const start = Date.now();
  try {
    await syncRSI(env.DB, baseURL, rateLimitMs);
    logEvent("sync_complete", { source: "rsi_images", duration_s: (Date.now() - start) / 1000 });
  } catch (err) {
    logEvent("sync_error", { source: "rsi_images", error: String(err) });
    throw err;
  }
  return "RSI API sync complete";
}

// --- Full sync pipeline ---
// WARNING: runs all sync steps in one Worker invocation. Use staggered cron
// triggers in production. This function is for local dev / manual trigger only
// and may exceed Workers CPU limits with large datasets.

export async function runFullSync(env: Env): Promise<void> {
  const start = Date.now();
  console.log("[pipeline] Full sync pipeline starting (dev/manual — use cron triggers in production)");

  const db = env.DB;
  const rsiEnabled = env.RSI_API_ENABLED === "true";

  // Only run image syncs if vehicles exist
  const vehicleCount = await getVehicleCount(db);
  if (vehicleCount === 0) {
    console.warn("[pipeline] No vehicles in DB, skipping image and paint sync");
    return;
  }

  // Step 1: scunpacked paint metadata
  try {
    const repo = env.SCUNPACKED_REPO || "StarCitizenWiki/scunpacked-data";
    const branch = env.SCUNPACKED_BRANCH || "main";
    console.log("[pipeline] scunpacked paint sync starting");
    await syncScunpackedPaints(db, repo, branch, env.GITHUB_TOKEN);
  } catch (err) {
    console.error("[pipeline] scunpacked paint sync failed:", err);
  }

  // Step 2: RSI API images
  if (rsiEnabled) {
    try {
      const baseURL = env.RSI_BASE_URL || "https://robertsspaceindustries.com";
      const rateLimitMs = parseFloat(env.RSI_RATE_LIMIT || "1") * 1000;
      console.log("[pipeline] RSI API image sync starting");
      await syncRSI(db, baseURL, rateLimitMs);
    } catch (err) {
      console.error("[pipeline] RSI API image sync failed:", err);
    }
  }

  const duration = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[pipeline] Full sync pipeline complete in ${duration}s`);
}
