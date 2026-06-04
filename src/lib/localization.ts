/**
 * Localization Builder — label generation and global.ini merge logic.
 *
 * Generates override key/value pairs for:
 *   - ASOP fleet ordering: vehicle_Name{class_name} → "N. Original Name"
 *   - Component/item labels: item_Name{class_name} → "Name [Mfr | SN | Gr.X | SubType]"
 *
 * Each label category has its own field config: which fields to include and
 * in what order. Users configure this per-category via the frontend.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LabelOverride {
  key: string;
  value: string;
  original?: string;
}

export interface AsopEntry {
  vehicleId: number;
  className: string;
  vehicleName: string;
  sortPosition: number;
  customLabel?: string | null;
}

export interface ItemRow {
  className: string;
  name: string;
  manufacturerCode: string | null;
  size: number | null;
  grade: string | null;
  subType: string | null;
  /** Short missile seeker code (EM/IR/CS); only set for ship_missiles. */
  seeker?: string | null;
  /** Component role/class (Military/Stealth/Industrial/Civilian/Competition); only set for vehicle_components. */
  componentClass?: string | null;
  /** Raw component type (vehicle_components.type, e.g. "Cooler"); fallback for the Type field when subType is "UNDEFINED". */
  type?: string | null;
}

export type LabelFormat = "suffix" | "prefix";

/**
 * Every field that can appear in a label tag. Single source of truth — the
 * save endpoint's Zod enum (src/routes/localization.ts) is built from this, so
 * adding a field here automatically keeps validation in sync.
 */
export const ALL_LABEL_FIELDS = [
  "manufacturer",
  "size",
  "grade",
  "subType",
  "seeker",
  "componentClass",
] as const;

/** A field that can appear in a label tag */
export type LabelField = (typeof ALL_LABEL_FIELDS)[number];

/** Per-category format configuration */
export interface CategoryFormat {
  fields: LabelField[];
  format: LabelFormat;
}

/** Map of category key → format config */
export type CategoryFormats = Record<string, CategoryFormat>;

// ---------------------------------------------------------------------------
// Available fields per category (what the DB actually has)
// ---------------------------------------------------------------------------

// Only fields with meaningful, varied data per category.
// Excludes: columns that don't exist on the table, columns where every row
// has the same value (e.g. grade=A only), or columns with unhelpful data.
export const CATEGORY_AVAILABLE_FIELDS: Record<string, LabelField[]> = {
  vehicle_components: ["manufacturer", "size", "grade", "subType", "componentClass"],
  fps_weapons: ["manufacturer", "size", "subType"],
  fps_armour: ["manufacturer", "subType"],
  fps_helmets: ["manufacturer", "grade", "subType"],
  fps_attachments: ["manufacturer", "subType"],
  fps_utilities: ["manufacturer", "subType"],
  consumables: ["manufacturer", "subType"],
  ship_missiles: ["seeker", "manufacturer", "size", "subType"],
};

/** Human-readable field labels */
export const FIELD_LABELS: Record<LabelField, string> = {
  manufacturer: "Manufacturer",
  size: "Size",
  grade: "Grade",
  subType: "Type",
  seeker: "Seeker",
  componentClass: "Class",
};

/** Default format for a category: all available fields, suffix format */
export function defaultCategoryFormat(category: string): CategoryFormat {
  return {
    fields: [...(CATEGORY_AVAILABLE_FIELDS[category] || [])],
    format: "suffix",
  };
}

// ---------------------------------------------------------------------------
// ASOP fleet ordering
// ---------------------------------------------------------------------------

export function generateAsopOverrides(
  entries: AsopEntry[],
): LabelOverride[] {
  const overrides: LabelOverride[] = [];
  const sorted = [...entries].sort((a, b) => a.sortPosition - b.sortPosition);
  const padWidth = sorted.length >= 10 ? 2 : 1;

  for (const entry of sorted) {
    if (!entry.className) continue;
    const pos = String(entry.sortPosition).padStart(padWidth, "0");

    // Full name: "07. Aegis Idris-P" or "07. Aegis Idris-P "James Holden""
    const fullLabel = entry.customLabel
      ? `${pos}. ${entry.vehicleName} "${entry.customLabel}"`
      : `${pos}. ${entry.vehicleName}`;

    overrides.push({
      key: `vehicle_Name${entry.className}`,
      value: fullLabel,
      original: entry.vehicleName,
    });

    // Short name: "07. Idris-P" or "07. Idris-P "James Holden""
    const short = stripManufacturer(entry.vehicleName);
    const shortLabel = entry.customLabel
      ? `${pos}. ${short} "${entry.customLabel}"`
      : `${pos}. ${short}`;

    overrides.push({
      key: `vehicle_Name${entry.className}_short`,
      value: shortLabel,
      original: short,
    });
  }

  return overrides;
}

