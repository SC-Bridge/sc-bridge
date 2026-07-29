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

const FAMILY_RE = /^(grenade|mag|sling|pen)_(\d+)$/
export function SLOT_FAMILY(slotKey) {
  if (slotKey === 'util_gadget') return { family: 'utilGadget', index: 1 }
  if (slotKey === 'util_knife') return { family: 'utilKnife', index: 1 }
  const m = FAMILY_RE.exec(slotKey || '')
  if (!m) return { family: null, index: 0 }
  const familyKey = { grenade: 'grenades', mag: 'mags', sling: 'slings', pen: 'pens' }[m[1]]
  return { family: familyKey, index: Number(m[2]) }
}

// Human labels for the dynamic utility slot-key vocabulary this module owns
// (util_gadget/util_knife singletons + the ordinal grenade_N/mag_N/sling_N/
// pen_N families). Fixed structural slots (primary, helmet, ...) aren't part
// of that vocabulary — callers with their own fixed-slot labels should check
// those first and fall back to this for anything else; unrecognized keys
// pass through unchanged rather than leaking a made-up label.
const UTIL_SLOT_LABEL = { util_gadget: 'Gadget', util_knife: 'Knife' }
const FAMILY_LABEL_PREFIX = { grenades: 'Grenade', mags: 'Mag', slings: 'Sling', pens: 'Pen' }
export function labelForSlotKey(slotKey) {
  if (UTIL_SLOT_LABEL[slotKey]) return UTIL_SLOT_LABEL[slotKey]
  const { family, index } = SLOT_FAMILY(slotKey)
  const prefix = FAMILY_LABEL_PREFIX[family]
  return prefix ? `${prefix} ${index}` : slotKey
}
