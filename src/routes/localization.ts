import { Hono } from "hono";
import { z } from "zod";
import { getAuthUser, type HonoEnv } from "../lib/types";
import { getActiveChannel, isPTUChannel, resolveTable } from "../lib/ptu";
import { validate } from "../lib/validation";
import {
  type AsopEntry,
  type ItemRow,
  type LabelOverride,
  type LocalizationConfig,
  ALL_LABEL_FIELDS,
  DEFAULT_CONFIG,
  configFromRow,
  diffGlobalIni,
  generateAsopOverrides,
  generateItemLabels,
  generateContrabandWarnings,
  generateMaterialShortNames,
  generateContractOverrides,
  type ContractRow,
  humanizeComponentType,
  missileSeekerCode,
  parseIniOverrides,
  resolveCategoryFormat,
  searchGlobalIniKeys,
  applyCategoryPacks,
  mergeGlobalIniBytes,
} from "../lib/localization";

/**
 * /api/localization/* — Localization Builder endpoints
 */
export function localizationRoutes() {
  const routes = new Hono<HonoEnv>();

  // ── GET /config — user's localization preferences ──────────────────

  routes.get("/config", async (c) => {
    const db = c.env.DB;
    const userId = getAuthUser(c).id;

    const row = await db
      .prepare("SELECT * FROM user_localization_configs WHERE user_id = ?")
      .bind(userId)
      .first();

    return c.json(row ? configFromRow(row) : DEFAULT_CONFIG);
  });

  // ── GET /diff — what's changed between two patch versions ─────────
  //
  // Returns key-level deltas (added / removed / changed) between two
  // global.ini files stored in KV. Powers the "What's changed in
  // <version>" panel on the Localization page so users can see what
  // shifted before downloading their merged file.
  //
  // Without query params: from = previous LIVE version, to = current
  // default LIVE version (the most natural patch-bump comparison).
  // With ?from=&to= : explicit pair, useful for cross-comparisons.

  routes.get("/diff",
    validate("query", z.object({
      from: z.string().min(1).max(100).optional(),
      to: z.string().min(1).max(100).optional(),
    })),
    async (c) => {
      const { from, to } = c.req.valid("query");
      const db = c.env.DB;
      const kv = c.env.LOCALIZATION_KV;

      let fromCode = from;
      let toCode = to;

      if (!fromCode || !toCode) {
        // Auto-resolve: current default and the LIVE version immediately
        // before it (highest id below the current default's id).
        const cur = await db
          .prepare("SELECT id, code FROM game_versions WHERE channel = 'LIVE' AND is_default = 1 LIMIT 1")
          .first<{ id: number; code: string }>();
        if (!cur) return c.json({ error: "No default LIVE version set" }, 404);

        const prev = await db
          .prepare(
            "SELECT code FROM game_versions WHERE channel = 'LIVE' AND id < ? ORDER BY id DESC LIMIT 1",
          )
          .bind(cur.id)
          .first<{ code: string }>();
        if (!prev) return c.json({ error: "No previous LIVE version to compare against" }, 404);

        toCode = toCode ?? cur.code;
        fromCode = fromCode ?? prev.code;
      }

      // Load both INIs from KV in parallel.
      const [fromIni, toIni] = await Promise.all([
        kv.get(`localization:global-ini:${fromCode}`),
        kv.get(`localization:global-ini:${toCode}`),
      ]);
      if (fromIni === null) {
        return c.json({ error: `No global.ini in KV for ${fromCode}` }, 404);
      }
      if (toIni === null) {
        return c.json({ error: `No global.ini in KV for ${toCode}` }, 404);
      }

      const diff = diffGlobalIni(fromIni, toIni);
      return c.json({
        from: fromCode,
        to: toCode,
        added_count: diff.added.length,
        removed_count: diff.removed.length,
        changed_count: diff.changed.length,
        ...diff,
      });
    },
  );

  // ── PUT /config — save preferences ────────────────────────────────

  routes.put(
    "/config",
    validate(
      "json",
      z.object({
        asopEnabled: z.boolean().optional(),
        labelsVehicleComponents: z.boolean().optional(),
        labelsFpsWeapons: z.boolean().optional(),
        labelsFpsArmour: z.boolean().optional(),
        labelsFpsHelmets: z.boolean().optional(),
        labelsFpsAttachments: z.boolean().optional(),
        labelsFpsUtilities: z.boolean().optional(),
        labelsConsumables: z.boolean().optional(),
        labelsShipMissiles: z.boolean().optional(),
        labelFormat: z.enum(["suffix", "prefix"]).optional(),
        categoryFormats: z.record(z.string(), z.object({
          fields: z.array(z.enum(ALL_LABEL_FIELDS)),
          format: z.enum(["suffix", "prefix"]),
        })).optional(),
        enabledPacks: z.array(z.string().max(100)).max(50).optional(),
        categoryPacks: z.record(z.string().max(50), z.string().max(100)).optional(),
        enhanceContrabandWarnings: z.boolean().optional(),
        enhanceMaterialNames: z.boolean().optional(),
        enhanceBlueprintPools: z.boolean().optional(),
        enhanceContractRep: z.boolean().optional(),
      }),
    ),
    async (c) => {
      const db = c.env.DB;
      const userId = getAuthUser(c).id;
      const body = c.req.valid("json");

      const categoryFormatsJson = body.categoryFormats
        ? JSON.stringify(body.categoryFormats)
        : null;

      const enabledPacksJson = body.enabledPacks
        ? JSON.stringify(body.enabledPacks)
        : null;

      const categoryPacksJson = body.categoryPacks
        ? JSON.stringify(body.categoryPacks)
        : null;

      await db
        .prepare(
          `INSERT INTO user_localization_configs (
            user_id, asop_enabled,
            labels_vehicle_components, labels_fps_weapons, labels_fps_armour,
            labels_fps_helmets, labels_fps_attachments, labels_fps_utilities,
            labels_consumables, labels_ship_missiles, label_format,
            category_formats_json, enabled_packs_json, category_packs_json,
            enhance_contraband_warnings, enhance_material_names, enhance_blueprint_pools,
            enhance_contract_rep,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(user_id) DO UPDATE SET
            asop_enabled = excluded.asop_enabled,
            labels_vehicle_components = excluded.labels_vehicle_components,
            labels_fps_weapons = excluded.labels_fps_weapons,
            labels_fps_armour = excluded.labels_fps_armour,
            labels_fps_helmets = excluded.labels_fps_helmets,
            labels_fps_attachments = excluded.labels_fps_attachments,
            labels_fps_utilities = excluded.labels_fps_utilities,
            labels_consumables = excluded.labels_consumables,
            labels_ship_missiles = excluded.labels_ship_missiles,
            label_format = excluded.label_format,
            category_formats_json = COALESCE(excluded.category_formats_json, user_localization_configs.category_formats_json),
            enabled_packs_json = COALESCE(excluded.enabled_packs_json, user_localization_configs.enabled_packs_json),
            category_packs_json = COALESCE(excluded.category_packs_json, user_localization_configs.category_packs_json),
            enhance_contraband_warnings = excluded.enhance_contraband_warnings,
            enhance_material_names = excluded.enhance_material_names,
            enhance_blueprint_pools = excluded.enhance_blueprint_pools,
            enhance_contract_rep = excluded.enhance_contract_rep,
            updated_at = excluded.updated_at`,
        )
        .bind(
          userId,
          body.asopEnabled ? 1 : 0,
          body.labelsVehicleComponents ? 1 : 0,
          body.labelsFpsWeapons ? 1 : 0,
          body.labelsFpsArmour ? 1 : 0,
          body.labelsFpsHelmets ? 1 : 0,
          body.labelsFpsAttachments ? 1 : 0,
          body.labelsFpsUtilities ? 1 : 0,
          body.labelsConsumables ? 1 : 0,
          body.labelsShipMissiles ? 1 : 0,
          body.labelFormat ?? "suffix",
          categoryFormatsJson,
          enabledPacksJson,
          categoryPacksJson,
          body.enhanceContrabandWarnings ? 1 : 0,
          body.enhanceMaterialNames ? 1 : 0,
          body.enhanceBlueprintPools ? 1 : 0,
          body.enhanceContractRep ? 1 : 0,
        )
        .run();

      return c.json({ ok: true });
    },
  );

  // ── GET /ship-order — user's ASOP ordering ────────────────────────

  routes.get("/ship-order", async (c) => {
    const isPTU = isPTUChannel(getActiveChannel(c));
    const t = (n: string) => resolveTable(n, isPTU);
    const db = c.env.DB;
    const userId = getAuthUser(c).id;

    const rows = await db
      .prepare(`SELECT o.vehicle_id, o.sort_position, o.custom_label, v.name as vehicle_name, v.class_name
         FROM user_localization_ship_order o
         JOIN ${t("vehicles")} v ON v.id = o.vehicle_id
         WHERE o.user_id = ?
         ORDER BY o.sort_position`,
      )
      .bind(userId)
      .all();

    return c.json({ items: rows.results });
  });

  // ── PUT /ship-order — save ASOP ordering ──────────────────────────

  routes.put(
    "/ship-order",
    validate(
      "json",
      z.object({
        items: z
          .array(
            z.object({
              vehicleId: z.number().int().positive(),
              sortPosition: z.number().int().positive(),
              customLabel: z.string().max(100).nullable().optional(),
            }),
          )
          .max(500),
      }),
    ),
    async (c) => {
      const db = c.env.DB;
      const userId = getAuthUser(c).id;
      const { items } = c.req.valid("json");

      // Full replace: delete then insert
      const stmts: D1PreparedStatement[] = [
        db
          .prepare("DELETE FROM user_localization_ship_order WHERE user_id = ?")
          .bind(userId),
      ];

      for (const item of items) {
        stmts.push(
          db
            .prepare(
              `INSERT INTO user_localization_ship_order (user_id, vehicle_id, sort_position, custom_label)
               VALUES (?, ?, ?, ?)`,
            )
            .bind(userId, item.vehicleId, item.sortPosition, item.customLabel ?? null),
        );
      }

      await db.batch(stmts);
      return c.json({ ok: true });
    },
  );

  // ── GET /overlay-packs — list active overlay packs ─────────────────

  routes.get("/overlay-packs", async (c) => {
    const db = c.env.DB;
    const rows = await db
      .prepare(
        `SELECT name, label, description, icon, key_count, version_code
         FROM localization_overlay_packs
         WHERE is_active = 1
         ORDER BY sort_order`,
      )
      .all<{
        name: string;
        label: string;
        description: string | null;
        icon: string | null;
        key_count: number;
        version_code: string | null;
      }>();

    return c.json({
      packs: rows.results.map((r) => ({
        name: r.name,
        label: r.label,
        description: r.description,
        icon: r.icon,
        keyCount: r.key_count,
        versionCode: r.version_code,
      })),
    });
  });

  // ── GET /keys — Key Browser: paginated search over the base global.ini ─
  //
  // Searches the default version's base global.ini (key OR value substring)
  // and returns one page of {key, value}. When the user has community packs
  // enabled, the effective pack override value for a matched key is attached
  // as `override` so they can see what their build would actually ship.

  routes.get(
    "/keys",
    validate(
      "query",
      z.object({
        q: z.string().max(200).optional(),
        offset: z.coerce.number().int().min(0).max(5_000_000).optional(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
      }),
    ),
    async (c) => {
      const db = c.env.DB;
      const kv = c.env.LOCALIZATION_KV;
      const userId = getAuthUser(c).id;
      const { q, offset, limit } = c.req.valid("query");

      const ver = await db
        .prepare("SELECT code FROM game_versions WHERE is_default = 1 LIMIT 1")
        .first<{ code: string }>();
      if (!ver) return c.json({ error: "No default game version configured" }, 500);

      const base = await kv.get(`localization:global-ini:${ver.code}`);
      if (base === null) {
        return c.json({ error: "Base localization file not available for this version" }, 404);
      }

      const result = searchGlobalIniKeys(base, { q, offset, limit });

      const configRow = await db
        .prepare("SELECT enabled_packs_json FROM user_localization_configs WHERE user_id = ?")
        .bind(userId)
        .first();
      const config = configRow ? configFromRow(configRow) : DEFAULT_CONFIG;

      // Load ALL active packs once, keeping each pack's values SEPARATE (for
      // cross-pack compare). The effective override is then computed from the
      // user's enabled subset, by sort_order (last wins).
      const activePacks = await db
        .prepare("SELECT name, label FROM localization_overlay_packs WHERE is_active = 1 ORDER BY sort_order")
        .all<{ name: string; label: string }>();
      const packMaps: { name: string; label: string; map: Map<string, string> }[] = [];
      for (const p of activePacks.results) {
        const content = await kv.get(`localization:pack:${p.name}:${ver.code}`, "text");
        const map = new Map<string, string>();
        if (content) for (const [k, v] of parseIniOverrides(content)) map.set(k.toLowerCase(), v);
        packMaps.push({ name: p.name, label: p.label, map });
      }

      const enabled = new Set(config.enabledPacks);
      const overrideMap = new Map<string, string>();
      for (const pm of packMaps) {
        if (enabled.has(pm.name)) for (const [k, v] of pm.map) overrideMap.set(k, v);
      }

      // The user's own ad-hoc overrides ("My Customizations"), shown per row.
      const userOvRows = await db
        .prepare("SELECT loc_key, value FROM user_localization_overrides WHERE user_id = ?")
        .bind(userId)
        .all<{ loc_key: string; value: string }>();
      const userOv = new Map(userOvRows.results.map((r) => [r.loc_key.toLowerCase(), r.value]));

      const items = result.items.map((it) => {
        const lk = it.key.toLowerCase();
        const out: {
          key: string;
          value: string;
          override?: string;
          userOverride?: string;
          packs?: { name: string; label: string; value: string }[];
        } = { key: it.key, value: it.value };
        const ov = overrideMap.get(lk);
        if (ov !== undefined) out.override = ov;
        const uo = userOv.get(lk);
        if (uo !== undefined) out.userOverride = uo;
        // Per-pack values for this key (cross-pack compare).
        const packs = packMaps
          .filter((pm) => pm.map.has(lk))
          .map((pm) => ({ name: pm.name, label: pm.label, value: pm.map.get(lk)! }));
        if (packs.length > 0) out.packs = packs;
        return out;
      });

      return c.json({
        version: ver.code,
        total: result.total,
        offset: offset ?? 0,
        limit: limit ?? 50,
        items,
        userOverrideTotal: userOv.size,
      });
    },
  );

  // ── PUT /override — save an ad-hoc single-key override ────────────────
  routes.put(
    "/override",
    validate("json", z.object({
      key: z.string().min(1).max(300),
      value: z.string().max(5000),
    })),
    async (c) => {
      const db = c.env.DB;
      const userId = getAuthUser(c).id;
      const { key, value } = c.req.valid("json");
      await db
        .prepare(
          `INSERT INTO user_localization_overrides (user_id, loc_key, value, updated_at)
           VALUES (?, ?, ?, datetime('now'))
           ON CONFLICT(user_id, loc_key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        )
        .bind(userId, key, value)
        .run();
      return c.json({ ok: true });
    },
  );

  // ── DELETE /override — reset a single-key override ────────────────────
  routes.delete(
    "/override",
    validate("query", z.object({ key: z.string().min(1).max(300) })),
    async (c) => {
      const db = c.env.DB;
      const userId = getAuthUser(c).id;
      const { key } = c.req.valid("query");
      await db
        .prepare("DELETE FROM user_localization_overrides WHERE user_id = ? AND loc_key = ?")
        .bind(userId, key)
        .run();
      return c.json({ ok: true });
    },
  );

  // ── DELETE /overrides — clear ALL of the user's ad-hoc overrides ──────
  routes.delete("/overrides", async (c) => {
    const db = c.env.DB;
    const userId = getAuthUser(c).id;
    const res = await db
      .prepare("DELETE FROM user_localization_overrides WHERE user_id = ?")
      .bind(userId)
      .run();
    return c.json({ ok: true, cleared: res.meta.changes ?? 0 });
  });

  // ── POST /import — import a custom global.ini as personal overrides ────
  //
  // Diffs the uploaded file against the base global.ini and imports only the
  // CHANGED keys (the user's actual customizations) into
  // user_localization_overrides. Added keys (not in base) are ignored — they
  // wouldn't match anything on merge. Large diffs are rejected (use a pack).
  routes.post("/import", async (c) => {
    const db = c.env.DB;
    const kv = c.env.LOCALIZATION_KV;
    const userId = getAuthUser(c).id;

    const uploaded = await c.req.text();
    if (!uploaded || uploaded.length < 5) {
      return c.json({ error: "Empty or too-small file" }, 400);
    }

    const ver = await db
      .prepare("SELECT code FROM game_versions WHERE is_default = 1 LIMIT 1")
      .first<{ code: string }>();
    if (!ver) return c.json({ error: "No default game version configured" }, 500);
    const base = await kv.get(`localization:global-ini:${ver.code}`);
    if (base === null) {
      return c.json({ error: "Base localization file not available for this version" }, 404);
    }

    const diff = diffGlobalIni(base, uploaded);
    const IMPORT_MAX = 2000;
    if (diff.changed.length > IMPORT_MAX) {
      return c.json(
        { error: `Too many changes (${diff.changed.length}). For large sets, publish a community pack instead.` },
        413,
      );
    }
    if (diff.changed.length === 0) {
      return c.json({ ok: true, imported: 0, message: "No changes vs the base file." });
    }

    // Upsert in chunks to stay within D1 batch limits.
    const rows = diff.changed;
    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100);
      await db.batch(
        chunk.map((ch) =>
          db
            .prepare(
              `INSERT INTO user_localization_overrides (user_id, loc_key, value, updated_at)
               VALUES (?, ?, ?, datetime('now'))
               ON CONFLICT(user_id, loc_key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
            )
            .bind(userId, ch.key, ch.newValue),
        ),
      );
    }

    return c.json({ ok: true, imported: rows.length });
  });

  // ── POST /pack-request — user requests a community pack by link ───────
  //
  // Records the request (operational, no user_id stored — see migration 0245)
  // and best-effort notifies Discord via an incoming webhook if configured.
  routes.post(
    "/pack-request",
    validate("json", z.object({
      url: z.string().url().max(1000),
      note: z.string().max(1000).optional(),
    })),
    async (c) => {
      const db = c.env.DB;
      const kv = c.env.LOCALIZATION_KV;
      const user = getAuthUser(c);
      const { url, note } = c.req.valid("json");

      // Per-user hourly cap (defense-in-depth against spam to the table +
      // Discord webhook). Transient KV counter with a 1-hour TTL — not user
      // content, so it's outside the GDPR cascade.
      const PACK_REQUEST_HOURLY_LIMIT = 10;
      const rlKey = `ratelimit:packreq:${user.id}`;
      const count = parseInt((await kv.get(rlKey)) || "0", 10);
      if (count >= PACK_REQUEST_HOURLY_LIMIT) {
        return c.json({ error: "Too many pack requests — try again later." }, 429);
      }
      await kv.put(rlKey, String(count + 1), { expirationTtl: 3600 });

      await db
        .prepare("INSERT INTO pack_requests (url, note) VALUES (?, ?)")
        .bind(url, note ?? null)
        .run();

      // Best-effort Discord notification — never fails the request.
      const hook = c.env.DISCORD_PACK_REQUEST_WEBHOOK;
      if (hook) {
        try {
          await fetch(hook, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: `📦 **Localization pack request**\nFrom: ${user.name || user.id}\nLink: ${url}${note ? `\nNote: ${note}` : ""}`,
            }),
          });
        } catch {
          /* notification is best-effort; the request is already recorded */
        }
      }

      return c.json({ ok: true });
    },
  );

  // ── GET /preview — preview override key/value pairs ───────────────

  routes.get("/preview", async (c) => {
    const isPTU = isPTUChannel(getActiveChannel(c));
    const db = c.env.DB;
    const kv = c.env.LOCALIZATION_KV;
    const userId = getAuthUser(c).id;

    const configRow = await db
      .prepare("SELECT * FROM user_localization_configs WHERE user_id = ?")
      .bind(userId)
      .first();

    const config: LocalizationConfig = configRow
      ? configFromRow(configRow)
      : DEFAULT_CONFIG;

    // Get default version for pack loading
    const ver = await db
      .prepare("SELECT code FROM game_versions WHERE is_default = 1 LIMIT 1")
      .first<{ code: string }>();

    // Load pack overrides
    let packOverrideCount = 0;
    const packOverrides = new Map<string, string>();
    if (ver && config.enabledPacks.length > 0) {
      const packRows = await db
        .prepare(
          `SELECT name FROM localization_overlay_packs
           WHERE is_active = 1 AND name IN (${config.enabledPacks.map(() => "?").join(",")})
           ORDER BY sort_order`,
        )
        .bind(...config.enabledPacks)
        .all<{ name: string }>();

      for (const pack of packRows.results) {
        const content = await kv.get(`localization:pack:${pack.name}:${ver.code}`, "text");
        if (content) {
          const parsed = parseIniOverrides(content);
          for (const [k, v] of parsed) packOverrides.set(k, v);
        }
      }
      packOverrideCount = packOverrides.size;
    }

    const personalOverrides = await buildOverrides(db, userId, config, undefined, isPTU);

    return c.json({
      config,
      overrides: personalOverrides.map((o) => ({
        key: o.key,
        value: o.value,
        original: o.original,
        source: "personal",
      })),
      personalCount: personalOverrides.length,
      packOverrideCount,
      totalCount: packOverrideCount + personalOverrides.length,
    });
  });

  // ── GET /download — generate and download merged global.ini ───────

  routes.get("/download", async (c) => {
    const isPTU = isPTUChannel(getActiveChannel(c));
    const db = c.env.DB;
    const kv = c.env.LOCALIZATION_KV;
    const userId = getAuthUser(c).id;

    // Get default game version code
    const ver = await db
      .prepare("SELECT code FROM game_versions WHERE is_default = 1 LIMIT 1")
      .first<{ code: string }>();
    if (!ver) {
      return c.json({ error: "No default game version configured" }, 500);
    }

    // Read base global.ini from KV as raw bytes.
    // The file has mixed encoding (UTF-8 BOM + stray latin-1 0xA0 bytes).
    // We work at the byte level: only extract ASCII keys for matching,
    // output untouched lines byte-for-byte, and only rewrite matched lines.
    const rawBuf = await kv.get(`localization:global-ini:${ver.code}`, "arrayBuffer");
    if (!rawBuf) {
      return c.json(
        { error: "Base localization file not available for this version" },
        404,
      );
    }
    const raw = new Uint8Array(rawBuf);

    // Build overrides from user config
    const configRow = await db
      .prepare("SELECT * FROM user_localization_configs WHERE user_id = ?")
      .bind(userId)
      .first();

    const config: LocalizationConfig = configRow
      ? configFromRow(configRow)
      : DEFAULT_CONFIG;

    // Extract ASCII keys from the raw bytes for valid-key checking.
    // Keys are always ASCII (before the '=' byte), so this is safe.
    // Map is lowercase → original key for case-insensitive lookups.
    const validKeys = new Map<string, string>();
    {
      let lineStart = 0;
      for (let i = 0; i <= raw.length; i++) {
        if (i === raw.length || raw[i] === 0x0A) {
          // Extract key from this line (bytes before '=')
          for (let j = lineStart; j < i; j++) {
            if (raw[j] === 0x3D) { // '='
              let end = j;
              while (end > lineStart && raw[end - 1] === 0x20) end--; // trim spaces
              const keyBytes = raw.slice(lineStart, end);
              // Skip BOM at start of file
              const keyStr = String.fromCharCode(...(keyBytes[0] === 0xEF ? keyBytes.slice(3) : keyBytes));
              validKeys.set(keyStr.toLowerCase(), keyStr);
              break;
            }
          }
          lineStart = i + 1;
        }
      }
    }

    // Three-layer merge: base → packs → personal overrides
    // 1. Load enabled pack overrides (lowest priority of overrides), then
    //    apply per-category pack assignments (a category's assigned pack wins
    //    for keys in that category). Both load from the set of packs referenced
    //    by either enabledPacks or categoryPacks.
    const overrideMap = new Map<string, string>();

    const referencedPacks = new Set<string>([
      ...config.enabledPacks,
      ...Object.values(config.categoryPacks),
    ]);
    const packEntries: Record<string, Map<string, string>> = {};
    if (referencedPacks.size > 0) {
      const names = [...referencedPacks];
      const packRows = await db
        .prepare(
          `SELECT name FROM localization_overlay_packs
           WHERE is_active = 1 AND name IN (${names.map(() => "?").join(",")})
           ORDER BY sort_order`,
        )
        .bind(...names)
        .all<{ name: string }>();

      for (const pack of packRows.results) {
        const content = await kv.get(`localization:pack:${pack.name}:${ver.code}`, "text");
        const map = new Map<string, string>();
        if (content) for (const [k, v] of parseIniOverrides(content)) map.set(k.toLowerCase(), v);
        packEntries[pack.name] = map;
        // Wholesale: enabled packs apply across all keys (by sort_order).
        if (config.enabledPacks.includes(pack.name)) {
          for (const [k, v] of map) overrideMap.set(k, v);
        }
      }
    }
    // Per-category assignment wins over the wholesale merge for its category.
    applyCategoryPacks(overrideMap, config.categoryPacks, packEntries);

    // 2. Generate personal overrides (highest priority — overwrites packs)
    // All overrideMap keys are lowercased for case-insensitive merge.
    const overrideList = await buildOverrides(db, userId, config, validKeys, isPTU);
    for (const o of overrideList) {
      overrideMap.set(o.key.toLowerCase(), o.value);
    }

    const output = mergeGlobalIniBytes(raw, overrideMap);

    return new Response(output, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="global.ini"`,
        "Cache-Control": "no-store",
      },
    });
  });

  return routes;
}

// ---------------------------------------------------------------------------
// Shared: build all overrides from config + DB data
// ---------------------------------------------------------------------------

async function buildOverrides(
  db: D1Database,
  userId: string,
  config: LocalizationConfig,
  validKeys?: Map<string, string>,
  isPTU = false,
): Promise<LabelOverride[]> {
  const overrides: LabelOverride[] = [];
  const t = (n: string) => resolveTable(n, isPTU);

  // ASOP ordering
  if (config.asopEnabled) {
    const rows = await db
      .prepare(
        `SELECT o.vehicle_id, o.sort_position, o.custom_label, v.name as vehicle_name, v.class_name
         FROM user_localization_ship_order o
         JOIN ${t("vehicles")} v ON v.id = o.vehicle_id
         WHERE o.user_id = ?
         ORDER BY o.sort_position`,
      )
      .bind(userId)
      .all<{
        vehicle_id: number;
        sort_position: number;
        custom_label: string | null;
        vehicle_name: string;
        class_name: string;
      }>();

    const entries: AsopEntry[] = rows.results.map((r) => ({
      vehicleId: r.vehicle_id,
      className: r.class_name,
      vehicleName: r.vehicle_name,
      sortPosition: r.sort_position,
      customLabel: r.custom_label,
    }));

    overrides.push(...generateAsopOverrides(entries));
  }

  // Item labels — query each enabled category
  const categoryQueries: Array<{
    enabled: boolean;
    table: string;
    hasGrade: boolean;
  }> = [
    { enabled: config.labelsVehicleComponents, table: "vehicle_components", hasGrade: true },
    { enabled: config.labelsFpsWeapons, table: "fps_weapons", hasGrade: false },
    { enabled: config.labelsFpsArmour, table: "fps_armour", hasGrade: true },
    { enabled: config.labelsFpsHelmets, table: "fps_helmets", hasGrade: true },
    { enabled: config.labelsFpsAttachments, table: "fps_attachments", hasGrade: false },
    { enabled: config.labelsFpsUtilities, table: "fps_utilities", hasGrade: false },
    { enabled: config.labelsConsumables, table: "consumables", hasGrade: false },
    { enabled: config.labelsShipMissiles, table: "ship_missiles", hasGrade: false },
  ];

  for (const cat of categoryQueries) {
    if (!cat.enabled) continue;

    const gradeCol = cat.hasGrade ? "t.grade" : "NULL as grade";
    const tablesWithoutSize = ["consumables", "fps_utilities"];
    const sizeCol = tablesWithoutSize.includes(cat.table) ? "NULL as size" : "t.size";
    // Only ship_missiles carries a seeker (tracking_signal); others select NULL.
    const seekerCol = cat.table === "ship_missiles" ? "t.tracking_signal" : "NULL as tracking_signal";
    // Only vehicle_components carries a component_class (Military/Stealth/…); others select NULL.
    const classCol = cat.table === "vehicle_components" ? "t.component_class" : "NULL as component_class";
    // Only vehicle_components has a `type` column (fallback when sub_type is "UNDEFINED"); others select NULL.
    const typeCol = cat.table === "vehicle_components" ? "t.type" : "NULL as type";

    const rows = await db
      .prepare(
        `SELECT t.class_name, t.name, m.code as manufacturer_code,
                ${sizeCol}, ${gradeCol}, t.sub_type, ${seekerCol}, ${classCol}, ${typeCol}
         FROM ${cat.table} t
         LEFT JOIN manufacturers m ON m.id = t.manufacturer_id
         WHERE t.is_deleted = 0
         AND t.class_name IS NOT NULL`,
      )
      .all<{
        class_name: string;
        name: string;
        manufacturer_code: string | null;
        size: number | null;
        grade: string | null;
        sub_type: string | null;
        tracking_signal: string | null;
        component_class: string | null;
        type: string | null;
      }>();

    const itemRows: ItemRow[] = rows.results.map((r) => ({
      className: r.class_name,
      name: r.name,
      manufacturerCode: r.manufacturer_code,
      size: r.size,
      grade: r.grade,
      subType: r.sub_type,
      seeker: missileSeekerCode(r.tracking_signal),
      componentClass: r.component_class,
      type: r.type,
    }));

    const catFormat = resolveCategoryFormat(config, cat.table);
    overrides.push(...generateItemLabels(itemRows, catFormat, validKeys));
  }

  // ── Enhancements ──────────────────────────────────────────────────

  // Contraband warnings: prefix illegal commodity names with [!]
  if (config.enhanceContrabandWarnings) {
    const rows = await db
      .prepare(
        `SELECT class_name, name FROM ${t("trade_commodities")}
         WHERE category IN ('vice', 'counterfeit')
         AND is_deleted = 0
         AND class_name IS NOT NULL`,
      )
      .all<{ class_name: string; name: string }>();

    overrides.push(
      ...generateContrabandWarnings(
        rows.results.map((r) => ({ className: r.class_name, name: r.name })),
        validKeys,
      ),
    );
  }

  // Material name shortening: shorten verbose mining material names
  if (config.enhanceMaterialNames) {
    // Query both trade commodities (minerals/metals) and mineable elements
    const tradeRows = await db
      .prepare(
        `SELECT class_name, name FROM ${t("trade_commodities")}
         WHERE category IN ('minerals', 'metals', 'mixedmining')
         AND is_deleted = 0
         AND class_name IS NOT NULL`,
      )
      .all<{ class_name: string; name: string }>();

    const mineableRows = await db
      .prepare(
        `SELECT class_name, name FROM ${t("mineable_elements")}
         WHERE is_deleted = 0
         AND class_name IS NOT NULL`,
      )
      .all<{ class_name: string; name: string }>();

    const allMaterialRows = [
      ...tradeRows.results.map((r) => ({ className: r.class_name, name: r.name })),
      ...mineableRows.results.map((r) => ({ className: r.class_name, name: r.name })),
    ];

    overrides.push(...generateMaterialShortNames(allMaterialRows, validKeys));
  }

  // Contract enhancements: reputation labels and/or blueprint pools. Both are
  // independent toggles, fed as one row set into generateContractOverrides so
  // they never double-write a shared title/description key.
  if (config.enhanceBlueprintPools || config.enhanceContractRep) {
    const contractRows: ContractRow[] = [];

    // Blueprint pools: append reward lists to descriptions + [BP] to titles.
    // Names resolve across FPS gear AND ship components. The blueprint tag is
    // mixed-case (BP_CRAFT_Mining_Laser_THCN_Helix_S0) while class_names are
    // stored lowercase, so we lower() the tag side only — this keeps the join
    // index-friendly (bare column) and recovers the ~40% of pool entries
    // (mining lasers, salvage modifiers, radars, …) that previously fell
    // through to the raw, de-camelCased tag name. Pools stay separated.
    // Nested REPLACE strips BP_CRAFT_ OR a leading BP_ — 1563/1564 tags use
    // BP_CRAFT_, but one (BP_HRST_LaserScatterGun_S2) uses BP_<MFR>_; stripping
    // just BP_ leaves the mfr-prefixed class_name (hrst_laserscattergun_s2).
    if (config.enhanceBlueprintPools) {
      const bpRows = await db
        .prepare(
          `SELECT cgc.title_loc_key, cgc.desc_loc_key, cgc.rep_reward,
                  cgbp.crafting_blueprint_reward_pool_id AS pool_key,
                  COALESCE(fw.name, fa.name, fh.name, fam.name, vc.name, cb.name) AS blueprint_name,
                  CASE WHEN fw.name IS NULL AND fa.name IS NULL AND fh.name IS NULL
                            AND fam.name IS NULL AND vc.name IS NOT NULL
                       THEN vc.type END AS component_type
           FROM ${t("contract_generator_blueprint_pools")} cgbp
           JOIN ${t("contract_generator_contracts")} cgc ON cgc.id = cgbp.contract_generator_contract_id
           JOIN ${t("crafting_blueprint_reward_pool_items")} cbri ON cbri.crafting_blueprint_reward_pool_id = cgbp.crafting_blueprint_reward_pool_id
           JOIN ${t("crafting_blueprints")} cb ON cb.id = cbri.crafting_blueprint_id
           LEFT JOIN ${t("fps_weapons")} fw ON fw.class_name = LOWER(REPLACE(REPLACE(cb.tag, 'BP_CRAFT_', ''), 'BP_', '')) AND fw.is_deleted = 0
           LEFT JOIN ${t("fps_armour")} fa ON fa.class_name = LOWER(REPLACE(REPLACE(cb.tag, 'BP_CRAFT_', ''), 'BP_', '')) AND fa.is_deleted = 0
           LEFT JOIN ${t("fps_helmets")} fh ON fh.class_name = LOWER(REPLACE(REPLACE(cb.tag, 'BP_CRAFT_', ''), 'BP_', '')) AND fh.is_deleted = 0
           LEFT JOIN ${t("fps_ammo_types")} fam ON fam.class_name = LOWER(REPLACE(REPLACE(cb.tag, 'BP_CRAFT_', ''), 'BP_', '')) AND fam.is_deleted = 0
           LEFT JOIN ${t("vehicle_components")} vc ON vc.class_name = LOWER(REPLACE(REPLACE(cb.tag, 'BP_CRAFT_', ''), 'BP_', '')) AND vc.is_deleted = 0
           WHERE cgc.is_deleted = 0
           AND cgc.desc_loc_key IS NOT NULL AND cgc.desc_loc_key != ''`,
        )
        .all<{
          title_loc_key: string | null;
          desc_loc_key: string | null;
          rep_reward: number | null;
          pool_key: number;
          blueprint_name: string;
          component_type: string | null;
        }>();

      for (const r of bpRows.results) {
        contractRows.push({
          titleLocKey: r.title_loc_key || "",
          descLocKey: r.desc_loc_key || "",
          repReward: r.rep_reward,
          poolKey: String(r.pool_key),
          blueprintName: r.blueprint_name,
          componentType: humanizeComponentType(r.component_type),
        });
      }
    }

    // Reputation labels on ALL rep-awarding contracts (rep-only rows; the Set
    // in the renderer dedupes against rep already contributed by BP rows).
    if (config.enhanceContractRep) {
      const repRows = await db
        .prepare(
          `SELECT title_loc_key, desc_loc_key, rep_reward
           FROM ${t("contract_generator_contracts")}
           WHERE is_deleted = 0 AND rep_reward IS NOT NULL
           AND (title_loc_key != '' OR desc_loc_key != '')`,
        )
        .all<{ title_loc_key: string | null; desc_loc_key: string | null; rep_reward: number | null }>();

      for (const r of repRows.results) {
        contractRows.push({
          titleLocKey: r.title_loc_key || "",
          descLocKey: r.desc_loc_key || "",
          repReward: r.rep_reward,
          poolKey: null,
          blueprintName: null,
        });
      }
    }

    overrides.push(
      ...generateContractOverrides(
        contractRows,
        { includeRep: config.enhanceContractRep, includeBlueprints: config.enhanceBlueprintPools },
        validKeys,
      ),
    );
  }

  // Per-user ad-hoc key overrides ("My Customizations"). Pushed LAST so they
  // win over community packs and generated labels — these are full-value
  // replacements the user typed in the Key Browser.
  const userOverrides = await db
    .prepare("SELECT loc_key, value FROM user_localization_overrides WHERE user_id = ?")
    .bind(userId)
    .all<{ loc_key: string; value: string }>();
  for (const o of userOverrides.results) {
    const key = validKeys ? validKeys.get(o.loc_key.toLowerCase()) ?? o.loc_key : o.loc_key;
    overrides.push({ key, value: o.value });
  }

  return overrides;
}