function stripManufacturer(fullName: string): string {
  const parts = fullName.split(" ");
  return parts.length > 1 ? parts.slice(1).join(" ") : fullName;
}

// ---------------------------------------------------------------------------
// Component / item label generation
// ---------------------------------------------------------------------------

/** Build the detail tag using only the specified fields in order */
function buildDetailTag(
  row: ItemRow,
  fields: LabelField[],
): string {
  const parts: string[] = [];
  for (const field of fields) {
    switch (field) {
      case "manufacturer":
        if (row.manufacturerCode) parts.push(row.manufacturerCode);
        break;
      case "size":
        if (row.size != null) parts.push(`S${row.size}`);
        break;
      case "grade":
        if (row.grade) parts.push(`Gr.${row.grade}`);
        break;
      case "subType": {
        // CIG stores SubType="UNDEFINED" for many components (coolers, shields,
        // quantum drives); the meaningful classification lives in `type`. Use a
        // real subType, else fall back to the humanized type, else drop it.
        const typeLabel =
          row.subType && row.subType !== "UNDEFINED"
            ? row.subType
            : humanizeComponentType(row.type ?? null);
        if (typeLabel) parts.push(typeLabel);
        break;
      }
      case "seeker":
        if (row.seeker) parts.push(row.seeker);
        break;
      case "componentClass":
        if (row.componentClass) parts.push(row.componentClass);
        break;
    }
  }
  return parts.join(" | ");
}

function formatLabel(
  name: string,
  detailTag: string,
  format: LabelFormat,
): string {
  if (!detailTag) return name;
  return format === "prefix" ? `[${detailTag}] ${name}` : `${name} [${detailTag}]`;
}

/**
 * Case-insensitive key resolver. validKeys maps lowercase → original key.
 * Returns the actual key from global.ini (with correct casing), or undefined.
 */
function resolveKey(candidate: string, validKeys?: Map<string, string>): string | undefined {
  if (!validKeys) return candidate;
  return validKeys.get(candidate.toLowerCase());
}

/**
 * Generate item label overrides. Only produces overrides for keys that
 * exist in validKeys (the actual global.ini key set). This prevents
 * phantom keys from colliding with unrelated entries.
 */
export function generateItemLabels(
  rows: ItemRow[],
  catFormat: CategoryFormat,
  validKeys?: Map<string, string>,
): LabelOverride[] {
  const overrides: LabelOverride[] = [];
  for (const row of rows) {
    if (!row.className) continue;
    const key = resolveKey(`item_Name${row.className}`, validKeys);
    if (!key) continue;
    const tag = buildDetailTag(row, catFormat.fields);
    overrides.push({
      key,
      value: formatLabel(row.name, tag, catFormat.format),
      original: row.name,
    });
  }
  return overrides;
}

// ---------------------------------------------------------------------------
// Enhancements — server-generated overrides from our own data
// ---------------------------------------------------------------------------

/** Contraband warnings: prefix illegal commodity names with [!] */
export function generateContrabandWarnings(
  rows: Array<{ className: string; name: string }>,
  validKeys?: Map<string, string>,
): LabelOverride[] {
  const overrides: LabelOverride[] = [];
  for (const row of rows) {
    if (!row.className) continue;
    const key = resolveKey(`items_commodities_${row.className}`, validKeys);
    if (!key) continue;
    overrides.push({
      key,
      value: `[!] ${row.name}`,
      original: row.name,
    });
  }
  return overrides;
}

