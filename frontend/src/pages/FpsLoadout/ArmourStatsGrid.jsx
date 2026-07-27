// frontend/src/pages/FpsLoadout/ArmourStatsGrid.jsx
//
// Fixed-height armour stat grid (#200 slice 2): 6 resistances + temperature
// band + weight + a spacer-free 3×3 layout. Same no-reflow contract as the
// weapon StatsGrid: every cell always renders; only values change.
import React from 'react'
import { Cell, EM_DASH, pctDelta, DeltaSub } from './statCells'

const RESISTS = [
  ['resist_physical', 'Physical'],
  ['resist_energy', 'Energy'],
  ['resist_distortion', 'Distortion'],
  ['resist_thermal', 'Thermal'],
  ['resist_biochemical', 'Biochem'],
  ['resist_stun', 'Stun'],
]

const pct = (v) => (v == null ? null : `${Math.round(v * 100)}%`)

export default function ArmourStatsGrid({ baseStats, stats }) {
  const base = baseStats || {}
  const s = stats || {}
  return (
    <div className="grid grid-cols-3 gap-1.5" data-testid="armour-stats-grid">
      {RESISTS.map(([key, label]) => (
        <Cell key={key} label={label} value={pct(s[key])} dyn={s[key] !== base[key]}
          sub={<DeltaSub deltaPct={pctDelta(base[key], s[key])} suffix="resist" />} na={s[key] == null} />
      ))}
      <Cell label="Temp Band"
        value={s.temperature_min == null && s.temperature_max == null ? null
          : `${s.temperature_min == null ? EM_DASH : Math.round(s.temperature_min) + '°'} / ${s.temperature_max == null ? EM_DASH : Math.round(s.temperature_max) + '°'}`}
        sub={<span className="text-gray-600">survivable</span>} na={s.temperature_min == null && s.temperature_max == null} />
      <Cell label="Weight" value={s.weight == null ? null : String(s.weight)}
        sub={<span className="text-gray-600">kg</span>} na={s.weight == null} />
      <Cell label="Slot" value={base.armour_slot || null}
        sub={<span className="text-gray-600">{base.armour_weight || 'class'}</span>} na={!base.armour_slot} />
    </div>
  )
}
