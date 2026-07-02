// frontend/src/pages/FpsLoadout/StatsGrid.jsx
import React from 'react'

const EM_DASH = '—'
const fmt = (v, d = 0) => (v == null ? null : Number(v).toFixed(d))

function pctDelta(base, build) {
  if (base == null || build == null || base === 0) return null
  return ((build - base) / base) * 100
}

function DeltaSub({ deltaPct, suffix }) {
  if (deltaPct == null || Math.abs(deltaPct) < 0.05) {
    return <span className="text-gray-600">{suffix}</span>
  }
  const cls = deltaPct > 0 ? 'text-sc-success' : 'text-sc-danger'
  const sign = deltaPct > 0 ? '+' : ''
  return (
    <>
      <span className={cls}>{sign}{deltaPct.toFixed(0)}%</span>
      {suffix ? <span className="text-gray-600"> · {suffix}</span> : null}
    </>
  )
}

// Recoil-family multipliers are inverted: a multiplier below 1.0 is an
// improvement (less kick / faster recovery / tighter pattern). Convert to a
// signed "improvement %" where positive = better, so the delta reads the same
// direction (green = good) as the damage/DPS cells above.
function invertImprovement(mult) {
  if (mult == null) return null
  return (1 - mult) * 100
}

function ImprovementSub({ improvementPct, goodWord = 'better', badWord = 'worse' }) {
  if (improvementPct == null) return <span className="text-gray-600">curve</span>
  if (Math.abs(improvementPct) < 0.5) return <span className="text-gray-600">stock</span>
  const better = improvementPct > 0
  const cls = better ? 'text-sc-success' : 'text-sc-danger'
  return <span className={cls}>{Math.abs(improvementPct).toFixed(0)}% {better ? goodWord : badWord}</span>
}

function Cell({ label, value, sub, dyn = false, na = false }) {
  return (
    <div
      data-testid="stat-cell"
      className={[
        'rounded border px-2.5 py-1.5 min-h-[48px]',
        'border-white/[0.08] bg-black/20',
        dyn ? 'border-l-2 border-l-sc-accent' : '',
        na ? 'opacity-40' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="text-[8.5px] uppercase tracking-wide text-sc-accent2">{label}</div>
      <div className={`text-sm font-semibold tabular-nums leading-tight ${na ? 'text-gray-500' : 'text-gray-100'}`}>
        {value == null ? EM_DASH : value}
      </div>
      <div className="text-[9px] text-gray-500">{sub}</div>
    </div>
  )
}

export default function StatsGrid({ baseStats, stats }) {
  const base = baseStats || {}
  const build = stats || {}
  const mult = build.multipliers || {}

  const damageDelta = pctDelta(base.damage, build.damage)
  const dpsDelta = pctDelta(base.dps, build.dps)
  const rpmDelta = pctDelta(base.rounds_per_minute, build.rpm)

  // Recoil family — driven by the crafted multipliers (kick / recovery /
  // stability). These move with the material-quality sliders even when raw
  // damage doesn't, so surfacing all three is what makes every slider visibly
  // do something (the FS-9's two recoil slots were previously invisible).
  const kick = build.recoil ?? mult.weapon_recoil_kick ?? null
  const recovery = mult.weapon_recoil_handling ?? null
  const stability = mult.weapon_recoil_smoothness ?? null

  const hasSpread = base.spread_min != null || base.spread_max != null
  const spreadValue = hasSpread
    ? fmt(base.spread_max ?? base.spread_min, 2)
    : null

  const fireModes = Array.isArray(base.fire_modes)
    ? base.fire_modes.join(' / ')
    : base.fire_modes || null

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-wide text-sc-accent2">
        <span>Stats</span>
        <span className="flex-1 h-px bg-white/10" />
        <span className="normal-case tracking-normal italic text-gray-600 text-[8.5px]">
          fixed layout — sized for the full stat set; only values change
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        {/* Dynamic — build value + delta vs base */}
        <Cell
          label="Damage"
          dyn
          value={fmt(build.damage, 1)}
          sub={<DeltaSub deltaPct={damageDelta} suffix={base.damage != null ? `base ${fmt(base.damage, 1)}` : null} />}
        />
        <Cell
          label="DPS"
          dyn
          value={fmt(build.dps, 1)}
          sub={<DeltaSub deltaPct={dpsDelta} suffix={base.dps != null ? fmt(base.dps, 1) : null} />}
        />
        <Cell
          label="Fire Rate"
          dyn
          value={fmt(build.rpm, 0)}
          sub={<DeltaSub deltaPct={rpmDelta} suffix="RPM" />}
        />
        <Cell
          label="Recoil"
          dyn
          value={kick != null ? `×${fmt(kick, 2)}` : null}
          na={kick == null}
          sub={<ImprovementSub improvementPct={invertImprovement(kick)} goodWord="less" badWord="more" />}
        />
        <Cell label="Reload" dyn value={null} na sub="n/a" />
        <Cell
          label="Accuracy"
          dyn
          value={spreadValue}
          sub={hasSpread ? 'spread' : null}
          na={!hasSpread}
        />
        <Cell
          label="Proj. Speed"
          dyn
          value={fmt(base.projectile_speed, 0)}
          sub="m/s"
          na={base.projectile_speed == null}
        />
        <Cell
          label="Recoil Recovery"
          dyn
          value={recovery != null ? `×${fmt(recovery, 2)}` : null}
          na={recovery == null}
          sub={<ImprovementSub improvementPct={invertImprovement(recovery)} goodWord="faster" badWord="slower" />}
        />
        <Cell
          label="Recoil Stability"
          dyn
          value={stability != null ? `×${fmt(stability, 2)}` : null}
          na={stability == null}
          sub={<ImprovementSub improvementPct={invertImprovement(stability)} goodWord="tighter" badWord="looser" />}
        />

        {/* Static — plain values from base_stats */}
        <Cell label="Damage Type" value={base.damage_type || null} na={!base.damage_type} sub={base.damage_type ? 'physical' : 'n/a'} />
        <Cell label="Fire Modes" value={fireModes} na={!fireModes} sub={fireModes ? null : 'n/a'} />
        <Cell label="Ammo" value={fmt(base.ammo_capacity, 0)} na={base.ammo_capacity == null} sub={base.ammo_capacity != null ? 'rds · mag' : 'n/a'} />
        <Cell label="Eff. Range" value={fmt(base.effective_range, 0)} na={base.effective_range == null} sub={base.effective_range != null ? 'm' : 'n/a'} />

        {/* Conditional — not present in base_stats today */}
        <Cell label="Heat / Shot" value={null} na sub="n/a" />
        <Cell label="Overheat" value={null} na sub="n/a" />
        <Cell label="Cooling / s" value={null} na sub="n/a" />
        <Cell label="Charge Time" value={null} na sub="n/a" />
        <Cell label="Zoom" value={null} na sub="n/a" />
      </div>
    </div>
  )
}
