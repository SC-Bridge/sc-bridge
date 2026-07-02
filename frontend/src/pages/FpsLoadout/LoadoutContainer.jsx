// frontend/src/pages/FpsLoadout/LoadoutContainer.jsx
//
// Orchestrator for the FPS Loadout page: wires the paperdoll (MyLoadout), the
// weapon bench, the catalog (ItemSource) and the summary (LoadoutStats)
// together against the /fps-loadouts + weapon-bench APIs. Absorbs the old
// WeaponBenchContainer's weapon/attachment resolution and saved-build flow.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  pointerWithin, rectIntersection,
} from '@dnd-kit/core'
import {
  useFpsLoadouts, createFpsLoadout, putLoadoutSlot,
  useCrafting, useWeaponBench, useWeaponBuilds, createWeaponBuild, deleteWeaponBuild,
  useUserBlueprints,
  useLootCollection, useLootWishlist,
} from '../../hooks/useAPI'
import { useSession } from '../../lib/auth-client'
import MyLoadout from './MyLoadout'
import WeaponBench from './WeaponBench'
import SavedBuilds from './SavedBuilds'
import ItemSource from './ItemSource'
import LoadoutStats from './LoadoutStats'
import { combinedMultipliers, computeBenchStats } from './weaponBenchStats'
import { attachmentSlot } from './attachmentCompat'
import { resolveDrop } from './dnd'

// Forgiving collision: prefer the droppable directly under the pointer, but
// fall back to any droppable the dragged rect overlaps — so a near-miss on a
// small slot still lands instead of silently cancelling.
function forgivingCollision(args) {
  const within = pointerWithin(args)
  return within.length > 0 ? within : rectIntersection(args)
}

