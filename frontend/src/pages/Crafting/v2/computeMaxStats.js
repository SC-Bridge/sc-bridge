/**
 * Compute best-case (Q1000) max values for a blueprint's stats, derived
 * from the crafting slot modifiers.
 *
 * Why this exists: the API's `/api/gamedata/crafting` endpoint returns
 * raw base stats from `fps_weapons` / `fps_armour` with NO `_max`
 * columns — max values must be computed client-side by applying the
 * `modifier_at_end` product of all relevant crafting slot modifiers to
 * the base stats. The canonical implementation of this math lives in
 * `QualitySim.jsx:147-174`; this helper extracts it so the BlueprintCard
 * and BlueprintListView can display `base → max` without duplicating
 * the QualitySim logic.
 *
 * Stats computed:
 *   weapons: rounds_per_minute_max, dps_max
 *            (range is static — no weapon_range modifier exists in
 *             craftingUtils.STAT_INFO — and is handled via the
 *             isStatic flag in statConfig.js, not here)
 *   armour:  resist_physical_max, resist_energy_max, resist_stun_max
 *            (damagemitigation is a single multiplier that applies
 *             uniformly to every resist_* field on fps_armour)
 *   ammo:    (not yet implemented — pending confirmation of which
 *             modifier keys apply to ammo damage/penetration)
 *
 * Returns a partial overlay object to be merged onto base_stats. Keys
 * that can't be computed (missing base, missing modifiers) are simply
 * absent from the returned object — the caller should not assume all
 * fields are present.
 *
 * @param {object} blueprint - { type, base_stats, slots }
 * @returns {object} overlay with computed `_max` fields
 */
import { interpolateModifier } from '../craftingUtils'

/**
 * Shared core: walk slot modifiers, multiply each stat by `modMult(mod, slotIndex)`,
 * apply the products to base_stats. Returns a `_max`-keyed overlay (the field
 * names are historical — they hold the value at whatever quality modMult encodes).
 */
function computeStatOverlay(blueprint, modMult) {
  if (!blueprint || !blueprint.base_stats) return {}

  const multipliers = new Map()
  const slots = blueprint.slots || []
  slots.forEach((slot, slotIndex) => {
    if (!slot.modifiers) return
    for (const mod of slot.modifiers) {
      const key = mod.key || mod.name
      if (!key) continue
      const current = multipliers.get(key) ?? 1
      multipliers.set(key, current * modMult(mod, slotIndex))
    }
  })

  const base = blueprint.base_stats
  const result = {}

  if (blueprint.type === 'weapons') {
    const dmgMult = multipliers.get('weapon_damage') ?? 1
    const rpmMult = multipliers.get('weapon_firerate') ?? 1
    const damageBase = base.damage
    const rpmBase = base.rounds_per_minute
    // Both damage and rpm are required to derive dps — if either is missing,
    // skip the weapons block entirely rather than half-populate.
    if (damageBase != null && rpmBase != null) {
      result.rounds_per_minute_max = rpmBase * rpmMult
      result.dps_max = (damageBase * dmgMult) * (rpmBase * rpmMult) / 60
    }
  } else if (blueprint.type === 'armour') {
    const mitMult = multipliers.get('armor_damagemitigation') ?? 1
    if (base.resist_physical != null) result.resist_physical_max = base.resist_physical * mitMult
    if (base.resist_energy != null)   result.resist_energy_max   = base.resist_energy * mitMult
    if (base.resist_stun != null)     result.resist_stun_max     = base.resist_stun * mitMult
  }
  // ammo: intentionally unimplemented until modifier mapping is confirmed.

  return result
}

export function computeMaxStats(blueprint) {
  // Q1000 best case: modifier_at_end == interpolateModifier(mod, 1000).
  return computeStatOverlay(blueprint, (mod) => mod.modifier_at_end ?? 1)
}

/**
 * Compute a saved build's stat overlay at ITS quality config (not max).
 * qualityConfig is keyed by slot index ("0","1",...) → quality 0-1000
 * (mirrors QualitySim's `qualities` map; default 500 for an unset slot).
 * Lets the Saved-Sim view show each build's distinct stats instead of
 * collapsing every build into one max-stats card.
 *
 * @param {object} blueprint - { type, base_stats, slots }
 * @param {object} qualityConfig - { [slotIndex]: quality }
 * @returns {object} overlay with computed `_max` fields (= build values)
 */
export function computeBuildStats(blueprint, qualityConfig) {
  const cfg = qualityConfig || {}
  return computeStatOverlay(blueprint, (mod, slotIndex) =>
    interpolateModifier(mod, cfg[slotIndex] ?? cfg[String(slotIndex)] ?? 500),
  )
}
