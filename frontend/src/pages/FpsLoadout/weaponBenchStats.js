import { interpolateModifier, computeDPS } from '../Crafting/craftingUtils'

const num = (v) => (typeof v === 'number' && !Number.isNaN(v) ? v : 1)

// Per crafting-property multiplier = product over every material slot that affects it.
export function craftedMultipliers(slots, qualities) {
  const out = new Map()
  ;(slots || []).forEach((slot, i) => {
    for (const mod of slot?.modifiers || []) {
      const key = mod.key || mod.name
      const prev = out.get(key) ?? 1
      out.set(key, prev * interpolateModifier(mod, (qualities && qualities[i]) || 0))
    }
  })
  return out
}

// Loot-only attachments today → fixed multipliers. qualityConfig reserved for future craftable attachments.
export function resolveAttachmentMultipliers(attachment /*, qualityConfig */) {
  if (!attachment) return {}
  return {
    weapon_damage: num(attachment.damage_multiplier),
    weapon_firerate: num(attachment.fire_rate_multiplier),
    projectile_speed: num(attachment.projectile_speed_multiplier),
    heat: num(attachment.heat_generation_multiplier),
  }
}

export function combinedMultipliers(slots, qualities, attachments) {
  const result = {}
  for (const [k, v] of craftedMultipliers(slots, qualities)) result[k] = v
  for (const att of attachments || []) {
    for (const [k, v] of Object.entries(resolveAttachmentMultipliers(att))) {
      result[k] = (result[k] ?? 1) * v
    }
  }
  return result
}

export function computeBenchStats(baseStats, combined) {
  const m = combined || {}
  const damage = baseStats?.damage != null ? baseStats.damage * (m.weapon_damage ?? 1) : null
  const rpm = baseStats?.rounds_per_minute != null ? baseStats.rounds_per_minute * (m.weapon_firerate ?? 1) : null
  const dps = damage != null && rpm != null ? computeDPS(damage, rpm) : null
  return { damage, rpm, dps, recoil: m.weapon_recoil_kick ?? 1, multipliers: m }
}
