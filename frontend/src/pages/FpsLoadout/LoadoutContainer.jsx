// frontend/src/pages/FpsLoadout/LoadoutContainer.jsx
//
// Orchestrator for the FPS Loadout page: wires the paperdoll (MyLoadout), the
// weapon bench, the catalog (ItemSource) and the summary (LoadoutStats)
// together against the /fps-loadouts + weapon-bench APIs. Absorbs the old
// WeaponBenchContainer's weapon/attachment resolution and saved-build flow.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  useFpsLoadouts, createFpsLoadout, putLoadoutSlot,
  useCrafting, useWeaponBench, useWeaponBuilds, createWeaponBuild, deleteWeaponBuild,
  useLootCollection, useLootWishlist,
} from '../../hooks/useAPI'
import { useSession } from '../../lib/auth-client'
import MyLoadout from './MyLoadout'
import WeaponBench from './WeaponBench'
import SavedBuilds from './SavedBuilds'
import ItemSource from './ItemSource'
import LoadoutStats from './LoadoutStats'
import { combinedMultipliers, computeBenchStats } from './weaponBenchStats'

// Palette lifted from the FPS loadout visual system (see MyLoadout.jsx / mock v5).
const CYAN = '#00e8ff'
const CYAN_DIM = '#5fbecb'
const ICE_DIM = 'rgba(192,246,254,0.45)'
const LINE = 'rgba(120,200,220,0.14)'
const LINE2 = 'rgba(120,200,220,0.30)'
const PANEL = '#0b1218'
const OWN = '#36e08a'
const WANT = '#f3b03a'

const SLOT_FROM_SUBTYPE = { barrel: 'barrel', optic: 'optic', scope: 'optic', underbarrel: 'underbarrel' }
const WEAPON_SLOTS = new Set(['primary', 'secondary', 'sidearm'])
const WEAPON_SLOT_LABEL = { primary: 'Primary', secondary: 'Secondary', sidearm: 'Sidearm' }
const STAT_SLOT_KEYS = ['primary', 'secondary', 'sidearm']

// Shown when the signed-in user has no saved loadout yet — a transient,
// in-memory stand-in so the paperdoll/bench/source still render sensibly.
const EMPTY_LOADOUT = { id: null, name: 'Unsaved Loadout', slots: [] }

function ColHeader({ children }) {
  return (
    <div
      className="flex items-center gap-2 uppercase"
      style={{ padding: '9px 12px', borderBottom: `1px solid ${LINE}`, letterSpacing: '2.4px', fontSize: 11, color: CYAN_DIM }}
    >
      {children}
    </div>
  )
}

function TopBar({ loadouts, currentLoadoutId, onSelect, onNew, newLoadoutError }) {
  return (
    <div className="flex items-center gap-3 flex-wrap" style={{ padding: '4px 8px 12px', borderBottom: `1px solid ${LINE}` }}>
      <div className="font-bold uppercase" style={{ letterSpacing: 3, color: '#fff', fontSize: 14 }}>
        FPS Loadout <small style={{ color: CYAN }}>// SC BRIDGE</small>
      </div>
      {loadouts.map((l) => {
        const active = l.id === currentLoadoutId
        return (
          <button
            key={l.id}
            type="button"
            data-testid={`loadout-tab-${l.id}`}
            aria-pressed={active}
            onClick={() => onSelect(l.id)}
            className="rounded"
            style={{
              border: `1px solid ${active ? CYAN : LINE2}`,
              background: active ? 'rgba(0,232,255,0.12)' : 'rgba(0,232,255,0.05)',
              color: active ? CYAN : '#c0f6fe',
              padding: '5px 11px',
              fontSize: 12,
            }}
          >
            {l.name}
          </button>
        )
      })}
      <button
        type="button"
        data-testid="new-loadout"
        onClick={onNew}
        className="rounded"
        style={{ border: `1px solid ${LINE2}`, color: ICE_DIM, padding: '5px 11px', fontSize: 12 }}
      >
        + New
      </button>
      {newLoadoutError && (
        <span data-testid="new-loadout-error" style={{ color: WANT, fontSize: 11 }}>
          {newLoadoutError}
        </span>
      )}
      <div className="flex-1" />
      <div className="flex items-center gap-4" style={{ fontSize: 11, color: ICE_DIM }}>
        <span><b style={{ color: OWN, fontSize: 13 }}>&#10003;</b> Owned</span>
        <span><b style={{ color: WANT, fontSize: 13 }}>&#9671;</b> Aspirational</span>
      </div>
    </div>
  )
}

