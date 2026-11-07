import { Hono } from "hono";
import type { HonoEnv, HangarXplorEntry } from "../lib/types";
import { getAuthUser } from "../lib/types";
import { slugFromShipCode, slugFromName, compactSlug } from "../lib/slug";
import { loadInsuranceTypes } from "../db/queries";
import { logEvent } from "../lib/logger";
import { inferKind } from "../lib/pledgeKind";
import { normaliseTitle } from "../lib/titleNorm";
import { logUserChange } from "../lib/change-history";
import { validate, HangarXplorImportSchema, HangarSyncPayloadSchema, SYNC_ANOMALY_THRESHOLDS } from "../lib/validation";
import { isTrustedExtension } from "../lib/constants";
import {
  preloadVehicleMap,
  findVehicleSlugLocal,
  preloadPaintMap,
  findPaintLocal,
  parseBuybackShipName,
  parseBuybackPaintName,
  parseCCUNames,
  classifyBuyback,
  executeFleetSwap,
  executeTableSwap,
  parseRsiDate,
  parseValueCents,
  normaliseStoreCreditCents,
  ccuNamesFromUpgradeData,
} from "../lib/fleet-import";

/**
 * /api/import/* — HangarXplor import + hangar-sync extension
 *
 * Preloads vehicle slug map to avoid per-entry DB queries.
 * Uses db.batch() for transactional delete+insert (all-or-nothing).
 */