/** Material name shortening map — long mining names → short versions */
const MATERIAL_SHORT_NAMES: Record<string, string> = {
  Hephaestanite: "Heph",
  Quantainium: "Quant",
  Taranite: "Tara",
  Bexalite: "Bex",
  Laranite: "Lara",
  Agricium: "Agri",
  Titanium: "Ti",
  Aluminium: "Al",
  Tungsten: "W",
  Corundum: "Corun",
  Lindinium: "Lind",
  Stileron: "Stil",
  Hadanite: "Had",
  Aphorite: "Aph",
  Dolivine: "Dol",
};

/** Shorten material/mineable element names */
export function generateMaterialShortNames(
  rows: Array<{ className: string; name: string }>,
  validKeys?: Map<string, string>,
): LabelOverride[] {
  const overrides: LabelOverride[] = [];
  for (const row of rows) {
    if (!row.className) continue;
    let shortened: string | null = null;
    for (const [long, short] of Object.entries(MATERIAL_SHORT_NAMES)) {
      if (row.name.startsWith(long)) {
        shortened = row.name.replace(long, short);
        break;
      }
    }
    if (!shortened) continue;

    const candidates = [
      `items_commodities_${row.className}`,
      `item_Name${row.className}`,
    ];
    const key = candidates.map((c) => resolveKey(c, validKeys)).find(Boolean);
    if (!key) continue;
    overrides.push({
      key,
      value: shortened,
      original: row.name,
    });
  }
  return overrides;
}

/**
 * Sentinel prefix on an override value telling the /download endpoint to
 * APPEND the remainder to the base global.ini value, rather than replace it.
 * Used for contract title/description enhancements where we can't read the
 * base string at override-generation time.
 */
export const BP_APPEND_SENTINEL = "\0BP_APPEND\0";

/**
 * PascalCase vehicle_components.type → readable noun for a blueprint's
 * "(Type)" annotation. Unmapped values fall back to a CamelCase split.
 */
const COMPONENT_TYPE_LABELS: Record<string, string> = {
  WeaponGun: "Weapon",
  WeaponMining: "Mining Laser",
  SalvageModifier: "Salvage Module",
  QuantumDrive: "Quantum Drive",
  PowerPlant: "Power Plant",
  QuantumInterdictionGenerator: "QED",
  Radar: "Radar",
  Cooler: "Cooler",
  Shield: "Shield",
  EMP: "EMP",
};

/** Humanize a vehicle_components.type value for display, or null if empty. */
export function humanizeComponentType(type: string | null): string | null {
  if (!type) return null;
  if (COMPONENT_TYPE_LABELS[type]) return COMPONENT_TYPE_LABELS[type];
  return type
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .trim();
}

/** Missile tracking_signal → short seeker tag (Electromagnetic → EM). */
const SEEKER_CODES: Record<string, string> = {
  Electromagnetic: "EM",
  Infrared: "IR",
  CrossSection: "CS",
};

/** Map a missile tracking_signal to its short seeker code, or null. */
export function missileSeekerCode(signal: string | null): string | null {
  if (!signal) return null;
  return SEEKER_CODES[signal] ?? null;
}

/** One (contract × pool × blueprint-name) row feeding contract overrides. */
export interface ContractRow {
  titleLocKey: string;
  descLocKey: string;
  repReward: number | null;
  /** Distinct pool identity for Pool 1/Pool 2 split; null on rep-only rows. */
  poolKey?: string | null;
  blueprintName?: string | null;
  /** Humanized component type for ship components; null for FPS gear. */
  componentType?: string | null;
}

/** Which contract enhancements to render. */
export interface ContractOverrideOpts {
  /** Reputation line in description + [N Rep] in title, for any rep contract. */
  includeRep: boolean;
  /** Blueprint pool list in description + [BP] in title, for BP contracts. */
  includeBlueprints: boolean;
}

/**
 * Build contract overrides from flat rows. Reputation and blueprint pools are
 * independent concerns (each toggled in `opts`) so they never double-write the
 * same key:
 *   - includeRep: a reputation line in the description (a "(by difficulty)"
 *     range when one description spans rep tiers) and an [N Rep] title tag.
 *   - includeBlueprints: the pool list in the description (multiple reward
 *     pools kept separated as Pool 1 / Pool 2) and a [BP] title tag.
 *
 * Both override values start with BP_APPEND_SENTINEL; the /download endpoint
 * appends them to the untouched base value. When `validKeys` is supplied, only
 * keys present in the base global.ini are emitted (case-insensitive, also
 * trying the `,P` variant marker), preventing phantom keys.
 */
