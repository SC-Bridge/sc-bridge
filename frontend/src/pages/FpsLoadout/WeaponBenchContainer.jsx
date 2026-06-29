// frontend/src/pages/FpsLoadout/WeaponBenchContainer.jsx
import React, { useMemo, useState } from 'react'
import { useCrafting, useWeaponBench } from '../../hooks/useAPI'
import WeaponBench from './WeaponBench'

const SLOT_FROM_SUBTYPE = { barrel: 'barrel', optic: 'optic', scope: 'optic', underbarrel: 'underbarrel' }

export default function WeaponBenchContainer() {
  const crafting = useCrafting()
  const bench = useWeaponBench()
  const [selected, setSelected] = useState(0)

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

  if (crafting.loading) return <div className="text-gray-500 text-sm p-4">Loading…</div>
  if (!weapons.length) return <div className="text-gray-500 text-sm p-4">No craftable weapons available.</div>

  const blueprint = weapons[selected] || weapons[0]
  return (
    <div className="space-y-4">
      <select role="combobox" aria-label="Select weapon" value={selected}
        onChange={(e) => setSelected(Number(e.target.value))}
        className="bg-white/[0.04] border border-white/10 rounded px-2.5 py-1.5 text-sm text-gray-200">
        {weapons.map((w, i) => <option key={w.name + i} value={i}>{w.name}</option>)}
      </select>
      <WeaponBench blueprint={blueprint} attachments={attachments} />
    </div>
  )
}
