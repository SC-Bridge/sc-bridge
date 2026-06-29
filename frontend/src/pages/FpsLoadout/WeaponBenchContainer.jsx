// frontend/src/pages/FpsLoadout/WeaponBenchContainer.jsx
import React, { useCallback, useMemo, useRef, useState } from 'react'
import { useCrafting, useWeaponBench, useWeaponBuilds, createWeaponBuild, deleteWeaponBuild } from '../../hooks/useAPI'
import WeaponBench from './WeaponBench'
import SavedBuilds from './SavedBuilds'

const SLOT_FROM_SUBTYPE = { barrel: 'barrel', optic: 'optic', scope: 'optic', underbarrel: 'underbarrel' }

export default function WeaponBenchContainer() {
  const crafting = useCrafting()
  const bench = useWeaponBench()
  const builds = useWeaponBuilds()
  const [selected, setSelected] = useState(0)
  const [loadedConfig, setLoadedConfig] = useState(null) // initialConfig for a loaded saved build
  const liveConfig = useRef({ qualities: {}, attachments: {} })

  const weapons = useMemo(
    () => (crafting.data?.blueprints || []).filter((b) => b.type === 'weapons' && (b.slots?.length > 0)),
    [crafting.data],
  )
  const attachments = useMemo(
    () => (bench.data?.attachments || []).map((a) => ({
      ...a, uuid: a.uuid || String(a.id), slot: SLOT_FROM_SUBTYPE[a.sub_type] || 'barrel',
    })),
    [bench.data],
  )

  const onConfigChange = useCallback((cfg) => { liveConfig.current = cfg }, [])

  const selectWeapon = (i) => { setSelected(i); setLoadedConfig(null) }

  const handleSave = (name) => {
    const blueprint = weapons[selected]
    if (!blueprint?.uuid) return
    createWeaponBuild({ weaponUuid: blueprint.uuid, name, config: liveConfig.current })
      .then(() => builds.refetch?.())
  }
  const handleDelete = (b) => deleteWeaponBuild(b.id).then(() => builds.refetch?.())
  const handleLoad = (b) => {
    // Only load builds whose weapon is available (e.g. skip builds from a different
    // game version) — otherwise a foreign config would land on the current weapon.
    const idx = weapons.findIndex((w) => w.uuid === b.weapon_uuid)
    if (idx < 0) return
    setSelected(idx)
    setLoadedConfig({ ...(b.config || {}), name: b.name })
  }

  if (crafting.loading) return <div className="text-gray-500 text-sm p-4">Loading…</div>
  if (!weapons.length) return <div className="text-gray-500 text-sm p-4">No craftable weapons available.</div>

  const blueprint = weapons[selected] || weapons[0]
  return (
    <div className="space-y-4">
      <select role="combobox" aria-label="Select weapon" value={selected}
        onChange={(e) => selectWeapon(Number(e.target.value))}
        className="bg-white/[0.04] border border-white/10 rounded px-2.5 py-1.5 text-sm text-gray-200">
        {weapons.map((w, i) => <option key={w.name + i} value={i}>{w.name}</option>)}
      </select>
      <WeaponBench blueprint={blueprint} attachments={attachments}
        initialConfig={loadedConfig} onConfigChange={onConfigChange} />
      <SavedBuilds items={builds.data?.items || []} canSave={!!blueprint}
        onSave={handleSave} onDelete={handleDelete} onLoad={handleLoad} />
    </div>
  )
}