export function generateContractOverrides(
  rows: ContractRow[],
  opts: ContractOverrideOpts,
  validKeys?: Map<string, string>,
): LabelOverride[] {
  const resolve = (key: string): string | undefined => {
    if (!key) return undefined;
    if (!validKeys) return key;
    const lower = key.toLowerCase();
    return validKeys.get(lower) ?? validKeys.get(`${lower},p`);
  };

  interface DescGroup {
    pools: Map<string, string[]>;
    reps: Set<number>;
  }
  interface TitleGroup {
    reps: Set<number>;
    hasBlueprint: boolean;
  }
  const descGroups = new Map<string, DescGroup>();
  const titleGroups = new Map<string, TitleGroup>();

  for (const r of rows) {
    const hasBp = !!(r.poolKey && r.blueprintName);
    if (r.descLocKey) {
      let g = descGroups.get(r.descLocKey);
      if (!g) {
        g = { pools: new Map(), reps: new Set() };
        descGroups.set(r.descLocKey, g);
      }
      if (r.repReward != null) g.reps.add(r.repReward);
      if (hasBp) {
        let names = g.pools.get(r.poolKey!);
        if (!names) {
          names = [];
          g.pools.set(r.poolKey!, names);
        }
        // Ship components carry a (Type) suffix; FPS gear stays bare.
        const display = r.componentType
          ? `${r.blueprintName} (${r.componentType})`
          : r.blueprintName!;
        if (!names.includes(display)) names.push(display);
      }
    }
    if (r.titleLocKey) {
      let tg = titleGroups.get(r.titleLocKey);
      if (!tg) {
        tg = { reps: new Set(), hasBlueprint: false };
        titleGroups.set(r.titleLocKey, tg);
      }
      if (r.repReward != null) tg.reps.add(r.repReward);
      if (hasBp) tg.hasBlueprint = true;
    }
  }

  const overrides: LabelOverride[] = [];

  for (const [descKey, g] of descGroups) {
    const sections: string[] = [];
    if (opts.includeRep && g.reps.size > 0) {
      const reps = [...g.reps].sort((a, b) => a - b);
      sections.push(
        reps.length === 1
          ? `<EM4>Reputation Awarded:</EM4> ${reps[0]}`
          : `<EM4>Reputation Awarded (by difficulty):</EM4> ${reps.join(" / ")}`,
      );
    }
    if (opts.includeBlueprints && g.pools.size > 0) {
      const poolKeys = [...g.pools.keys()].sort();
      if (poolKeys.length === 1) {
        sections.push(
          `<EM4>Potential Blueprints</EM4>\\n${g.pools.get(poolKeys[0])!.map((n) => `- ${n}`).join("\\n")}`,
        );
      } else {
        let block = `<EM4>Multiple Blueprint Pools</EM4>`;
        poolKeys.forEach((pk, i) => {
          block += `\\n<EM4>Pool ${i + 1}</EM4>\\n${g.pools.get(pk)!.map((n) => `- ${n}`).join("\\n")}`;
        });
        sections.push(block);
      }
    }
    if (sections.length === 0) continue;
    const matched = resolve(descKey);
    if (!matched) continue;
    overrides.push({ key: matched, value: `${BP_APPEND_SENTINEL}\\n\\n${sections.join("\\n\\n")}` });
  }

  for (const [titleKey, tg] of titleGroups) {
    const parts: string[] = [];
    if (opts.includeRep && tg.reps.size > 0) {
      const reps = [...tg.reps].sort((a, b) => a - b);
      parts.push(`[${reps.join("/")} Rep]`);
    }
    if (opts.includeBlueprints && tg.hasBlueprint) parts.push("[BP]");
    if (parts.length === 0) continue;
    const matched = resolve(titleKey);
    if (!matched) continue;
    overrides.push({ key: matched, value: `${BP_APPEND_SENTINEL} <EM4>${parts.join(" ")}</EM4>` });
  }

  return overrides;
}

