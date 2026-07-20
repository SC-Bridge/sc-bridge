import React, { useState, useMemo, useEffect } from 'react'
import { HelpCircle, Bookmark, Check, Trash2, Plus } from 'lucide-react'
import {
  saveUserBlueprint,
  useUserBlueprints,
  deleteUserBlueprint,
  createBlueprintBuild,
  updateBlueprintBuild,
  deleteBlueprintBuild,
} from '../../hooks/useAPI'
import {
  interpolateModifier, multiplierToImprovement, formatImprovementWithWord,
  getStatLabel, getStatDescription,
  computeActualValue, formatActualValue, computeDPS,
} from './craftingUtils'
import QualitySlider from './QualitySlider'

function Tooltip({ text, children, position = 'top' }) {
  const posStyles = position === 'right'
    ? 'left-full top-1/2 -translate-y-1/2 ml-2'
    : 'bottom-full left-0 mb-2'
  const arrowStyles = position === 'right'
    ? 'absolute top-1/2 -translate-y-1/2 -left-1 w-2 h-2 bg-gray-900/95 border-b border-l border-white/[0.1] rotate-45'
    : 'absolute -bottom-1 left-4 w-2 h-2 bg-gray-900/95 border-b border-r border-white/[0.1] rotate-45'

  return (
    <span className="relative group/tip inline-flex items-center gap-1 cursor-help">
      {children}
      <span className={`absolute ${posStyles} hidden group-hover/tip:block px-3 py-2 rounded-lg bg-gray-900/95 border border-white/[0.1] shadow-xl shadow-black/40 backdrop-blur-sm text-xs text-gray-300 font-normal normal-case tracking-normal whitespace-normal w-72 z-20 leading-relaxed`}>
        {text}
        <span className={arrowStyles} />
      </span>
    </span>
  )
}

// Format the description column — shows improvement % with word
function formatDescription(statKey, improvement) {
  if (Math.abs(improvement) < 0.05) return 'no change'
  const sign = improvement > 0 ? '+' : ''
  return `${sign}${improvement.toFixed(1)}% ${formatImprovementWithWord(statKey, improvement).replace(/^\d+%\s*/, '')}`
}

