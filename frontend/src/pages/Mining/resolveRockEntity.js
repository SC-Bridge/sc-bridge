/**
 * Resolve a rock_composition to a rock_entity-like object usable by
 * computeEffectiveRockStats. When the composition has no direct rock_entity
 * (the CommonShipMineables_X case — shared templates the runtime binds at
 * spawn), fall back to the median laser_damage_full_value of peers in the
 * same rock_category, derived from the composition's rock_type.
 *
 * Returns `{ ...entity, is_fallback: bool }` or null when nothing can be
 * resolved (no direct match AND no peers in the category).
 */

// composition.rock_type -> rock_entity.rock_category
const ROCK_TYPE_TO_CATEGORY = {
  asteroid_ship: 'ship_asteroid',
  surface_ship: 'ship_planetary',
  fps: 'fps',
  ground_vehicle: 'ground_vehicle',
}

function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

export function buildMedianBaseByCategory(rockEntities) {
  const byCat = new Map()
  for (const e of rockEntities ?? []) {
    if (typeof e?.laser_damage_full_value !== 'number') continue
    if (!byCat.has(e.rock_category)) byCat.set(e.rock_category, [])
    byCat.get(e.rock_category).push(e.laser_damage_full_value)
  }
  const out = new Map()
  for (const [cat, vals] of byCat) out.set(cat, median(vals))
  return out
}

export function resolveRockEntity(compositionUuid, compositions, rockEntities, medianByCategory) {
  const direct = rockEntities?.find((r) => r.composition_uuid === compositionUuid)
  if (direct) return { ...direct, is_fallback: false }

  const comp = compositions?.find((c) => c.uuid === compositionUuid)
  if (!comp) return null

  const category = ROCK_TYPE_TO_CATEGORY[comp.rock_type]
  const med = category ? medianByCategory?.get(category) : null
  if (med == null) return null

  return {
    composition_uuid: compositionUuid,
    rock_category: category,
    laser_damage_full_value: med,
    is_fallback: true,
  }
}
