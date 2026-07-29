// Capacity flows from the equipped armour — the 4.9 DataCore port audit
// (tools docs/superpowers/specs/2026-07-27-slice3-slot-rules-findings.md)
// found counts 100% invariant per weight class, so this static map IS the
// game data. Missing host piece → 0 for its groups; unknown weight → light.
const CORE_BY_WEIGHT = {
  light: { grenades: 2, mags: 4, slings: 1 },
  medium: { grenades: 3, mags: 6, slings: 2 },
  heavy: { grenades: 4, mags: 8, slings: 2 },
}

const weightRow = (piece) => {
  const w = (piece?.base_stats?.armour_weight || '').toLowerCase()
  return CORE_BY_WEIGHT[w] || CORE_BY_WEIGHT.light
}

export function portCapacity(corePiece, legsPiece) {
  const core = corePiece ? weightRow(corePiece) : { grenades: 0, mags: 0, slings: 0 }
  return {
    ...core,
    pens: legsPiece ? 4 : 0,
    utilGadget: legsPiece ? 1 : 0,
    utilKnife: legsPiece ? 1 : 0,
  }
}

const FAMILY_RE = /^(grenade|mag|sling|pen)_(\d)$/
export function SLOT_FAMILY(slotKey) {
  if (slotKey === 'util_gadget') return { family: 'utilGadget', index: 1 }
  if (slotKey === 'util_knife') return { family: 'utilKnife', index: 1 }
  const m = FAMILY_RE.exec(slotKey || '')
  if (!m) return { family: null, index: 0 }
  const familyKey = { grenade: 'grenades', mag: 'mags', sling: 'slings', pen: 'pens' }[m[1]]
  return { family: familyKey, index: Number(m[2]) }
}