export default function QualitySim({ blueprint, initialBuildId = null }) {
  const slots = blueprint.slots || []
  const userBp = useUserBlueprints()

  // Find the user's saved row for THIS blueprint (uuid-keyed) and any
  // builds attached to it.
  const savedRow = useMemo(() => {
    if (!blueprint?.uuid) return null
    return (userBp.data?.items || []).find(r => r.blueprint_uuid === blueprint.uuid) || null
  }, [userBp.data, blueprint?.uuid])
  const builds = savedRow?.builds || []

  const defaultQualities = () => Object.fromEntries(slots.map((s, i) => [i, 500]))

  // currentBuildId: which saved build the editor is "tracking".
  //   null    → unsaved scratch buffer (will create a new build on save)
  //   number  → existing build id (Save = update; Save As = new copy)
  const [currentBuildId, setCurrentBuildId] = useState(null)
  const [qualities, setQualities] = useState(defaultQualities)
  const [nickname, setNickname] = useState('')
  const [hydrated, setHydrated] = useState(false)

  // On first arrival, if `?build=:id` was provided, load that specific
  // build. Otherwise pick the first build for this BP. Otherwise fall
  // back to the legacy quality_config_json (pre-mig 0226 saves).
  useEffect(() => {
    if (hydrated || !savedRow) return
    const target = initialBuildId
      ? builds.find(b => b.id === initialBuildId)
      : builds[0]
    if (target) {
      setCurrentBuildId(target.id)
      setNickname(target.name || '')
      if (target.quality_config) {
        setQualities(prev => {
          const next = { ...prev }
          for (const [k, v] of Object.entries(target.quality_config)) next[k] = v
          return next
        })
      }
    } else if (savedRow.quality_config) {
      // Legacy single-config row (will get migrated when the user re-saves).
      if (savedRow.quality_config) {
        setQualities(prev => {
          const next = { ...prev }
          for (const [k, v] of Object.entries(savedRow.quality_config)) next[k] = v
          return next
        })
      }
      if (savedRow.nickname) setNickname(savedRow.nickname)
    }
    setHydrated(true)
  }, [savedRow, builds, hydrated])

  // Switch to a different build (or scratch).
  const loadBuild = (build) => {
    if (!build) {
      setCurrentBuildId(null)
      setNickname('')
      setQualities(defaultQualities())
      return
    }
    setCurrentBuildId(build.id)
    setNickname(build.name || '')
    setQualities(prev => {
      const next = defaultQualities()
      for (const [k, v] of Object.entries(build.quality_config || {})) next[k] = v
      return next
    })
  }

  const setSlotQuality = (index, value) => {
    setQualities(prev => ({ ...prev, [index]: value }))
  }

  const baseStats = blueprint.base_stats || null

  // Some blueprints (notably ship-mounted vehicle weapons) have crafting
  // slots but no modifier rows — moving the quality sliders has no effect
  // on stats. Detect this so we can show an explainer banner instead of
  // letting users wonder why nothing changes.
  const hasAnyModifiers = slots.some(s => s.modifiers && s.modifiers.length > 0)

  // Compute multipliers for each stat
  const { statPreview, dmgMultiplier, rpmMultiplier } = useMemo(() => {
    const statMap = new Map()

    slots.forEach((slot, slotIndex) => {
      if (!slot.modifiers) return
      slot.modifiers.forEach(mod => {
        const key = mod.key || mod.name
        if (!statMap.has(key)) {
          statMap.set(key, { name: mod.name, key, crafted: 1 })
        }
        const entry = statMap.get(key)
        entry.crafted *= interpolateModifier(mod, qualities[slotIndex] || 0)
      })
    })

    const dmg = statMap.get('weapon_damage')?.crafted ?? 1
    const rpm = statMap.get('weapon_firerate')?.crafted ?? 1

    const preview = [...statMap.values()].map(stat => ({
      key: stat.key,
      name: stat.name,
      improvement: multiplierToImprovement(stat.key, stat.crafted),
      actualValues: computeActualValue(stat.key, baseStats, stat.crafted),
      multiplier: stat.crafted,
    }))

    return { statPreview: preview, dmgMultiplier: dmg, rpmMultiplier: rpm }
  }, [slots, qualities, baseStats])

  if (slots.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>No material slots to simulate.</p>
      </div>
    )
  }

  // Build table rows
  const rows = []

  // Modified stats first (damage, fire rate)
  for (const stat of statPreview) {
    if (stat.actualValues) {
      rows.push({
        label: getStatLabel(stat.key, stat.name),
        _key: stat.key,
        base: `${formatActualValue(stat.actualValues.base, stat.actualValues.decimals)} ${stat.actualValues.unit}`,
        crafted: `${formatActualValue(stat.actualValues.crafted, stat.actualValues.decimals)} ${stat.actualValues.unit}`,
        description: formatDescription(stat.key, stat.improvement),
        modified: true,
        _improvement: stat.improvement,
      })
    }
  }

  // DPS (derived)
  if (baseStats?.dps) {
    const craftedDPS = computeDPS(
      (baseStats.damage || 0) * dmgMultiplier,
      (baseStats.rounds_per_minute || 0) * rpmMultiplier
    )
    if (craftedDPS) {
      const improvement = ((craftedDPS / baseStats.dps) - 1) * 100
      rows.push({
        label: 'DPS',
        _key: 'dps',
        _tooltip: 'Damage per second — calculated from Damage × RPM / 60',
        base: formatActualValue(baseStats.dps, 1),
        crafted: formatActualValue(craftedDPS, 1),
        description: Math.abs(improvement) < 0.05 ? 'no change' : `${improvement > 0 ? '+' : ''}${improvement.toFixed(1)}%`,
        modified: true,
        _improvement: improvement,
      })
    }
  }

  // Unmodified base stats
  if (baseStats?.spread_min != null && baseStats?.spread_max != null) {
    rows.push({ label: 'Spread', _tooltip: 'Bullet spread cone — not affected by crafting', base: `${formatActualValue(baseStats.spread_min, 1)} – ${formatActualValue(baseStats.spread_max, 1)}`, crafted: '', description: '' })
  }
  if (baseStats?.effective_range != null) {
    rows.push({ label: 'Effective Range', _tooltip: 'Maximum effective distance — not affected by crafting', base: `${formatActualValue(baseStats.effective_range, 0)} m`, crafted: '', description: '' })
  }
  if (baseStats?.projectile_speed != null) {
    rows.push({ label: 'Projectile Speed', _tooltip: 'How fast bullets travel — not affected by crafting', base: `${formatActualValue(baseStats.projectile_speed, 0)} m/s`, crafted: '', description: '' })
  }
  if (baseStats?.ammo_capacity != null) {
    rows.push({ label: 'Ammo', _tooltip: 'Magazine capacity — not affected by crafting', base: `${formatActualValue(baseStats.ammo_capacity, 0)} rds`, crafted: '', description: '' })
  }

  // Multiplier-only stats (recoil) — no numeric base value, only a multiplier
  for (const stat of statPreview) {
    if (!stat.actualValues) {
      rows.push({
        label: getStatLabel(stat.key, stat.name),
        _key: stat.key,
        base: 'Base',
        _baseTooltip: 'Recoil in Star Citizen is driven by Bézier curves that define the kick pattern over time — there\'s no single numeric value to show. The crafting multiplier scales the curve output: ×0.800 means 80% of the original curve amplitude, reducing felt recoil by 20%. "Base" = unmodified curve (×1.000).',
        crafted: `×${stat.multiplier.toFixed(3)}`,
        description: formatDescription(stat.key, stat.improvement),
        modified: true,
        _improvement: stat.improvement,
      })
    }
  }

  // Color helper for improvement values
  const improvementColor = (imp) => {
    if (Math.abs(imp) < 0.05) return { text: 'text-gray-500', glow: '' }
    if (imp > 5) return { text: 'text-sc-accent', glow: 'rgba(34,211,238,0.3)' }
    if (imp > 0) return { text: 'text-amber-400', glow: 'rgba(245,158,11,0.3)' }
    return { text: 'text-red-400', glow: 'rgba(239,68,68,0.3)' }
  }

  // Assign colors to each row
  for (const row of rows) {
    row.colors = row.modified ? improvementColor(row._improvement ?? 0) : { text: 'text-gray-600', glow: '' }
  }

  // Static info rows
  const infoRows = []
  if (baseStats?.damage_type) infoRows.push({ label: 'Damage Type', value: baseStats.damage_type })
  if (baseStats?.fire_modes) infoRows.push({ label: 'Fire Modes', value: baseStats.fire_modes })

  const [saveState, setSaveState] = useState('idle') // idle | saving | saved | error
  const [saveError, setSaveError] = useState(null)

  // Save: if the editor is tracking an existing build (currentBuildId),
  // PATCH it. Otherwise POST a new build under this blueprint.
  const handleSave = async () => {
    if (!blueprint?.uuid) return
    const trimmedName = nickname.trim()
    if (!trimmedName) {
      setSaveError('Build name is required')
      setSaveState('error')
      setTimeout(() => setSaveState('idle'), 3000)
      return
    }
    setSaveState('saving')
    setSaveError(null)
    try {
      if (currentBuildId) {
        await updateBlueprintBuild(currentBuildId, {
          name: trimmedName,
          qualityConfig: qualities,
        })
      } else {
        const result = await createBlueprintBuild({
          blueprintUuid: blueprint.uuid,
          name: trimmedName,
          qualityConfig: qualities,
        })
        if (result?.id) setCurrentBuildId(result.id)
      }
      setSaveState('saved')
      await userBp.refetch?.()
      setTimeout(() => setSaveState('idle'), 1800)
    } catch (e) {
      setSaveState('error')
      setSaveError(e?.message || 'Save failed')
      setTimeout(() => setSaveState('idle'), 3000)
    }
  }

  // Save As: always create a new build, even if the editor was tracking one.
  const handleSaveAsNew = async () => {
    setCurrentBuildId(null)
    // Defer save — user must rename to avoid UNIQUE collision with the
    // tracked build.
    setNickname((n) => n ? `${n} (copy)` : '')
  }

  const handleDeleteCurrent = async () => {
    if (!currentBuildId) return
    if (!confirm('Delete this build? Your slider state will reset.')) return
    try {
      await deleteBlueprintBuild(currentBuildId)
      setCurrentBuildId(null)
      setNickname('')
      setQualities(defaultQualities())
      await userBp.refetch?.()
    } catch (e) {
      console.error('Failed to delete build', e)
    }
  }

  return (
    <div className="space-y-5">
      {!hasAnyModifiers && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.04] px-4 py-3 text-xs text-amber-200/90">
          <span className="font-semibold">No quality scaling for this blueprint.</span>{' '}
          Stats are fixed at the base values shown below — sliders below have
          no effect. This is currently common for ship-mounted vehicle weapons.
        </div>
      )}

      {/* Save panel — build picker + name + Save / Save As / Delete */}
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 space-y-3">
        {builds.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-gray-500 mr-1">
              Builds
            </span>
            {builds.map(b => (
              <button
                key={b.id}
                type="button"
                onClick={() => loadBuild(b)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-medium border transition-all ${
                  currentBuildId === b.id
                    ? 'bg-sc-accent/10 text-sc-accent border-sc-accent/40'
                    : 'bg-white/[0.04] text-gray-400 border-white/[0.08] hover:text-white'
                }`}
              >
                <Bookmark className="w-3 h-3" />
                {b.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => loadBuild(null)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-medium border transition-all ${
                currentBuildId === null
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-white/[0.04] text-gray-500 border-white/[0.08] border-dashed hover:text-white'
              }`}
              title="Start a new build"
            >
              <Plus className="w-3 h-3" />
              New build
            </button>
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">
              {currentBuildId ? 'Editing build' : 'New build name'}
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="e.g. Bang bang Bow, Max DPS, Stealth..."
              maxLength={100}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-sc-accent/40"
            />
          </div>
          <div className="flex items-center gap-2 self-end">
            {currentBuildId && (
              <>
                <button
                  type="button"
                  onClick={handleSaveAsNew}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[10px] font-medium border border-white/[0.06] text-gray-400 hover:text-sc-accent hover:border-sc-accent/30 transition-all"
                  title="Save as a new build (rename first to avoid collision)"
                >
                  <Plus className="w-3 h-3" />
                  Save As
                </button>
                <button
                  type="button"
                  onClick={handleDeleteCurrent}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[10px] font-medium border border-white/[0.06] text-gray-500 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/[0.04] transition-all"
                  title="Delete this build"
                >
                  <Trash2 className="w-3 h-3" />
                  Delete
                </button>
              </>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saveState === 'saving'}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-medium transition-all ${
                saveState === 'saved'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : saveState === 'error'
                  ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                  : 'bg-sc-accent/10 text-sc-accent border border-sc-accent/30 hover:bg-sc-accent/15 cursor-pointer'
              } ${saveState === 'saving' ? 'opacity-60' : ''}`}
            >
              {saveState === 'saved' ? <Check className="w-3 h-3" /> : <Bookmark className="w-3 h-3" />}
              {saveState === 'saved' ? 'Saved' : saveState === 'saving' ? 'Saving...' : saveState === 'error' ? 'Failed' : currentBuildId ? 'Update' : 'Save Build'}
            </button>
          </div>
        </div>

        {saveError && (
          <p className="text-[10px] text-red-400">{saveError}</p>
        )}
      </div>

      {/* Quality sliders — full width */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs uppercase tracking-wider text-gray-500">Material Quality</h4>
          <span className="text-[10px] text-gray-600">Drag sliders to preview crafting effects</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {slots.map((slot, i) => (
            <QualitySlider
              key={i}
              slot={slot}
              value={qualities[i] || 0}
              onChange={v => setSlotQuality(i, v)}
            />
          ))}
        </div>
      </div>

      {/* Stats table */}
      <div className="border border-white/[0.06] rounded-lg overflow-hidden">
        <table className="w-full text-sm table-fixed">
          <colgroup>
            <col className="w-[28%]" />
            <col className="w-[22%]" />
            <col className="w-[22%]" />
            <col className="w-[28%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-white/[0.08] bg-white/[0.02]">
              <th className="text-left text-[10px] uppercase tracking-wider text-gray-500 font-medium px-4 py-2.5">Stat</th>
              <th className="text-left text-[10px] uppercase tracking-wider text-gray-500 font-medium px-4 py-2.5">Base Value</th>
              <th className="text-left text-[10px] uppercase tracking-wider text-gray-500 font-medium px-4 py-2.5">Crafted Value</th>
              <th className="text-left text-[10px] uppercase tracking-wider text-gray-500 font-medium px-4 py-2.5">Description</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const c = row.colors
              const statTooltip = row._tooltip || (row._key && getStatDescription(row._key))
              return (
                <tr key={i} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-2 text-xs text-gray-300 font-medium">
                    {statTooltip ? (
                      <Tooltip text={statTooltip}>
                        {row.label}
                        <HelpCircle className="w-3 h-3 text-gray-600 group-hover/tip:text-sc-accent transition-colors" />
                      </Tooltip>
                    ) : row.label}
                  </td>
                  <td className="px-4 py-2 text-xs font-mono text-gray-400 tabular-nums">
                    {row._baseTooltip ? (
                      <Tooltip text={row._baseTooltip} position="right">
                        <span className="border-b border-dashed border-gray-600">{row.base}</span>
                      </Tooltip>
                    ) : row.base}
                  </td>
                  <td className="px-4 py-2 text-xs font-mono tabular-nums">
                    {row.crafted ? (
                      <span
                        className={row.modified ? c.text : 'text-gray-600'}
                        style={c.glow ? { textShadow: `0 0 8px ${c.glow}` } : undefined}
                      >
                        {row.crafted}
                      </span>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {row.description ? (
                      <span
                        className={row.modified ? c.text : 'text-gray-600'}
                        style={c.glow ? { textShadow: `0 0 6px ${c.glow}` } : undefined}
                      >
                        {row.description}
                      </span>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
            {/* Static info rows — span columns */}
            {infoRows.map((row, i) => (
              <tr key={`info-${i}`} className="border-b border-white/[0.04] last:border-0">
                <td className="px-4 py-2 text-xs text-gray-300 font-medium">{row.label}</td>
                <td colSpan={3} className="px-4 py-2 text-xs text-gray-400">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
