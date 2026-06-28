// frontend/src/pages/FpsLoadout/StatsPanel.jsx
import React from 'react'

function pctDelta(base, build) {
  if (base == null || build == null || base === 0) return null
  return ((build / base) - 1) * 100
}
const fmt = (v, d) => (v == null ? '—' : Number(v).toFixed(d))

function Row({ label, sub, base, build, deltaPct, staticValue }) {
  // Stats crafting/attachments don't affect render once (no base→build split).
  if (staticValue != null) {
    return (
      <div className="grid grid-cols-[1fr_auto] items-center gap-3 py-2 border-b border-white/[0.06] text-sm">
        <div className="text-gray-300">{label}{sub && <span className="block text-[10px] uppercase tracking-wide text-gray-600">{sub}</span>}</div>
        <div className="text-right text-gray-400 font-mono tabular-nums">{staticValue}</div>
      </div>
    )
  }
  const cls = deltaPct == null || Math.abs(deltaPct) < 0.05 ? 'text-gray-500'
    : deltaPct > 0 ? 'text-emerald-400' : 'text-red-400'
  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 py-2 border-b border-white/[0.06] text-sm">
      <div className="text-gray-300">{label}{sub && <span className="block text-[10px] uppercase tracking-wide text-gray-600">{sub}</span>}</div>
      <div className="text-right text-gray-500 font-mono tabular-nums">{base}</div>
      <div className="text-right font-mono tabular-nums text-sc-accent">{build}</div>
      <div className={`text-right text-xs font-mono tabular-nums ${cls}`}>
        {deltaPct == null ? '—' : `${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(1)}%`}
      </div>
    </div>
  )
}

export default function StatsPanel({ baseStats, stats }) {
  if (!baseStats || !stats) return null
  return (
    <div>
      {baseStats.damage != null && (
        <Row label="Damage" sub="per shot" base={fmt(baseStats.damage, 1)} build={fmt(stats.damage, 1)} deltaPct={pctDelta(baseStats.damage, stats.damage)} />
      )}
      {baseStats.rounds_per_minute != null && (
        <Row label="Fire Rate" sub="rpm" base={fmt(baseStats.rounds_per_minute, 0)} build={fmt(stats.rpm, 0)} deltaPct={pctDelta(baseStats.rounds_per_minute, stats.rpm)} />
      )}
      {baseStats.dps != null && (
        <Row label="DPS" sub="derived" base={fmt(baseStats.dps, 1)} build={fmt(stats.dps, 1)} deltaPct={pctDelta(baseStats.dps, stats.dps)} />
      )}
      <Row label="Recoil Kick" sub="×curve" base="×1.00" build={`×${fmt(stats.recoil, 2)}`} deltaPct={null} />
      {baseStats.effective_range != null && (
        <Row label="Effective Range" staticValue={`${fmt(baseStats.effective_range, 0)} m`} />
      )}
      {baseStats.ammo_capacity != null && (
        <Row label="Magazine" staticValue={`${fmt(baseStats.ammo_capacity, 0)}`} />
      )}
    </div>
  )
}