// ---------------------------------------------------------------------------
// Merge engine
// ---------------------------------------------------------------------------

/**
 * Merge overrides into the base global.ini content.
 * Exact case matching — only replaces keys that match precisely.
 */
export function mergeGlobalIni(
  baseContent: string,
  overrides: Map<string, string>,
): string {
  const lines = baseContent.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) {
      result.push(line);
      continue;
    }
    const key = line.substring(0, eqIdx).trim();
    const override = overrides.get(key);
    if (override !== undefined) {
      result.push(`${key}=${override}`);
    } else {
      result.push(line);
    }
  }

  return result.join("\n");
}

/**
 * Parse all keys from a global.ini file content.
 * Returns exact-case keys for validation.
 */
export function parseGlobalIniKeys(content: string): Set<string> {
  const keys = new Set<string>();
  const lines = content.split("\n");
  for (const line of lines) {
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    keys.add(line.substring(0, eqIdx).trim());
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Diff between two global.ini versions
// ---------------------------------------------------------------------------

export interface GlobalIniDiff {
  added: string[];
  removed: string[];
  changed: { key: string; oldValue: string; newValue: string }[];
}

/**
 * Parse an INI content blob into a Map of key → value. Comments (# or ;)
 * and blank lines are skipped. Whitespace around the key is trimmed; the
 * value is preserved verbatim from the first `=` to end of line (CRLF
 * stripped). Duplicate keys keep their last occurrence.
 */
function parseIniMap(content: string): Map<string, string> {
  const out = new Map<string, string>();
  // Normalise CRLF first so the splitter doesn't leave \r in values.
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  for (const line of lines) {
    if (!line) continue;
    const trimmed = line.trimStart();
    if (trimmed.startsWith("#") || trimmed.startsWith(";")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.substring(0, eqIdx).trim();
    if (!key) continue;
    const value = line.substring(eqIdx + 1);
    out.set(key, value);
  }
  return out;
}

/**
 * Compare two global.ini contents and return key-level deltas.
 *
 * Used by `/api/localization/diff` and the Localization page's "What's
 * changed in <version>" panel so users can see what shifted between the
 * previous patch's localization and the current one before downloading
 * their merged file.
 *
 * Returned arrays are sorted alphabetically for stable UI rendering.
 */
export function diffGlobalIni(oldContent: string, newContent: string): GlobalIniDiff {
  const oldMap = parseIniMap(oldContent);
  const newMap = parseIniMap(newContent);

  const added: string[] = [];
  const removed: string[] = [];
  const changed: { key: string; oldValue: string; newValue: string }[] = [];

  for (const [key, newValue] of newMap) {
    if (!oldMap.has(key)) {
      added.push(key);
    } else if (oldMap.get(key) !== newValue) {
      changed.push({ key, oldValue: oldMap.get(key) as string, newValue });
    }
  }
  for (const key of oldMap.keys()) {
    if (!newMap.has(key)) removed.push(key);
  }

  added.sort();
  removed.sort();
  changed.sort((a, b) => a.key.localeCompare(b.key));

  return { added, removed, changed };
}

// ---------------------------------------------------------------------------
// Key browser search
// ---------------------------------------------------------------------------

export interface KeySearchResult {
  total: number;
  items: { key: string; value: string }[];
}

/**
 * Search a global.ini blob for the Localization Builder's Key Browser.
 *
 * Matches `q` (case-insensitive) against the key name OR the value, returns
 * the total number of matches plus one page (`offset`/`limit`) of rows.
 * Comments and blank lines are skipped; `limit` is clamped to [1, 200].
 */
export function searchGlobalIniKeys(
  content: string,
  opts: { q?: string; offset?: number; limit?: number },
): KeySearchResult {
  const offset = Math.max(0, opts.offset ?? 0);
  const limit = Math.max(1, Math.min(opts.limit ?? 50, 200));
  const q = (opts.q ?? "").trim().toLowerCase();

  const map = parseIniMap(content);
  const items: { key: string; value: string }[] = [];
  let total = 0;
  for (const [key, value] of map) {
    if (q && !key.toLowerCase().includes(q) && !value.toLowerCase().includes(q)) {
      continue;
    }
    if (total >= offset && items.length < limit) {
      items.push({ key, value });
    }
    total++;
  }
  return { total, items };
}

// ---------------------------------------------------------------------------
// Key categories — per-category pack assignment
// ---------------------------------------------------------------------------

export interface KeyCategory {
  id: string;
  label: string;
}

/** Categories a global.ini key can be classified into, by key prefix. */
export const KEY_CATEGORIES: KeyCategory[] = [
  { id: "ship_names", label: "Ship Names" },
  { id: "items", label: "Items & Gear" },
  { id: "commodities", label: "Commodities" },
  { id: "journal", label: "Journal & Guides" },
  { id: "ui", label: "UI" },
  { id: "other", label: "Other" },
];

/** Classify a global.ini key into a category by its prefix (case-insensitive). */
export function classifyKey(key: string): string {
  const k = key.toLowerCase();
  if (k.startsWith("vehicle_name")) return "ship_names";
  if (k.startsWith("item_name")) return "items";
  if (k.startsWith("items_commodities") || k.startsWith("item_commodities")) return "commodities";
  if (k.startsWith("journal_")) return "journal";
  if (k.startsWith("ui_")) return "ui";
  return "other";
}

/**
 * Apply per-category pack assignments to an override map (mutates it).
 * For each `categoryId → packName` assignment, the named pack's values win for
 * every key whose category matches — letting a user route, say, ship names to
 * one pack and items to another. `packEntries` maps packName → (lowercased
 * key → value); assignments referencing an unloaded pack are skipped.
 */
export function applyCategoryPacks(
  overrideMap: Map<string, string>,
  categoryPacks: Record<string, string>,
  packEntries: Record<string, Map<string, string>>,
): void {
  for (const [catId, packName] of Object.entries(categoryPacks)) {
    const entries = packEntries[packName];
    if (!entries) continue;
    for (const [lk, v] of entries) {
      if (classifyKey(lk) === catId) overrideMap.set(lk, v);
    }
  }
}

// ---------------------------------------------------------------------------
// Auto-ingest decision (safety brain for pulling a community vanilla base)
// ---------------------------------------------------------------------------

export interface IngestDecision {
  changed: boolean;
  ok: boolean;
  keyCount: number;
  /** keyCount − current base key count (keyCount when there's no current). */
  delta: number;
  reason: string;
}

/**
 * Decide whether a freshly-fetched community base global.ini should replace
 * the current KV base. Only ingests when it actually CHANGED and passes
 * sanity — guards against a broken/truncated upstream publish silently nuking
 * everyone's base. `minKeys` floors absolute size; `maxDropFraction` rejects a
 * suspicious shrink relative to the current base.
 */
export function evaluateLocalizationIngest(
  newContent: string,
  currentContent: string | null,
  opts?: { minKeys?: number; maxDropFraction?: number },
): IngestDecision {
  const minKeys = opts?.minKeys ?? 1000;
  const maxDropFraction = opts?.maxDropFraction ?? 0.2;

  const countKeys = (s: string): number => {
    let n = 0;
    for (const line of s.split("\n")) {
      const t = line.trimStart();
      if (!t || t.startsWith("#") || t.startsWith(";")) continue;
      if (line.includes("=")) n++;
    }
    return n;
  };

  const keyCount = countKeys(newContent);
  const currentKeyCount = currentContent ? countKeys(currentContent) : 0;
  const delta = keyCount - currentKeyCount;

  if (keyCount < minKeys) {
    return { changed: true, ok: false, keyCount, delta, reason: `Too few keys (${keyCount} < ${minKeys}) — upstream looks broken` };
  }
  if (currentContent !== null && newContent === currentContent) {
    return { changed: false, ok: true, keyCount, delta, reason: "No change vs current base" };
  }
  if (currentKeyCount > 0 && keyCount < currentKeyCount * (1 - maxDropFraction)) {
    return {
      changed: true,
      ok: false,
      keyCount,
      delta,
      reason: `Suspicious shrink: ${keyCount} keys vs current ${currentKeyCount} (>${Math.round(maxDropFraction * 100)}% drop)`,
    };
  }
  return { changed: true, ok: true, keyCount, delta, reason: "Changed + passed sanity" };
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface OverlayPackMeta {
  name: string;
  label: string;
  description: string | null;
  icon: string | null;
  keyCount: number;
}

export interface LocalizationConfig {
  asopEnabled: boolean;
  labelsVehicleComponents: boolean;
  labelsFpsWeapons: boolean;
  labelsFpsArmour: boolean;
  labelsFpsHelmets: boolean;
  labelsFpsAttachments: boolean;
  labelsFpsUtilities: boolean;
  labelsConsumables: boolean;
  labelsShipMissiles: boolean;
  labelFormat: LabelFormat;
  categoryFormats: CategoryFormats;
  enabledPacks: string[];
  /** Per-category pack assignment: categoryId → packName. */
  categoryPacks: Record<string, string>;
  enhanceContrabandWarnings: boolean;
  enhanceMaterialNames: boolean;
  enhanceBlueprintPools: boolean;
  enhanceContractRep: boolean;
}

export const DEFAULT_CONFIG: LocalizationConfig = {
  asopEnabled: false,
  labelsVehicleComponents: false,
  labelsFpsWeapons: false,
  labelsFpsArmour: false,
  labelsFpsHelmets: false,
  labelsFpsAttachments: false,
  labelsFpsUtilities: false,
  labelsConsumables: false,
  labelsShipMissiles: false,
  labelFormat: "suffix",
  categoryFormats: {},
  enabledPacks: [],
  categoryPacks: {},
  enhanceContrabandWarnings: false,
  enhanceMaterialNames: false,
  enhanceBlueprintPools: false,
  enhanceContractRep: false,
};

export function configFromRow(row: Record<string, unknown>): LocalizationConfig {
  let categoryFormats: CategoryFormats = {};
  if (row.category_formats_json && typeof row.category_formats_json === "string") {
    try {
      categoryFormats = JSON.parse(row.category_formats_json);
    } catch {
      categoryFormats = {};
    }
  }

  let enabledPacks: string[] = [];
  if (row.enabled_packs_json && typeof row.enabled_packs_json === "string") {
    try {
      enabledPacks = JSON.parse(row.enabled_packs_json);
    } catch {
      enabledPacks = [];
    }
  }

  let categoryPacks: Record<string, string> = {};
  if (row.category_packs_json && typeof row.category_packs_json === "string") {
    try {
      categoryPacks = JSON.parse(row.category_packs_json);
    } catch {
      categoryPacks = {};
    }
  }

  return {
    asopEnabled: !!row.asop_enabled,
    labelsVehicleComponents: !!row.labels_vehicle_components,
    labelsFpsWeapons: !!row.labels_fps_weapons,
    labelsFpsArmour: !!row.labels_fps_armour,
    labelsFpsHelmets: !!row.labels_fps_helmets,
    labelsFpsAttachments: !!row.labels_fps_attachments,
    labelsFpsUtilities: !!row.labels_fps_utilities,
    labelsConsumables: !!row.labels_consumables,
    labelsShipMissiles: !!row.labels_ship_missiles,
    labelFormat: (row.label_format as LabelFormat) || "suffix",
    categoryFormats,
    enabledPacks,
    categoryPacks,
    enhanceContrabandWarnings: !!row.enhance_contraband_warnings,
    enhanceMaterialNames: !!row.enhance_material_names,
    enhanceBlueprintPools: !!row.enhance_blueprint_pools,
    enhanceContractRep: !!row.enhance_contract_rep,
  };
}

/** Parse key=value lines from INI content into a Map */
export function parseIniOverrides(content: string): Map<string, string> {
  const overrides = new Map<string, string>();
  const lines = content.split("\n");
  for (const line of lines) {
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.substring(0, eqIdx).trim();
    if (!key) continue;
    overrides.set(key, line.substring(eqIdx + 1));
  }
  return overrides;
}

/** Resolve the format for a category: per-category override → global fallback */
export function resolveCategoryFormat(
  config: LocalizationConfig,
  category: string,
): CategoryFormat {
  if (config.categoryFormats[category]) {
    return config.categoryFormats[category];
  }
  // Fallback: all available fields with global format
  return {
    fields: [...(CATEGORY_AVAILABLE_FIELDS[category] || [])],
    format: config.labelFormat,
  };
}