// Palette lifted from the FPS loadout visual system (see MyLoadout.jsx / mock v5).
const CYAN = '#00e8ff'
const CYAN_DIM = '#5fbecb'
const ICE_DIM = 'rgba(192,246,254,0.45)'
const LINE = 'rgba(120,200,220,0.14)'
const LINE2 = 'rgba(120,200,220,0.30)'
const PANEL = '#0b1218'
const OWN = '#36e08a'
const WANT = '#f3b03a'

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
  const blueprintsQ = useUserBlueprints()
  const collectionQ = useLootCollection(isAuthed)
  const wishlistQ = useLootWishlist(isAuthed)

  const [currentLoadoutId, setCurrentLoadoutId] = useState(null)
  const [selectedSlot, setSelectedSlot] = useState('primary')
  // Transient override for the selected slot — set when the user picks a
  // weapon/build from ItemSource, before it's committed via "Set to loadout".
  const [pick, setPick] = useState(null) // { weaponUuid, buildId, config }
  // Live drag payload while a dnd-kit drag is in flight (drives target highlights
  // + the DragOverlay ghost); equipRequest tells the bench to equip an attachment
  // after a successful drop (seq bumps so the same attachment can be re-dropped).
  const [activeDrag, setActiveDrag] = useState(null)
  const [equipRequest, setEquipRequest] = useState(null) // { uuid, seq }
  const equipSeqRef = useRef(0)
  const [saving, setSaving] = useState(false)
  const [newLoadoutError, setNewLoadoutError] = useState(null)
  const liveConfigRef = useRef({ qualities: {}, attachments: {} })

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

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
      b.type === 'weapons' && (b.slots?.length > 0) && b.base_stats && b.base_stats.ammo_capacity != null
      // Named/skin variants (e.g. FS-9 "Blacklist" LMG) and $templates entries aren't
      // independently craftable — only base weapons (e.g. FS-9 LMG) are.
      && !(b.base_stats?.item_name || b.name || '').includes('"')
      && b.sub_type !== '$templates'),
    [craftingQ.data],
  )
  // Map each attachment onto one of the three modelled bench slots
  // (optic/barrel/underbarrel) from its real port type. Magazines and other
  // unmodelled port types resolve to null and are dropped — they'd otherwise
  // all collapse into a single slot.
  const attachments = useMemo(
    () => (benchQ.data?.attachments || [])
      .map((a) => ({ ...a, uuid: a.uuid || String(a.id), slot: attachmentSlot(a) }))
      .filter((a) => a.slot != null),
    [benchQ.data],
  )
  const allBuilds = buildsQ.data?.items || []

  // Default weapon for the bench when nothing is saved/picked yet — the FS-9
  // LMG, so a fresh slot doesn't land on whatever weapon sorts first
  // alphabetically (previously a crossbow).
  const defaultWeapon = useMemo(() => {
    const exact = weapons.find((w) => (w.base_stats?.item_name || '') === 'FS-9 LMG')
    if (exact) return exact
    const partial = weapons.find((w) => (w.base_stats?.item_name || '').includes('FS-9'))
    return partial || weapons[0] || null
  }, [weapons])

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
  const activeWeaponUuid = pick?.weaponUuid ?? savedSlot?.item_uuid ?? defaultWeapon?.uuid ?? null
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

  // All of the user's saved weapon-bench builds, enriched with their weapon's friendly
  // name so a build for a weapon other than the one currently on the bench is still
  // identifiable when it surfaces via Item Source search (see buildsForSource below).
  const weaponBuildsForSource = useMemo(
    () => allBuilds.map((b) => {
      const bp = weapons.find((w) => w.uuid === b.weapon_uuid)
      return { ...b, weaponName: bp ? (bp.base_stats?.item_name || bp.name) : null }
    }),
    [allBuilds, weapons],
  )

  // Quality-sim "designs" saved from the Crafting page (user_blueprint_builds via
  // createBlueprintBuild) — these never appeared in the loadout's Item Source before,
  // even though they're a legitimate saved config for a weapon. One entry per named
  // build, plus the legacy top-level quality_config (pre-named-builds saves) if present.
  const craftingDesigns = useMemo(() => {
    const items = blueprintsQ.data?.items || []
    const out = []
    for (const item of items) {
      const weaponName = item.item_name
      for (const build of item.builds || []) {
        out.push({
          id: `bp-${item.blueprint_uuid}-${build.id}`,
          name: build.name || weaponName,
          weaponUuid: item.blueprint_uuid,
          weaponName,
          config: { qualities: build.quality_config, attachments: {} },
        })
      }
      if (item.quality_config) {
        out.push({
          id: `bp-${item.blueprint_uuid}-legacy`,
          name: weaponName,
          weaponUuid: item.blueprint_uuid,
          weaponName,
          config: { qualities: item.quality_config, attachments: {} },
        })
      }
    }
    return out
  }, [blueprintsQ.data])

  // Combined list handed to ItemSource — crafting designs first (they're the newer,
  // more-often-used source), weapon-bench builds after.
  const buildsForSource = useMemo(
    () => [...craftingDesigns, ...weaponBuildsForSource],
    [craftingDesigns, weaponBuildsForSource],
  )

  const onConfigChange = useCallback((cfg) => { liveConfigRef.current = cfg }, [])

  const handlePick = (item) => {
    if (!item) return
    // A saved design/build — either a user_weapon_builds row (weapon_uuid) or a
    // crafting-page quality-sim build surfaced via useUserBlueprints (weaponUuid).
    // Either way: load that design's own weapon into the bench (not whatever's
    // currently loaded) plus its exact config.
    const weaponUuid = item.weapon_uuid || item.weaponUuid
    if (weaponUuid) {
      // Only user_weapon_builds rows have a weapon_build_id worth persisting on
      // "Set to loadout" — crafting designs aren't rows in that table.
      const buildId = item.weapon_uuid ? item.id : null
      setPick({ weaponUuid, buildId, config: { ...(item.config || {}), name: item.name } })
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

  // Persist an item into a loadout slot, creating the loadout on first save.
  const persistSlot = async (slotKey, payload) => {
    setSaving(true)
    try {
      let loadoutId = currentLoadoutId
      if (!loadoutId) {
        const created = await createFpsLoadout({ name: 'My Loadout' })
        loadoutId = created.id
        setCurrentLoadoutId(loadoutId)
      }
      await putLoadoutSlot(loadoutId, slotKey, payload)
      await loadoutsQ.refetch()
    } finally {
      setSaving(false)
    }
  }

  const handleSetToLoadout = async () => {
    if (!blueprint) return
    await persistSlot(selectedSlot, {
      itemUuid: blueprint.uuid,
      itemName: blueprint.base_stats?.item_name || blueprint.name,
      weaponBuildId: pick?.buildId ?? null,
      config: liveConfigRef.current,
    })
    setPick(null)
  }

  const handleDragStart = (e) => setActiveDrag(e.active?.data?.current || null)
  const handleDragCancel = () => setActiveDrag(null)

  const handleDragEnd = async (e) => {
    setActiveDrag(null)
    const action = resolveDrop(e.active?.data?.current, e.over?.data?.current, blueprint)
    if (!action) return
    if (action.type === 'equip-attachment') {
      // The bench owns equipped state — signal it (seq-guarded so the same
      // attachment can be dropped again after removal).
      equipSeqRef.current += 1
      setEquipRequest({ uuid: action.attachment.uuid, seq: equipSeqRef.current })
      return
    }
    if (action.type === 'equip-weapon') {
      // Approved UX: dropping a weapon on a paperdoll slot equips + saves it
      // immediately (fresh default config); the bench then loads it for tuning.
      const w = action.weapon
      await persistSlot(action.slotKey, {
        itemUuid: w.uuid,
        itemName: w.base_stats?.item_name || w.name,
        weaponBuildId: null,
        config: { qualities: {}, attachments: {} },
      })
      setSelectedSlot(action.slotKey)
      return
    }
    if (action.type === 'equip-build') {
      const b = action.build
      const weaponUuid = b.weapon_uuid || b.weaponUuid
      const bp = weapons.find((x) => x.uuid === weaponUuid)
      if (!bp) return
      await persistSlot(action.slotKey, {
        itemUuid: bp.uuid,
        itemName: bp.base_stats?.item_name || bp.name,
        // Only user_weapon_builds rows have a persistable build id.
        weaponBuildId: b.weapon_uuid ? b.id : null,
        config: { ...(b.config || {}), name: b.name },
      })
      setSelectedSlot(action.slotKey)
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
        name: slot.item_name || bp.base_stats?.item_name || bp.name,
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

  // Ghost label for the DragOverlay — the name of whatever is being dragged.
  const dragLabel = activeDrag?.kind === 'weapon'
    ? (activeDrag.weapon?.base_stats?.item_name || activeDrag.weapon?.name)
    : activeDrag?.kind === 'build' ? activeDrag.build?.name
    : activeDrag?.kind === 'attachment' ? activeDrag.attachment?.name
    : null

  return (
    <DndContext sensors={sensors} collisionDetection={forgivingCollision}
      onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
    <div className="flex flex-col h-full overflow-hidden" style={{ padding: '4px 10px 14px' }}>
      <TopBar loadouts={loadouts} currentLoadoutId={currentLoadoutId} onSelect={setCurrentLoadoutId}
        onNew={handleNewLoadout} newLoadoutError={newLoadoutError} />

      <div className="grid gap-3 mt-3 flex-1 min-h-0" style={{ gridTemplateColumns: '360px 1fr 320px' }}>
        <div className="rounded flex flex-col min-h-0" style={{ border: `1px solid ${LINE}`, background: PANEL }}>
          <ColHeader><b style={{ color: '#fff' }}>My Loadout</b> &mdash; {currentLoadout.name}</ColHeader>
          <div className="flex-1 overflow-y-auto min-h-0" style={{ padding: '11px 12px' }}>
            <MyLoadout loadout={currentLoadout} selectedSlot={selectedSlot} onSelectSlot={setSelectedSlot} activeDrag={activeDrag} />
          </div>
        </div>

        <div className="rounded flex flex-col min-h-0" style={{ border: `1px solid ${LINE}`, background: PANEL }}>
          <ColHeader>
            <b style={{ color: '#fff' }}>Craft Bench</b> &mdash; {slotLabel} slot
            <span className="flex-1" />
            {blueprintOwned && <span style={{ color: OWN, fontSize: 11 }}>&#10003; OWNED</span>}
          </ColHeader>
          <div className="flex-1 overflow-y-auto min-h-0" style={{ padding: '11px 12px' }}>
            {!isWeaponSlot ? (
              <div className="text-center py-12 text-sm italic" style={{ color: ICE_DIM }} data-testid="slot-placeholder">
                {slotLabel} bench coming in slice 2
              </div>
            ) : blueprint ? (
              <>
                <WeaponBench blueprint={blueprint} attachments={attachments}
                  initialConfig={initialConfig} onConfigChange={onConfigChange}
                  equipRequest={equipRequest} activeDrag={activeDrag} />
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

        <div className="rounded flex flex-col min-h-0" style={{ border: `1px solid ${LINE}`, background: PANEL }}>
          <ColHeader>
            <b style={{ color: '#fff' }}>Item Source</b>
            <span className="flex-1" />
            <span style={{ color: ICE_DIM, fontSize: 10 }}>for {slotLabel}</span>
          </ColHeader>
          <div className="flex-1 overflow-y-auto min-h-0" style={{ padding: '11px 12px' }}>
            <ItemSource key={selectedSlot} slotKey={selectedSlot} weapon={blueprint} weapons={weapons} attachments={attachments}
              builds={buildsForSource} ownership={ownership} onPick={handlePick} />
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 mt-3">
        <LoadoutStats weaponStats={weaponStats} />
      </div>
    </div>
    <DragOverlay dropAnimation={null}>
      {dragLabel ? (
        <div
          className="rounded pointer-events-none"
          style={{
            padding: '6px 12px', fontSize: 12, color: CYAN, background: 'rgba(7,16,22,0.92)',
            border: `1px solid ${CYAN}`, boxShadow: '0 4px 18px rgba(0,0,0,0.5), 0 0 12px rgba(0,232,255,0.25)',
          }}
        >
          {dragLabel}
        </div>
      ) : null}
    </DragOverlay>
    </DndContext>
  )
}
