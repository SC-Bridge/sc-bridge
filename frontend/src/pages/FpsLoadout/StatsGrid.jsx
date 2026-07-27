// frontend/src/pages/FpsLoadout/StatsGrid.jsx
import React from 'react'
import { Cell, fmt, pctDelta, DeltaSub } from './statCells'

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

  // Attachment-driven cells: projectile speed (multiplied), suppressor sound
  // radius, heat, and the equipped optic's zoom.
  const projSpeed = build.projectileSpeed ?? base.projectile_speed ?? null
  const projDelta = pctDelta(base.projectile_speed, build.projectileSpeed)
  const sound = mult.sound_radius != null && mult.sound_radius !== 1 ? mult.sound_radius : null
  const heat = mult.heat != null && mult.heat !== 1 ? mult.heat : null
  // ADS speed scale (>1 = faster aim-down-sight); improvement % is direct,
  // not inverted like the recoil family.
  const ads = mult.ads_speed != null && mult.ads_speed !== 1 ? mult.ads_speed : null

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
          value={fmt(projSpeed, 0)}
          sub={<DeltaSub deltaPct={projDelta} suffix="m/s" />}
          na={projSpeed == null}
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

        {/* Conditional — attachment-driven or absent from base_stats today */}
        <Cell
          label="Heat / Shot"
          dyn
          value={heat != null ? `×${fmt(heat, 2)}` : null}
          na={heat == null}
          sub={heat != null
            ? <ImprovementSub improvementPct={invertImprovement(heat)} goodWord="cooler" badWord="hotter" />
            : 'n/a'}
        />
        <Cell
          label="Sound"
          dyn
          value={sound != null ? `×${fmt(sound, 2)}` : null}
          na={sound == null}
          sub={sound != null
            ? <ImprovementSub improvementPct={invertImprovement(sound)} goodWord="quieter" badWord="louder" />
            : 'suppressor'}
        />
        <Cell
          label="ADS Speed"
          dyn
          value={ads != null ? `×${fmt(ads, 2)}` : null}
          na={ads == null}
          sub={ads != null
            ? <ImprovementSub improvementPct={(ads - 1) * 100} goodWord="faster" badWord="slower" />
            : 'aim-down-sight'}
        />
        <Cell label="Overheat" value={null} na sub="n/a" />
        <Cell label="Charge Time" value={null} na sub="n/a" />
        <Cell
          label="Zoom"
          value={build.zoom || null}
          na={!build.zoom}
          sub={build.zoom ? 'optic' : 'optic'}
        />
      </div>
    </div>
  )
}