export default function LoadoutContainer() {
  const { data: session } = useSession()
  const isAuthed = !!session?.user

  const loadoutsQ = useFpsLoadouts()
  const craftingQ = useCrafting()
  const benchQ = useWeaponBench()
  const buildsQ = useWeaponBuilds()
  const collectionQ = useLootCollection(isAuthed)
  const wishlistQ = useLootWishlist(isAuthed)

  const [currentLoadoutId, setCurrentLoadoutId] = useState(null)
  const [selectedSlot, setSelectedSlot] = useState('primary')
  // Transient override for the selected slot — set when the user picks a
  // weapon/build from ItemSource, before it's committed via "Set to loadout".
  const [pick, setPick] = useState(null) // { weaponUuid, buildId, config }
  const [saving, setSaving] = useState(false)
  const [newLoadoutError, setNewLoadoutError] = useState(null)
  const liveConfigRef = useRef({ qualities: {}, attachments: {} })

  const loadouts = loadoutsQ.data?.items || []

  // Default to the user's first loadout once it loads.
  useEffect(() => {
    if (currentLoadoutId == null && loadouts.length > 0) setCurrentLoadoutId(loadouts[0].id)
  }, [loadouts, currentLoadoutId])

  // A transient pick only applies to the slot it was made for.
  useEffect(() => { setPick(null) }, [selectedSlot, currentLoadoutId])

  const currentLoadout = loadouts.find((l) => l.id === currentLoadoutId) || EMPTY_LOADOUT

  const weapons = useMemo(
    () => (craftingQ.data?.blueprints || []).filter((b) =>
      b.type === 'weapons' && (b.slots?.length > 0) && b.base_stats && b.base_stats.ammo_capacity != null),
    [craftingQ.data],
  )
  const attachments = useMemo(
    () => (benchQ.data?.attachments || []).map((a) => ({
      ...a, uuid: a.uuid || String(a.id), slot: SLOT_FROM_SUBTYPE[a.sub_type] || 'barrel',
    })),
    [benchQ.data],
  )
  const allBuilds = buildsQ.data?.items || []

  const ownership = useMemo(() => {
    const owned = new Set((collectionQ.data || []).map((c) => c.loot_uuid))
    const wishlisted = new Set((wishlistQ.data || []).map((w) => w.uuid))
    return { owned, wishlisted }
  }, [collectionQ.data, wishlistQ.data])

  const savedSlot = currentLoadout.slots?.find((s) => s.slot_key === selectedSlot) || null
  const isWeaponSlot = WEAPON_SLOTS.has(selectedSlot)

  // Resolve which blueprint the bench should show: a transient pick wins,
  // then the loadout's saved weapon for this slot, then just the first
  // available weapon so the bench isn't empty.
  const activeWeaponUuid = pick?.weaponUuid ?? savedSlot?.item_uuid ?? weapons[0]?.uuid ?? null
  const blueprint = isWeaponSlot ? (weapons.find((w) => w.uuid === activeWeaponUuid) || null) : null
  // Memoized so WeaponBench (which resets its in-progress edits whenever this
  // reference changes) only resets when the selected slot's source item
  // actually changes — not on every unrelated re-render (e.g. after Save
  // build triggers buildsQ.refetch()).
  const savedSlotConfigJSON = JSON.stringify(savedSlot?.config ?? null)
  const initialConfig = useMemo(() => {
    if (pick) return pick.config
    if (!savedSlot?.item_uuid) return null
    return { ...(savedSlot.config || {}), name: savedSlot.item_name }
    // Deps: savedSlotConfigJSON stands in for savedSlot.config (stable string vs. new object each render).
  }, [pick, savedSlot?.item_uuid, savedSlot?.item_name, savedSlotConfigJSON])

  const buildsForWeapon = useMemo(
    () => allBuilds.filter((b) => b.weapon_uuid === blueprint?.uuid),
    [allBuilds, blueprint],
  )

  const onConfigChange = useCallback((cfg) => { liveConfigRef.current = cfg }, [])

  const handlePick = (item) => {
    if (!item) return
    if (item.weapon_uuid) {
      // A saved build — load its weapon + its exact config.
      setPick({ weaponUuid: item.weapon_uuid, buildId: item.id, config: { ...(item.config || {}), name: item.name } })
    } else if (item.uuid && item.base_stats) {
      // A plain weapon blueprint — reset to a fresh config.
      setPick({ weaponUuid: item.uuid, buildId: null, config: null })
    }
    // Attachment picks (Item Source → Attach) aren't auto-equipped here —
    // the bench's own drag/click UI on its attachment slots handles that.
  }

  const handleNewLoadout = async () => {
    setNewLoadoutError(null)
    try {
      const created = await createFpsLoadout({ name: `Loadout ${loadouts.length + 1}` })
      await loadoutsQ.refetch()
      setCurrentLoadoutId(created.id)
    } catch (err) {
      setNewLoadoutError(err?.message || 'Could not create loadout.')
    }
  }

  const handleSetToLoadout = async () => {
    if (!blueprint) return
    setSaving(true)
    try {
      let loadoutId = currentLoadoutId
      if (!loadoutId) {
        const created = await createFpsLoadout({ name: 'My Loadout' })
        loadoutId = created.id
        setCurrentLoadoutId(loadoutId)
      }
      await putLoadoutSlot(loadoutId, selectedSlot, {
        itemUuid: blueprint.uuid,
        itemName: blueprint.name,
        weaponBuildId: pick?.buildId ?? null,
        config: liveConfigRef.current,
      })
      await loadoutsQ.refetch()
      setPick(null)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveBuild = (name) => {
    if (!blueprint?.uuid) return
    createWeaponBuild({ weaponUuid: blueprint.uuid, name, config: liveConfigRef.current })
      .then(() => buildsQ.refetch?.())
  }
  const handleDeleteBuild = (b) => deleteWeaponBuild(b.id).then(() => buildsQ.refetch?.())
  const handleLoadBuild = (b) => {
    if (b.weapon_uuid !== blueprint?.uuid) return
    setPick({ weaponUuid: b.weapon_uuid, buildId: b.id, config: { ...(b.config || {}), name: b.name } })
  }

  // Per-weapon-slot stats for the loadout summary footer — resolves each
  // slot's saved blueprint + config independently of whatever's on the bench.
  const weaponStats = useMemo(() => {
    return STAT_SLOT_KEYS.map((slotKey) => {
      const slot = currentLoadout.slots?.find((s) => s.slot_key === slotKey)
      if (!slot || !slot.item_uuid) return null
      const bp = weapons.find((w) => w.uuid === slot.item_uuid)
      if (!bp) return null
      const cfg = slot.config || {}
      const equippedAtts = Object.values(cfg.attachments || {})
        .map((uuid) => attachments.find((a) => a.uuid === uuid))
        .filter(Boolean)
      const m = combinedMultipliers(bp.slots, cfg.qualities || {}, equippedAtts)
      const stats = computeBenchStats(bp.base_stats, m)
      return {
        slot_key: slotKey,
        name: slot.item_name || bp.name,
        damage: stats.damage,
        rpm: stats.rpm,
        dps: stats.dps,
        recoil: stats.recoil,
        isDesign: Boolean(slot.weapon_build_id),
        attachments: Object.keys(cfg.attachments || {}),
      }
    }).filter(Boolean)
  }, [currentLoadout, weapons, attachments])

  const slotLabel = WEAPON_SLOT_LABEL[selectedSlot] || selectedSlot
  const blueprintOwned = Boolean(blueprint && ownership.owned.has(blueprint.uuid))

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ padding: '4px 10px 14px' }}>
      <TopBar loadouts={loadouts} currentLoadoutId={currentLoadoutId} onSelect={setCurrentLoadoutId}
        onNew={handleNewLoadout} newLoadoutError={newLoadoutError} />

      <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: '360px 1fr 320px' }}>
        <div className="rounded" style={{ border: `1px solid ${LINE}`, background: PANEL }}>
          <ColHeader><b style={{ color: '#fff' }}>My Loadout</b> &mdash; {currentLoadout.name}</ColHeader>
          <div style={{ padding: '11px 12px' }}>
            <MyLoadout loadout={currentLoadout} selectedSlot={selectedSlot} onSelectSlot={setSelectedSlot} />
          </div>
        </div>

        <div className="rounded" style={{ border: `1px solid ${LINE}`, background: PANEL }}>
          <ColHeader>
            <b style={{ color: '#fff' }}>Craft Bench</b> &mdash; {slotLabel} slot
            <span className="flex-1" />
            {blueprintOwned && <span style={{ color: OWN, fontSize: 11 }}>&#10003; OWNED</span>}
          </ColHeader>
          <div style={{ padding: '11px 12px' }}>
            {!isWeaponSlot ? (
              <div className="text-center py-12 text-sm italic" style={{ color: ICE_DIM }} data-testid="slot-placeholder">
                {slotLabel} bench coming in slice 2
              </div>
            ) : blueprint ? (
              <>
                <WeaponBench blueprint={blueprint} attachments={attachments}
                  initialConfig={initialConfig} onConfigChange={onConfigChange} />
                <button
                  type="button"
                  data-testid="set-to-loadout"
                  onClick={handleSetToLoadout}
                  disabled={saving}
                  className="w-full uppercase rounded disabled:opacity-50"
                  style={{ marginTop: 12, padding: 11, border: `1px solid ${CYAN}`, background: 'rgba(0,232,255,0.12)', color: CYAN, fontSize: 12, letterSpacing: 2, fontWeight: 600 }}
                >
                  &#10230; Set to loadout ({slotLabel})
                </button>
                <div className="mt-3">
                  <SavedBuilds items={buildsForWeapon} canSave={!!blueprint}
                    onSave={handleSaveBuild} onDelete={handleDeleteBuild} onLoad={handleLoadBuild} />
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-sm" style={{ color: ICE_DIM }}>No craftable weapons available.</div>
            )}
          </div>
        </div>

        <div className="rounded" style={{ border: `1px solid ${LINE}`, background: PANEL }}>
          <ColHeader>
            <b style={{ color: '#fff' }}>Item Source</b>
            <span className="flex-1" />
            <span style={{ color: ICE_DIM, fontSize: 10 }}>for {slotLabel}</span>
          </ColHeader>
          <div style={{ padding: '11px 12px' }}>
            <ItemSource key={selectedSlot} slotKey={selectedSlot} weapons={weapons} attachments={attachments}
              builds={buildsForWeapon} ownership={ownership} onPick={handlePick} />
          </div>
        </div>
      </div>

      <LoadoutStats weaponStats={weaponStats} />
    </div>
  )
}