export function importRoutes() {
  const routes = new Hono<HonoEnv>();

  // POST /api/import/hangarxplor — import HangarXplor JSON export
  routes.post("/hangarxplor", validate("json", HangarXplorImportSchema), async (c) => {
    const db = c.env.DB;
    const userID = c.get("user")!.id;

    // Rate limit: reject if last import was < 30 seconds ago (L-36 concurrent import guard)
    const lastImport = await db
      .prepare("SELECT MAX(imported_at) as last FROM user_fleet WHERE user_id = ?")
      .bind(userID)
      .first<{ last: string | null }>();
    if (lastImport?.last) {
      const elapsed = Date.now() - new Date(lastImport.last + "Z").getTime();
      if (elapsed < 30000) {
        return c.json({ error: "Please wait 30 seconds between imports" }, 429);
      }
    }

    const entries: HangarXplorEntry[] = c.req.valid("json");

    // Single timestamp for every row in this import — used by
    // executeFleetSwap to delete rows the current hangar no longer
    // contains (anything imported_at < importTag is stale).
    const importTag = new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, "");

    // Preload all vehicle slugs+names into memory (avoids per-entry queries)
    const vehicleMap = await preloadVehicleMap(db);
    const insuranceMap = await loadInsuranceTypes(db);

    // Build all insert statements first, then batch with the delete
    const insertStmts: D1PreparedStatement[] = [];
    const skippedShips: string[] = [];

    for (const entry of entries) {
      const displayName = entry.name;

      // Generate slug candidates
      const codeSlug = slugFromShipCode(entry.ship_code);
      const nameSlug = slugFromName(displayName);
      const lookupSlug = entry.lookup ? slugFromName(entry.lookup) : "";
      const compactCode = compactSlug(codeSlug);
      const compactName = compactSlug(nameSlug);

      // Find matching vehicle in preloaded map
      const candidates = [codeSlug, nameSlug, lookupSlug, compactCode, compactName];
      const matchedSlug = findVehicleSlugLocal(vehicleMap, candidates, displayName);
      if (!matchedSlug) {
        // Skip unmatched ships instead of creating stubs in shared vehicles table
        skippedShips.push(displayName);
        continue;
      }

      // Detect custom name
      let customName = "";
      if (entry.ship_name) {
        const snLower = entry.ship_name.toLowerCase();
        const codeLower = entry.ship_code.toLowerCase();
        const nameLower = displayName.toLowerCase();
        let isCustom = true;
        if (codeLower.includes(slugFromName(entry.ship_name).toLowerCase())) {
          isCustom = false;
        }
        if (nameLower.includes(snLower) || snLower.includes(nameLower)) {
          isCustom = false;
        }
        if (isCustom) {
          customName = entry.ship_name;
        }
      }

      // Determine insurance type
      let insuranceTypeID: number | null = null;
      if (entry.lti) {
        insuranceTypeID = insuranceMap.get("lti") ?? null;
      } else {
        const insLower = (entry.insurance ?? "").toLowerCase();
        if (insLower.includes("120")) {
          insuranceTypeID = insuranceMap.get("120_month") ?? null;
        } else if (insLower.includes("72")) {
          insuranceTypeID = insuranceMap.get("72_month") ?? null;
        } else if (insLower.includes("6 month") || insLower.includes("6-month")) {
          insuranceTypeID = insuranceMap.get("6_month") ?? null;
        } else if (insLower.includes("3 month") || insLower.includes("3-month")) {
          insuranceTypeID = insuranceMap.get("3_month") ?? null;
        } else if (insLower.includes("standard")) {
          insuranceTypeID = insuranceMap.get("standard") ?? null;
        } else {
          insuranceTypeID = insuranceMap.get("unknown") ?? null;
        }
      }

      // Queue fleet UPSERT. UNIQUE(user_id, pledge_id, vehicle_id)
      // (partial WHERE pledge_id IS NOT NULL, mig 0224) means re-imports
      // refresh the existing row rather than creating a duplicate.
      insertStmts.push(
        db
          .prepare(
            `INSERT INTO user_fleet (user_id, vehicle_id, insurance_type_id, warbond, is_loaner,
              pledge_id, pledge_name, pledge_cost, pledge_date, custom_name, imported_at)
            VALUES (?, (SELECT id FROM vehicles WHERE slug = ? LIMIT 1), ?, ?, ?,
              ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, pledge_id, vehicle_id) WHERE pledge_id IS NOT NULL
            DO UPDATE SET
              insurance_type_id = excluded.insurance_type_id,
              warbond = excluded.warbond,
              pledge_name = excluded.pledge_name,
              pledge_cost = excluded.pledge_cost,
              pledge_date = excluded.pledge_date,
              custom_name = COALESCE(user_fleet.custom_name, excluded.custom_name),
              imported_at = excluded.imported_at`,
          )
          .bind(
            userID,
            matchedSlug,
            insuranceTypeID,
            entry.warbond ? 1 : 0,
            0,
            entry.pledge_id || null,
            entry.pledge_name || null,
            entry.pledge_cost || null,
            entry.pledge_date || null,
            customName || null,
            importTag,
          ),
      );
    }

    // Log unmatched ships so we can add them to the vehicles table via extraction scripts
    if (skippedShips.length > 0) {
      console.warn(`[import] Skipped ${skippedShips.length} unmatched ships: ${JSON.stringify(skippedShips.slice(0, 20))}`);
      logEvent("hangarxplor_unmatched", {
        count: skippedShips.length,
        items: skippedShips.slice(0, 50),
      });
    }

    // UPSERT + cleanup-by-import-tag (replaces old insert-then-swap).
    await executeFleetSwap(db, userID, insertStmts, importTag);
    const imported = insertStmts.length;

    console.log(`[import] HangarXplor import complete: ${imported}/${entries.length}, ${skippedShips.length} skipped`);
    logEvent("fleet_import", {
      entries: entries.length,
      imported,
      skipped: skippedShips.length,
    });
    await logUserChange(db, userID, "fleet_imported", {
      metadata: { vehicle_count: imported, total_entries: entries.length, skipped_count: skippedShips.length },
      ipAddress: c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for"),
    });
    return c.json({
      imported,
      total: entries.length,
      skipped: skippedShips.length,
      skipped_ships: skippedShips.slice(0, 20),
      message: "Import complete",
    });
  });

  // POST /api/import/hangar-sync — import from SC Bridge extension (RSI hangar sync)
  // Pre-validate: log payload shape on validation failure to diagnose schema mismatches
  routes.post("/hangar-sync", async (c, next) => {
    const raw = await c.req.raw.clone().json().catch(() => null) as Record<string, unknown> | null;
    if (raw) {
      const result = HangarSyncPayloadSchema.safeParse(raw);
      if (!result.success) {
        console.error("[hangar-sync] Validation errors:", JSON.stringify(result.error.issues.slice(0, 10)));
        console.error("[hangar-sync] Payload keys:", Object.keys(raw));
        const pledges = raw.pledges as Record<string, unknown>[] | undefined;
        const buybacks = raw.buyback_pledges as Record<string, unknown>[] | undefined;
        if (pledges?.[0]) console.error("[hangar-sync] First pledge keys:", Object.keys(pledges[0]));
        if (buybacks?.[0]) console.error("[hangar-sync] First buyback keys:", Object.keys(buybacks[0]));
      }
    }
    return next();
  }, validate("json", HangarSyncPayloadSchema), async (c) => {
   try {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    const clientIP = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "unknown";

    const payload = c.req.valid("json");

    // Rate limit: reject if synced within last 5 minutes
    const existingProfile = await db
      .prepare("SELECT synced_at FROM user_rsi_profiles WHERE user_id = ?")
      .bind(userID)
      .first<{ synced_at: string }>();
    if (existingProfile) {
      const lastSync = new Date(existingProfile.synced_at + "Z").getTime();
      const now = Date.now();
      if (now - lastSync < 5 * 60 * 1000) {
        return c.json({ error: "Sync rate limited — please wait 5 minutes between syncs" }, 429);
      }
    }

    // Single timestamp for every row in this sync — used by
    // executeFleetSwap to delete rows the current hangar no longer
    // contains (anything imported_at < importTag is stale).
    const importTag = new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, "");

    // --- Anomaly detection ---
    const totalFleetValueCents = payload.pledges.reduce(
      (sum, p) => sum + (p.valueCents ?? 0), 0 as number,
    );
    const isAnomalous =
      payload.pledges.length > SYNC_ANOMALY_THRESHOLDS.pledgeCount ||
      totalFleetValueCents > SYNC_ANOMALY_THRESHOLDS.fleetValueCents;
    if (isAnomalous) {
      logEvent("hangar_sync_anomaly", {
        user_id: userID,
        ip: clientIP,
        pledge_count: payload.pledges.length,
        fleet_value_cents: totalFleetValueCents,
        extension_version: payload.sync_meta.extension_version,
      });
      console.warn(`[hangar-sync] ANOMALY: user=${userID} pledges=${payload.pledges.length} value=$${(totalFleetValueCents / 100).toFixed(2)}`);
    }

    // --- Fleet + Paint import ---
    const vehicleMap = await preloadVehicleMap(db);
    const paintMap = await preloadPaintMap(db);
    const insuranceMap = await loadInsuranceTypes(db);

    const insertStmts: D1PreparedStatement[] = [];
    const skippedItems: string[] = [];
    const imageCaptures: { url: string; slug: string | null; title: string; kind: string }[] = [];

    // Capture ALL image URLs from ALL items (ships, paints, FPS gear, flair, etc.)
    for (const pledge of payload.pledges) {
      for (const anyItem of (pledge.items ?? [])) {
        const imgUrl = typeof anyItem.image === "string" && anyItem.image.startsWith("http") ? anyItem.image : null;
        if (imgUrl) {
          imageCaptures.push({ url: imgUrl, slug: null, title: anyItem.title || "", kind: anyItem.kind || "unknown" });
        }
      }
    }
    // Also capture from buyback pledges
    for (const pledge of (payload.buyback_pledges ?? [])) {
      for (const anyItem of (pledge.items ?? [])) {
        const imgUrl = typeof anyItem.image === "string" && anyItem.image.startsWith("http") ? anyItem.image : null;
        if (imgUrl) {
          imageCaptures.push({ url: imgUrl, slug: null, title: anyItem.title || "", kind: anyItem.kind || "unknown" });
        }
      }
    }

    for (const pledge of payload.pledges) {
      const shipItems = (pledge.items ?? []).filter((item: Record<string, unknown>) => item.kind === "Ship");

      for (const item of shipItems) {
        const displayName = item.title || "";

        // Generate slug candidates from item title and manufacturer code
        const nameSlug = slugFromName(displayName);
        const codeSlug = item.manufacturerCode
          ? slugFromShipCode(`${item.manufacturerCode}_${displayName.replace(/\s+/g, "_")}`)
          : nameSlug;
        const compactCode = compactSlug(codeSlug);
        const compactName = compactSlug(nameSlug);

        const candidates = [codeSlug, nameSlug, compactCode, compactName];
        // Also try {mfr_code_lower}-{name_slug} so prefix-match can hit DB slugs
        // like "anvl-c8r-pisces-rescue" when pledge title is "C8R Pisces" with mfr=ANVL.
        // Issue #161 follow-up.
        if (typeof item.manufacturerCode === "string" && item.manufacturerCode) {
          const mfrLower = item.manufacturerCode.toLowerCase();
          candidates.push(`${mfrLower}-${nameSlug}`);
          candidates.push(`${mfrLower}${compactName}`);
        }
        const matchedSlug = findVehicleSlugLocal(vehicleMap, candidates, displayName);
        // Enrich the already-captured ship image with its matched slug
        if (item.image && matchedSlug) {
          const existing = imageCaptures.find(ic => ic.url === item.image);
          if (existing) existing.slug = matchedSlug;
        }
        if (!matchedSlug) {
          // No known vehicle match — skip instead of creating a stub.
          // Stubs from user-supplied data risk polluting the shared vehicles table.
          skippedItems.push(displayName || "Unknown");
          continue;
        }

        // Insurance: parse from pledge items with kind=Insurance
        // Titles are like "Lifetime Insurance", "120 Month Insurance", "6 Month Insurance"
        let insuranceTypeID: number | null = null;
        const insuranceItem = (pledge.items ?? []).find(
          (i: Record<string, unknown>) => i.kind === "Insurance",
        );
        const insTitle = (insuranceItem?.title ?? "").toLowerCase();
        if (pledge.hasLti || insTitle.includes("lifetime") || insTitle.includes("lti")) {
          insuranceTypeID = insuranceMap.get("lti") ?? null;
        } else if (insTitle) {
          // Parse "N Month Insurance" → N_month key
          const monthMatch = insTitle.match(/(\d+)[\s-]*month/);
          if (monthMatch) {
            insuranceTypeID = insuranceMap.get(`${monthMatch[1]}_month`) ?? insuranceMap.get("unknown") ?? null;
          } else {
            insuranceTypeID = insuranceMap.get("unknown") ?? null;
          }
        } else {
          // No insurance item in pledge — no insurance
          insuranceTypeID = null;
        }

        // Custom name from extension data
        const customName = item.customName || null;

        // Format pledge cost from cents
        const pledgeCost = pledge.valueCents
          ? `$${(pledge.valueCents / 100).toFixed(2)}`
          : pledge.value || null;

        insertStmts.push(
          db
            .prepare(
              `INSERT INTO user_fleet (user_id, vehicle_id, insurance_type_id, warbond, is_loaner,
                pledge_id, pledge_name, pledge_cost, pledge_date, custom_name, imported_at)
              VALUES (?, (SELECT id FROM vehicles WHERE slug = ? LIMIT 1), ?, ?, ?,
                ?, ?, ?, ?, ?, ?)
              ON CONFLICT(user_id, pledge_id, vehicle_id) WHERE pledge_id IS NOT NULL
              DO UPDATE SET
                insurance_type_id = excluded.insurance_type_id,
                warbond = excluded.warbond,
                pledge_name = excluded.pledge_name,
                pledge_cost = excluded.pledge_cost,
                pledge_date = excluded.pledge_date,
                custom_name = COALESCE(user_fleet.custom_name, excluded.custom_name),
                imported_at = excluded.imported_at`,
            )
            .bind(
              userID,
              matchedSlug,
              insuranceTypeID,
              pledge.isWarbond ? 1 : 0,
              0,
              String(pledge.id),
              pledge.name || null,
              pledgeCost,
              pledge.date || null,
              customName,
              importTag,
            ),
        );
      }
    }

    // Log unmatched items so we can add them to the vehicles table via extraction scripts
    if (skippedItems.length > 0) {
      console.warn(`[hangar-sync] Skipped ${skippedItems.length} unmatched items: ${JSON.stringify(skippedItems.slice(0, 20))}`);
      logEvent("hangar_sync_unmatched", {
        user_id: userID,
        count: skippedItems.length,
        items: skippedItems.slice(0, 50),
      });
    }

    // Fleet UPSERT + cleanup-by-import-tag
    if (insertStmts.length > 0) {
      await executeFleetSwap(db, userID, insertStmts, importTag);
    }
    const imported = insertStmts.length;

    // --- Paint matching ---
    const paintInsertStmts: D1PreparedStatement[] = [];
    const skippedPaints: string[] = [];

    for (const pledge of payload.pledges) {
      const skinItems = (pledge.items ?? []).filter((item: Record<string, unknown>) => item.kind === "Skin");
      for (const item of skinItems) {
        const title = (item.title as string) || "";
        const paintId = findPaintLocal(paintMap, title);
        if (!paintId) {
          skippedPaints.push(title || "Unknown Paint");
          continue;
        }
        paintInsertStmts.push(
          db
            .prepare(
              `INSERT OR IGNORE INTO user_paints (user_id, paint_id, pledge_id, pledge_name, is_buyback, synced_at)
              VALUES (?, ?, ?, ?, 0, datetime('now'))`,
            )
            .bind(userID, paintId, String(pledge.id ?? ""), pledge.name || null),
        );
      }
    }

    // Paint swap — delete-then-insert (UNIQUE(user_id, paint_id) prevents insert-then-swap)
    if (paintInsertStmts.length > 0) {
      await db.prepare("DELETE FROM user_paints WHERE user_id = ?").bind(userID).run();
      for (let i = 0; i < paintInsertStmts.length; i += 500) {
        await db.batch(paintInsertStmts.slice(i, i + 500));
      }
    }
    const paintCount = paintInsertStmts.length;

    if (skippedPaints.length > 0) {
      console.warn(`[hangar-sync] Skipped ${skippedPaints.length} unmatched paints: ${JSON.stringify(skippedPaints.slice(0, 20))}`);
    }

    // --- Auto-inherit default paints for owned vehicles ---
    // For each vehicle in the user's fleet, if the vehicle has a default paint
    // (is_default_for_vehicle = 1 in paint_vehicles), add it to user_paints.
    // INSERT OR IGNORE ensures we don't duplicate paints the user already owns.
    const defaultPaintResult = await db
      .prepare(
        `INSERT OR IGNORE INTO user_paints (user_id, paint_id, pledge_id, pledge_name, is_buyback, synced_at)
        SELECT DISTINCT ?, pv.paint_id, '', 'Default Paint', 0, datetime('now')
        FROM user_fleet uf
        JOIN paint_vehicles pv ON pv.vehicle_id = uf.vehicle_id AND pv.is_default_for_vehicle = 1
        WHERE uf.user_id = ?`,
      )
      .bind(userID, userID)
      .run();
    const defaultPaintsAdded = defaultPaintResult.meta?.changes ?? 0;
    if (defaultPaintsAdded > 0) {
      console.log(`[hangar-sync] Auto-inherited ${defaultPaintsAdded} default paints for ${userID}`);
    }

    // --- Capture ALL image URLs for CDN review ---
    if (imageCaptures.length > 0) {
      const capStmts = imageCaptures.map((cap) =>
        db
          .prepare(
            `INSERT INTO image_captures (url, source, vehicle_id, vehicle_slug, title, kind, title_norm)
            VALUES (?, 'hangar_sync',
              CASE WHEN ? IS NOT NULL THEN (SELECT id FROM vehicles WHERE slug = ? LIMIT 1) ELSE NULL END,
              ?, ?, ?, ?)
            ON CONFLICT(url) DO UPDATE SET
              last_seen = datetime('now'),
              seen_count = seen_count + 1,
              vehicle_slug = COALESCE(excluded.vehicle_slug, vehicle_slug),
              title_norm = excluded.title_norm`,
          )
          .bind(cap.url, cap.slug, cap.slug, cap.slug, cap.title, cap.kind, normaliseTitle(cap.title)),
      );
      // Fire-and-forget in background — don't block the sync response
      c.executionCtx.waitUntil(
        (async () => {
          for (let i = 0; i < capStmts.length; i += 100) {
            await db.batch(capStmts.slice(i, i + 100));
          }
          // Auto-dismiss (-1): captures where the DB match already has a CF Images URL.
          // These are duplicates of images we already have — no review needed.
          const dismissed = await db.prepare(
            `UPDATE image_captures SET promoted = -1 WHERE promoted = 0
            AND (
              (vehicle_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM vehicles v WHERE v.id = image_captures.vehicle_id
                AND v.image_url LIKE 'https://imagedelivery%'
              ))
              OR
              (kind = 'Skin' AND EXISTS (
                SELECT 1 FROM paints p
                WHERE p.title_norm = image_captures.title_norm
                AND p.image_url LIKE 'https://imagedelivery%'
              ))
            )`,
          ).run();

          const promoted = await db.prepare(
            `UPDATE image_captures SET promoted = 1 WHERE promoted = 0
            AND (
              (vehicle_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM vehicles v WHERE v.id = image_captures.vehicle_id
                AND (v.image_url IS NULL OR v.image_url = '' OR v.image_url NOT LIKE 'https://imagedelivery%')
              ))
              OR
              (kind = 'Skin' AND EXISTS (
                SELECT 1 FROM paints p
                WHERE p.title_norm = image_captures.title_norm
                AND (p.image_url IS NULL OR p.image_url = '' OR p.image_url NOT LIKE 'https://imagedelivery%')
              ))
              OR
              (kind NOT IN ('Ship', 'Skin'))
            )`,
          ).run();

          const dismissedCount = dismissed.meta?.changes ?? 0;
          const promotedCount = promoted.meta?.changes ?? 0;
          if (dismissedCount > 0 || promotedCount > 0) {
            console.log(`[hangar-sync] Image auto-triage: ${promotedCount} promoted, ${dismissedCount} dismissed`);
            logEvent("image_capture_auto_triage", {
              promoted: promotedCount,
              dismissed: dismissedCount,
              user_id: userID,
            });
          }
        })().catch((err) => console.error("[hangar-sync] Image capture failed:", err)),
      );
    }

    // --- Profile upsert ---
    let hasProfile = false;
    if (payload.account) {
      const acct = payload.account;
      await db
        .prepare(
          `INSERT INTO user_rsi_profiles (user_id, rsi_handle, rsi_displayname, avatar_url,
            enlisted_since, country, concierge_level, subscriber_type, subscriber_frequency,
            store_credit_cents, uec_balance, rec_balance, referral_code, has_game_package,
            orgs_json, badges_json, featured_badges_json, synced_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(user_id) DO UPDATE SET
            rsi_handle = excluded.rsi_handle,
            rsi_displayname = excluded.rsi_displayname,
            avatar_url = excluded.avatar_url,
            enlisted_since = excluded.enlisted_since,
            country = excluded.country,
            concierge_level = excluded.concierge_level,
            subscriber_type = excluded.subscriber_type,
            subscriber_frequency = excluded.subscriber_frequency,
            store_credit_cents = excluded.store_credit_cents,
            uec_balance = excluded.uec_balance,
            rec_balance = excluded.rec_balance,
            referral_code = excluded.referral_code,
            has_game_package = excluded.has_game_package,
            orgs_json = excluded.orgs_json,
            badges_json = excluded.badges_json,
            featured_badges_json = excluded.featured_badges_json,
            synced_at = excluded.synced_at`,
        )
        .bind(
          userID,
          acct.nickname || null,
          acct.displayname || null,
          acct.avatar_url || null,
          acct.enlisted_since || null,
          acct.country || null,
          acct.concierge_level || null,
          acct.subscriber_type || null,
          acct.subscriber_frequency || null,
          // Extensions < 0.6.2 sent store credit x100 — corrected here.
          normaliseStoreCreditCents(acct.store_credit_cents, payload.sync_meta.extension_version),
          acct.uec_balance ?? null,
          acct.rec_balance ?? null,
          acct.referral_code || null,
          acct.has_game_package ? 1 : 0,
          acct.orgs ? JSON.stringify(acct.orgs) : null,
          acct.all_badges ? JSON.stringify(acct.all_badges) : null,
          acct.featured_badges ? JSON.stringify(acct.featured_badges) : null,
        )
        .run();
      hasProfile = true;

      // Auto-verify RSI identity ONLY when request comes from a trusted extension
      // (running on the user's authenticated RSI session). Non-extension callers
      // (e.g. HangarXplor JSON paste) must use the bio-key verification flow.
      const origin = c.req.header("Origin") || "";
      if (acct.nickname && isTrustedExtension(origin)) {
        await db
          .prepare(
            `INSERT INTO user_rsi_profile (user_id, handle, display_name, avatar_url, enlisted_at, verified_at, verified_handle, fetched_at)
             VALUES (?, ?, ?, ?, ?, datetime('now'), ?, datetime('now'))
             ON CONFLICT(user_id) DO UPDATE SET
               handle = excluded.handle,
               display_name = excluded.display_name,
               avatar_url = COALESCE(excluded.avatar_url, user_rsi_profile.avatar_url),
               enlisted_at = COALESCE(excluded.enlisted_at, user_rsi_profile.enlisted_at),
               verified_at = datetime('now'),
               verified_handle = excluded.verified_handle,
               fetched_at = excluded.fetched_at`,
          )
          .bind(
            userID,
            acct.nickname,
            acct.displayname || null,
            acct.avatar_url || null,
            acct.enlisted_since || null,
            acct.nickname,
          )
          .run();

        // Clean up any pending manual verification
        await db
          .prepare("DELETE FROM profile_verification_pending WHERE user_id = ?")
          .bind(userID)
          .run();
      }

      // Auto-set user.image from RSI avatar if user has no avatar yet
      if (acct.avatar_url) {
        const currentUser = await db
          .prepare("SELECT image FROM user WHERE id = ?")
          .bind(userID)
          .first<{ image: string | null }>();
        if (!currentUser?.image) {
          await db
            .prepare("UPDATE user SET image = ? WHERE id = ?")
            .bind(acct.avatar_url, userID)
            .run();
        }
      }
    } else {
      console.warn(`[hangar-sync] No account data in payload for user=${userID}`);
    }

    // --- Buy-back pledges: insert-then-swap ---
    let buybackCount = 0;
    let buybackMatched = 0;
    if (payload.buyback_pledges.length > 0) {
      const bbStmts: D1PreparedStatement[] = [];
      for (const bb of payload.buyback_pledges) {
        const bbName = bb.name || "";
        const bbType = classifyBuyback(bbName);

        // Match buyback to vehicle/paint/CCU
        let vehicleId: number | null = null;
        let paintId: number | null = null;
        let fromVehicleId: number | null = null;
        let toVehicleId: number | null = null;

        if (bbType === "ship") {
          const shipName = parseBuybackShipName(bbName);
          const nameSlug = slugFromName(shipName);
          const codeSlug = nameSlug;
          const candidates = [codeSlug, nameSlug, compactSlug(codeSlug), compactSlug(nameSlug)];
          const matchedSlug = findVehicleSlugLocal(vehicleMap, candidates, shipName);
          if (matchedSlug) {
            vehicleId = vehicleMap.slugToID.get(matchedSlug) ?? null;
            if (vehicleId) buybackMatched++;
          }
        } else if (bbType === "paint") {
          const paintTitle = parseBuybackPaintName(bbName);
          paintId = findPaintLocal(paintMap, paintTitle);
          if (paintId) buybackMatched++;
        } else if (bbType === "ccu") {
          const parsed = parseCCUNames(bbName);
          if (parsed) {
            const [fromName, toName] = parsed;
            const fromSlug = slugFromName(fromName);
            const toSlug = slugFromName(toName);
            const fromMatch = findVehicleSlugLocal(vehicleMap, [fromSlug, compactSlug(fromSlug)], fromName);
            const toMatch = findVehicleSlugLocal(vehicleMap, [toSlug, compactSlug(toSlug)], toName);
            if (fromMatch) fromVehicleId = vehicleMap.slugToID.get(fromMatch) ?? null;
            if (toMatch) toVehicleId = vehicleMap.slugToID.get(toMatch) ?? null;
            if (fromVehicleId || toVehicleId) buybackMatched++;
          }
        }

        bbStmts.push(
          db
            .prepare(
              `INSERT INTO user_buyback_pledges (user_id, rsi_pledge_id, name, value_cents, date,
                is_credit_reclaimable, items_json, buyback_type, vehicle_id, paint_id,
                from_vehicle_id, to_vehicle_id, synced_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
            )
            .bind(
              userID,
              bb.id,
              bbName,
              bb.value_cents ?? null,
              bb.date_parsed || bb.date || null,
              bb.is_credit_reclaimable ? 1 : 0,
              (bb.items ?? []).length > 0 ? JSON.stringify(bb.items) : null,
              bbType,
              vehicleId,
              paintId,
              fromVehicleId,
              toVehicleId,
            ),
        );
      }

      await executeTableSwap(db, "user_buyback_pledges", userID, bbStmts, 1000);
      buybackCount = bbStmts.length;
    }

    // --- Sync record ---
    const syncResult = await db
      .prepare(
        `INSERT INTO user_hangar_syncs (user_id, source, pledge_count, ship_count, item_count)
        VALUES (?, 'extension', ?, ?, ?)`,
      )
      .bind(
        userID,
        payload.pledges.length,
        imported,
        payload.pledges.reduce((sum, p) => sum + (p.items ?? []).length, 0 as number),
      )
      .run();
    const syncId = syncResult.meta.last_row_id;

    // --- Populate user_pledges (upsert + delete-reinsert children) ---
    // user_pledges has UNIQUE(user_id, rsi_pledge_id) so we upsert pledges.
    // Items and upgrades have no natural key so we delete and reinsert them.
    await db.batch([
      db.prepare("DELETE FROM user_pledge_upgrades WHERE user_id = ?").bind(userID),
      db.prepare("DELETE FROM user_pledge_items WHERE user_id = ?").bind(userID),
    ]);

    // Step 1: Upsert pledges (ON CONFLICT updates existing, inserts new)
    const pledgeStmts: D1PreparedStatement[] = [];
    for (const pledge of payload.pledges) {
      const ccu = ccuNamesFromUpgradeData(pledge.upgradeData);
      pledgeStmts.push(
        db
          .prepare(
            `INSERT INTO user_pledges (user_id, sync_id, rsi_pledge_id, name, value, value_cents,
              configuration_value, currency, pledge_date, pledge_date_parsed,
              is_upgraded, is_reclaimable, is_giftable, availability,
              is_warbond, ccu_from_name, ccu_to_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, rsi_pledge_id) DO UPDATE SET
              sync_id = excluded.sync_id,
              name = excluded.name,
              value = excluded.value,
              value_cents = excluded.value_cents,
              configuration_value = excluded.configuration_value,
              currency = excluded.currency,
              pledge_date = excluded.pledge_date,
              pledge_date_parsed = excluded.pledge_date_parsed,
              is_upgraded = excluded.is_upgraded,
              is_reclaimable = excluded.is_reclaimable,
              is_giftable = excluded.is_giftable,
              availability = excluded.availability,
              is_warbond = excluded.is_warbond,
              ccu_from_name = excluded.ccu_from_name,
              ccu_to_name = excluded.ccu_to_name`,
          )
          .bind(
            userID,
            syncId,
            pledge.id,
            pledge.name || "",
            pledge.value || null,
            pledge.valueCents ?? null,
            pledge.configurationValue || null,
            pledge.currency || null,
            pledge.date || null,
            parseRsiDate(pledge.date),
            pledge.isUpgraded ? 1 : 0,
            pledge.isReclaimable ? 1 : 0,
            pledge.isGiftable ? 1 : 0,
            pledge.availability || null,
            pledge.isWarbond ? 1 : 0,
            ccu.from,
            ccu.to,
          ),
      );
    }

    for (let i = 0; i < pledgeStmts.length; i += 500) {
      await db.batch(pledgeStmts.slice(i, i + 500));
    }

    // Remove pledges that no longer exist (gifted, melted, etc.)
    // After upsert, all current pledges have the new sync_id. Stale pledges have old sync_ids.
    // This avoids the D1 100-bind-parameter limit that a NOT IN (...) clause would hit.
    await db
      .prepare("DELETE FROM user_pledges WHERE user_id = ? AND sync_id != ?")
      .bind(userID, syncId)
      .run();

    // Step 2: Build pledge ID map (all current pledges)
    const pledgeMapRows = await db
      .prepare("SELECT id, rsi_pledge_id FROM user_pledges WHERE user_id = ?")
      .bind(userID)
      .all<{ id: number; rsi_pledge_id: number }>();
    const pledgeIdMap = new Map<number, number>();
    for (const row of pledgeMapRows.results) {
      pledgeIdMap.set(row.rsi_pledge_id, row.id);
    }

    // Step 3: Insert new pledge items (referencing new pledge IDs)

    const itemStmts: D1PreparedStatement[] = [];
    for (const pledge of payload.pledges) {
      const userPledgeId = pledgeIdMap.get(Number(pledge.id));
      if (!userPledgeId) continue;

      const pledgeItems = pledge.items ?? [];
      for (let idx = 0; idx < pledgeItems.length; idx++) {
        const item = pledgeItems[idx];

        // Parse insurance type from Insurance items
        let insuranceTypeId: number | null = null;
        if (item.kind === "Insurance") {
          const insTitle = (item.title ?? "").toLowerCase();
          if (insTitle.includes("lifetime") || insTitle.includes("lti")) {
            insuranceTypeId = insuranceMap.get("lti") ?? null;
          } else {
            const monthMatch = insTitle.match(/(\d+)[\s-]*month/);
            if (monthMatch) {
              insuranceTypeId = insuranceMap.get(`${monthMatch[1]}_month`) ?? insuranceMap.get("unknown") ?? null;
            } else {
              insuranceTypeId = insuranceMap.get("unknown") ?? null;
            }
          }
        }

        itemStmts.push(
          db
            .prepare(
              `INSERT INTO user_pledge_items (user_id, user_pledge_id, title, kind,
                manufacturer_code, manufacturer_name, image_url, custom_name, serial,
                is_nameable, insurance_type_id, sort_order)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              userID,
              userPledgeId,
              item.title || "",
              item.kind || inferKind(item.title) || null,
              item.manufacturerCode || null,
              item.manufacturer || null,
              item.image || null,
              item.customName || null,
              item.serial || null,
              item.isNameable ? 1 : 0,
              insuranceTypeId,
              idx,
            ),
        );
      }
    }

    for (let i = 0; i < itemStmts.length; i += 500) {
      await db.batch(itemStmts.slice(i, i + 500));
    }

    // Step 4: Insert new pledge upgrades (referencing new pledge IDs)
    const upgradeStmts: D1PreparedStatement[] = [];
    for (let idx = 0; idx < payload.upgrades.length; idx++) {
      const upgrade = payload.upgrades[idx];
      const userPledgeId = pledgeIdMap.get(Number(upgrade.pledge_id));
      if (!userPledgeId) continue; // Skip orphaned upgrades

      upgradeStmts.push(
        db
          .prepare(
            `INSERT INTO user_pledge_upgrades (user_id, user_pledge_id, upgrade_name,
              applied_at, applied_at_parsed, new_value, new_value_cents, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            userID,
            userPledgeId,
            upgrade.name || "",
            upgrade.applied_at || null,
            parseRsiDate(upgrade.applied_at),
            upgrade.new_value || null,
            parseValueCents(upgrade.new_value),
            idx,
          ),
      );
    }

    for (let i = 0; i < upgradeStmts.length; i += 500) {
      await db.batch(upgradeStmts.slice(i, i + 500));
    }

    // Pledges upserted, stale pledges removed by sync_id. Items/upgrades delete+reinsert.

    const upgradeCount = payload.upgrades.length;
    const pledgeItemCount = itemStmts.length;

    // --- Log change history ---
    console.log(`[hangar-sync] Sync complete: ${imported} ships, ${paintCount} paints, ${skippedItems.length} skipped ships, ${skippedPaints.length} skipped paints, ${buybackCount} buyback (${buybackMatched} matched), ${upgradeCount} upgrades, ${pledgeStmts.length} pledges, ${pledgeItemCount} items`);
    logEvent("hangar_sync", {
      imported,
      paint_count: paintCount,
      skipped: skippedItems.length,
      skipped_paints: skippedPaints.length,
      buyback_count: buybackCount,
      buyback_matched: buybackMatched,
      upgrade_count: upgradeCount,
      pledge_count: pledgeStmts.length,
      pledge_item_count: pledgeItemCount,
      has_profile: hasProfile,
      anomalous: isAnomalous,
      extension_version: payload.sync_meta.extension_version,
    });
    await logUserChange(db, userID, "hangar_synced", {
      metadata: {
        vehicle_count: imported,
        paint_count: paintCount,
        skipped_count: skippedItems.length,
        skipped_paints: skippedPaints.length,
        buyback_count: buybackCount,
        buyback_matched: buybackMatched,
        upgrade_count: upgradeCount,
        pledge_count: pledgeStmts.length,
        pledge_item_count: pledgeItemCount,
        extension_version: payload.sync_meta.extension_version,
      },
      ipAddress: clientIP,
    });

    return c.json({
      imported,
      paint_count: paintCount,
      skipped: skippedItems.length,
      skipped_items: skippedItems.slice(0, 20),
      skipped_paints: skippedPaints.slice(0, 20),
      buyback_count: buybackCount,
      buyback_matched: buybackMatched,
      upgrade_count: upgradeCount,
      pledge_count: pledgeStmts.length,
      pledge_item_count: pledgeItemCount,
      has_profile: hasProfile,
      message: "Hangar sync complete",
    });
   } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? err.stack?.slice(0, 500) : "";
    console.error("[hangar-sync] Unhandled error:", errMsg, errStack);
    return c.json({ error: "Sync failed — please try again" }, 500);
   }
  });

  return routes;
}
