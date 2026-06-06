/**
 * Per-type stat configuration for the Crafting v2 blueprint card and list view.
 *
 * Each entry:
 *   - label:    Short display name for the sub-column header (capitalized)
 *   - unit:     Short unit suffix (grid card only — list view omits)
 *   - basePath: Dotted path into blueprint.base_stats for the base value
 *   - maxPath:  Dotted path for the max value, or null for static stats
 *               (stats that don't scale with crafting quality — see isStatic)
 *   - isStatic: true = this stat has no crafting-quality modifier, max is
 *               always null by design, and the UI should render the base
 *               value without a `→ max` arrow. Use for weapon range (no
 *               weapon_range modifier in craftingUtils.STAT_INFO) and
 *               ammo velocity (no modifier exists).
 *   - decimals: Number of decimal places for display rounding (default 0).
 *               Applied in resolveStats so StatCell receives clean numbers.
 *   - scale:    Multiplier applied before display (default 1). Use for
 *               resist_* values that are 0.0–1.0 in the DB but should
 *               render as 0–100 with unit "%" (spec §3.3).
 *
 * When new blueprint types are added, extend this config; every component
 * reads from here so there is a single source of truth.
 *
 * IMPORTANT: NEVER add a silent fallback like `max ?? base` to resolveStats.
 * If a max value is missing it should surface in the UI as `base → —`, not
 * be concealed as `base === max` which collapses to a single-value display
 * and hides architectural gaps. See feedback_silent_fallback_hides_bugs
 * in memory for the full incident writeup.
 */

export const STAT_CONFIG = {
  weapons: {
    strip: 'weapon',
    groupLabels: ['DPS', 'RPM', 'Range (m)'],
    stats: [
      { key: 'dps',   label: 'DPS',   unit: '',      basePath: 'dps',                maxPath: 'dps_max',                decimals: 1 },
      { key: 'rpm',   label: 'RPM',   unit: '',      basePath: 'rounds_per_minute',  maxPath: 'rounds_per_minute_max', decimals: 0 },
      { key: 'range', label: 'Range', unit: '',      basePath: 'effective_range',    maxPath: null, isStatic: true,    decimals: 0 },
    ],
  },
  armour: {
    strip: 'armour',
    groupLabels: ['Phys', 'Energy', 'Stun'],
    stats: [
      { key: 'phys',   label: 'Phys',   unit: '%', basePath: 'resist_physical', maxPath: 'resist_physical_max', decimals: 0, scale: 100 },
      { key: 'energy', label: 'Energy', unit: '%', basePath: 'resist_energy',   maxPath: 'resist_energy_max',   decimals: 0, scale: 100 },
      { key: 'stun',   label: 'Stun',   unit: '%', basePath: 'resist_stun',     maxPath: 'resist_stun_max',     decimals: 0, scale: 100 },
    ],
  },
  ammo: {
    strip: 'ammo',
    groupLabels: ['Damage', 'Penetration', 'Velocity (m/s)'],
    stats: [
      { key: 'damage',      label: 'DMG', unit: '',    basePath: 'damage',      maxPath: 'damage_max',      decimals: 1 },
      { key: 'penetration', label: 'PEN', unit: '',    basePath: 'penetration', maxPath: 'penetration_max', decimals: 0 },
      { key: 'velocity',    label: 'VEL', unit: 'm/s', basePath: 'velocity',    maxPath: null, isStatic: true, decimals: 0 },
    ],
  },
}

/**
 * Safely read a dotted path from an object. Returns null on any missing segment.
 *
 *   readStat({ base_stats: { dps: 412 } }, 'dps')     // → 412
 *   readStat({}, 'dps')                                // → null
 *   readStat({ base_stats: null }, 'dps')              // → null
 */
export function readStat(blueprint, path) {
  if (!blueprint || !blueprint.base_stats || !path) return null
  const parts = path.split('.')
  let current = blueprint.base_stats
  for (const part of parts) {
    if (current == null) return null
    current = current[part]
  }
  return current ?? null
}

import { computeMaxStats } from './computeMaxStats'

/** Round a number to `d` decimal places. */
function roundTo(value, d) {
  if (d === 0) return Math.round(value)
  const factor = 10 ** d
  return Math.round(value * factor) / factor
}

/**
 * Resolve the three configured stats for a blueprint, returning an array of
 * { key, label, unit, base, max, isStatic } tuples.
 *
 * - Missing values become null (NO fallback from max to base — see the
 *   silent-fallback note on STAT_CONFIG above).
 * - Static stats (isStatic: true) always have max === null and should be
 *   rendered by StatCell without an arrow.
 * - Max values are COMPUTED from crafting slot modifiers via
 *   computeMaxStats() and overlaid onto base_stats before path reads.
 *   This is required because the API doesn't return any `_max` fields —
 *   the computation is done client-side on every render (memoized by
 *   the caller if perf becomes an issue; map lookups are cheap).
 */
export function resolveStats(blueprint, statsOverride = null) {
  const type = blueprint?.type
  const config = STAT_CONFIG[type]
  if (!config) return []

  // Derive `_max` values from slot modifiers and overlay them onto
  // base_stats. If base_stats already has a `_max` field (e.g. from
  // fabricated test fixtures), the computed value wins — it's the
  // canonical derivation from the crafting model.
  // `statsOverride` (a precomputed _max overlay) lets the Saved-Sim view show a
  // specific build's stats (computeBuildStats at its quality config) instead of
  // the blueprint's Q1000 max.
  const computedMax = statsOverride ?? computeMaxStats(blueprint)
  const mergedBlueprint = {
    ...blueprint,
    base_stats: { ...(blueprint?.base_stats ?? {}), ...computedMax },
  }

  return config.stats.map(stat => {
    const rawBase = readStat(mergedBlueprint, stat.basePath)
    const rawMax = stat.maxPath ? readStat(mergedBlueprint, stat.maxPath) : null
    const scale = stat.scale ?? 1
    const dec = stat.decimals ?? 0

    return {
      key: stat.key,
      label: stat.label,
      unit: stat.unit,
      base: rawBase != null ? roundTo(rawBase * scale, dec) : null,
      max: rawMax != null ? roundTo(rawMax * scale, dec) : null,
      isStatic: stat.isStatic === true,
    }
  })
}
