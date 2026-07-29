// frontend/src/pages/FpsLoadout/LoadoutContainer.jsx
//
// Orchestrator for the FPS Loadout page: wires the paperdoll (MyLoadout), the
// item bench, the catalog (ItemSource) and the summary (LoadoutStats)
// together against the /fps-loadouts + weapon-bench APIs. Absorbs the old
// WeaponBenchContainer's weapon/attachment resolution and saved-build flow,
// generalized (#200 slice 2) to also drive armour pieces through ItemBench.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDroppable,
  pointerWithin, rectIntersection,
} from '@dnd-kit/core'
import {
  useFpsLoadouts, createFpsLoadout, putLoadoutSlot, duplicateFpsLoadout,
  useCrafting, useWeaponBench, useItemBuilds, createItemBuild, deleteItemBuild,
  useUserBlueprints, useUtilityItems,
  useLootCollection, useLootWishlist,
} from '../../hooks/useAPI'
import { useSession } from '../../lib/auth-client'
import MyLoadout from './MyLoadout'
import ItemBench from './ItemBench'
import SavedBuilds from './SavedBuilds'
import ItemSource from './ItemSource'
import LoadoutStats from './LoadoutStats'
import { combinedMultipliers, computeBenchStats } from './weaponBenchStats'
import { getBenchAdapter } from './benchAdapters'
import { attachmentSlot } from './attachmentCompat'
import { isValidTarget, resolveDrop, resolveDropFromCollisions, mergeAttachmentIntoConfig } from './dnd'
import { portCapacity, SLOT_FAMILY } from './portCapacity'

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
const ARMOUR_SLOTS = new Set(['helmet', 'core', 'arms', 'legs', 'backpack', 'undersuit'])
const ARMOUR_STAT_SLOT_KEYS = ['helmet', 'core', 'arms', 'legs', 'undersuit']
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

function TopBar({ loadouts, currentLoadoutId, onSelect, onNew, onDuplicate, newLoadoutError }) {
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
        data-testid="duplicate-loadout"
        onClick={onDuplicate}
        disabled={!currentLoadoutId}
        className="rounded disabled:opacity-40"
        title="Duplicate the active loadout"
        style={{ border: `1px solid ${LINE2}`, color: ICE_DIM, padding: '5px 11px', fontSize: 12 }}
      >
        &#10697; Duplicate
      </button>
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
  const buildsQ = useItemBuilds()
  const blueprintsQ = useUserBlueprints()
  const utilityQ = useUtilityItems()
  const collectionQ = useLootCollection(isAuthed)
  const wishlistQ = useLootWishlist(isAuthed)

  const [currentLoadoutId, setCurrentLoadoutId] = useState(null)
  const [selectedSlot, setSelectedSlot] = useState('primary')
  // Transient bench override — set when the user picks a weapon/build from
  // ItemSource or drops one on the bench, before "Set to loadout" commits it.
  // Scoped to a slot: it only applies while that slot is selected.
  const [pickState, setPickState] = useState(null) // { slotKey, itemUuid, buildId, config }
  const pick = pickState && pickState.slotKey === selectedSlot ? pickState : null
  // Live drag payload while a dnd-kit drag is in flight (drives target highlights
  // + the DragOverlay ghost); equipRequest tells the bench to equip an attachment
  // after a successful drop (seq bumps so the same attachment can be re-dropped).
  const [activeDrag, setActiveDrag] = useState(null)
  const [equipRequest, setEquipRequest] = useState(null) // { uuid, seq }
  const equipSeqRef = useRef(0)
  const [saving, setSaving] = useState(false)
  const [newLoadoutError, setNewLoadoutError] = useState(null)
  // Save feedback — every persist attempt flashes "Saved ✓" or the error, so
  // a failed save is never silent again.
  const [saveFlash, setSaveFlash] = useState(null) // { type: 'ok'|'err', msg }
  const flashTimerRef = useRef(null)
  const flash = (type, msg) => {
    clearTimeout(flashTimerRef.current)
    setSaveFlash({ type, msg })
    if (type === 'ok') flashTimerRef.current = setTimeout(() => setSaveFlash(null), 2500)
  }
  const liveConfigRef = useRef({ qualities: {}, attachments: {} })

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const loadouts = loadoutsQ.data?.items || []

  // Default to the user's first loadout once it loads.
  useEffect(() => {
    if (currentLoadoutId == null && loadouts.length > 0) setCurrentLoadoutId(loadouts[0].id)
  }, [loadouts, currentLoadoutId])

  // Picks don't carry across loadouts; equip signals don't carry across slots.
  useEffect(() => { setPickState(null); setEquipRequest(null) }, [currentLoadoutId])
  useEffect(() => { setEquipRequest(null) }, [selectedSlot])

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
  const weaponBuilds = useMemo(() => allBuilds.filter((b) => b.kind === 'weapon'), [allBuilds])
  const armourBuilds = useMemo(() => allBuilds.filter((b) => b.kind === 'armour'), [allBuilds])

  // Armour catalog — mirrors the weapons memo above, filtered to craftable
  // base armour pieces (named/skin variants and $templates excluded).
  const armours = useMemo(
    () => (craftingQ.data?.blueprints || []).filter((b) =>
      b.type === 'armour' && (b.slots?.length > 0) && b.base_stats
      && b.base_stats.armour_slot != null
      && !(b.base_stats?.item_name || b.name || '').includes('"')
      && b.sub_type !== '$templates'),
    [craftingQ.data],
  )

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

  // Utility catalog, deduped by name (loot_map carries duplicate rows for
  // colour/paint variants that share a display name). Ownership-aware: if any
  // duplicate's uuid is in the collection/wishlist, keep THAT row so the
  // ✓/◇ badge reflects what the user actually tracked.
  const utilityItems = useMemo(() => {
    const byName = new Map()
    for (const item of utilityQ.data?.items || []) {
      const existing = byName.get(item.name)
      const tracked = ownership.owned.has(item.uuid) || ownership.wishlisted.has(item.uuid)
      const existingTracked = existing && (ownership.owned.has(existing.uuid) || ownership.wishlisted.has(existing.uuid))
      if (!existing || (tracked && !existingTracked)) byName.set(item.name, item)
    }
    return [...byName.values()]
  }, [utilityQ.data, ownership])

  // Utility items filtered by util_slot, split from the main catalog because
  // knives equip via { kind: 'melee' } (util_knife) rather than
  // { kind: 'utility' } — ItemSource renders them under their own Knife pill.
  const knives = useMemo(() => utilityItems.filter((u) => u.util_slot === 'knife'), [utilityItems])
  const nonKnifeUtility = useMemo(() => utilityItems.filter((u) => u.util_slot !== 'knife'), [utilityItems])
  const magazines = benchQ.data?.magazines || []

  // Capacity flows from the equipped core + legs armour (portCapacity) —
  // drives MyLoadout's dynamic utility groups and every drop's validity.
  const corePiece = useMemo(() => {
    const slot = currentLoadout.slots?.find((s) => s.slot_key === 'core')
    return slot?.item_uuid ? armours.find((a) => a.uuid === slot.item_uuid) || null : null
  }, [currentLoadout, armours])
  const legsPiece = useMemo(() => {
    const slot = currentLoadout.slots?.find((s) => s.slot_key === 'legs')
    return slot?.item_uuid ? armours.find((a) => a.uuid === slot.item_uuid) || null : null
  }, [currentLoadout, armours])
  const capacity = useMemo(() => portCapacity(corePiece, legsPiece), [corePiece, legsPiece])

  const savedSlot = currentLoadout.slots?.find((s) => s.slot_key === selectedSlot) || null
  // Sling slots hold a real weapon (gated on size + capacity, see dnd.js) so
  // they get full weapon-bench treatment just like primary/secondary/sidearm.
  const isWeaponSlot = WEAPON_SLOTS.has(selectedSlot) || SLOT_FAMILY(selectedSlot).family === 'slings'
  const isArmourSlot = ARMOUR_SLOTS.has(selectedSlot)
  const benchKind = isArmourSlot ? 'armour' : 'weapon'
  const benchCatalog = isArmourSlot ? armours : weapons

  // Resolve which blueprint the bench should show: a transient pick wins,
  // then the loadout's saved item for this slot, then (weapon slots only) the
  // default weapon so the bench isn't empty. Armour slots show the empty
  // state until something is picked/saved — no forced default piece.
  const activeItemUuid = pick?.itemUuid ?? savedSlot?.item_uuid ?? (isArmourSlot ? null : defaultWeapon?.uuid) ?? null
  const blueprint = (isWeaponSlot || isArmourSlot) ? (benchCatalog.find((w) => w.uuid === activeItemUuid) || null) : null
  // Memoized so ItemBench (which resets its in-progress edits whenever this
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

  // Saved weapon blueprint per paperdoll slot — drives drop validation for
  // attachments dragged straight onto a loadout tile (a 16x scope must fit
  // THAT slot's weapon, not whatever's on the bench).
  const slotWeapons = useMemo(() => {
    const out = {}
    for (const s of currentLoadout.slots || []) {
      if (!s.item_uuid || !WEAPON_SLOTS.has(s.slot_key)) continue
      const bp = weapons.find((w) => w.uuid === s.item_uuid)
      if (bp) out[s.slot_key] = bp
    }
    return out
  }, [currentLoadout, weapons])

  const dropCtx = useMemo(() => ({ benchWeapon: blueprint, benchKind, slotWeapons, capacity }), [blueprint, benchKind, slotWeapons, capacity])

  // The whole bench panel accepts weapon/build drops (load-to-bench preview).
  const benchDrop = useDroppable({ id: 'bench', data: { kind: 'bench' } })
  const benchIsValidTarget = isValidTarget(activeDrag, { kind: 'bench' }, dropCtx)

  const buildsForBench = useMemo(
    () => (benchKind === 'armour' ? armourBuilds : weaponBuilds).filter((b) => b.item_uuid === blueprint?.uuid),
    [benchKind, armourBuilds, weaponBuilds, blueprint],
  )

  // All of the user's saved weapon-bench builds, enriched with their weapon's friendly
  // name so a build for a weapon other than the one currently on the bench is still
  // identifiable when it surfaces via Item Source search (see buildsForSource below).
  // weaponSize feeds dnd validation — a build only lands on a sling slot when
  // its underlying weapon's base_stats.size is large enough (see dnd.js).
  const weaponBuildsForSource = useMemo(
    () => weaponBuilds.map((b) => {
      const bp = weapons.find((w) => w.uuid === b.item_uuid)
      return { ...b, weaponName: bp ? (bp.base_stats?.item_name || bp.name) : null, weaponSize: bp?.base_stats?.size ?? null }
    }),
    [weaponBuilds, weapons],
  )

  // Armour builds enriched with their piece's friendly name + armour_slot —
  // armourSlot feeds dnd validation (a build only lands on its own tile).
  const armourBuildsForSource = useMemo(
    () => armourBuilds.map((b) => {
      const bp = armours.find((a) => a.uuid === b.item_uuid)
      return { ...b, itemName: bp ? (bp.base_stats?.item_name || bp.name) : null, armourSlot: bp?.base_stats?.armour_slot ?? null }
    }),
    [armourBuilds, armours],
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
      const weaponSize = weapons.find((w) => w.uuid === item.blueprint_uuid)?.base_stats?.size ?? null
      for (const build of item.builds || []) {
        out.push({
          id: `bp-${item.blueprint_uuid}-${build.id}`,
          name: build.name || weaponName,
          weaponUuid: item.blueprint_uuid,
          weaponName,
          weaponSize,
          config: { qualities: build.quality_config, attachments: {} },
        })
      }
      if (item.quality_config) {
        out.push({
          id: `bp-${item.blueprint_uuid}-legacy`,
          name: weaponName,
          weaponUuid: item.blueprint_uuid,
          weaponName,
          weaponSize,
          config: { qualities: item.quality_config, attachments: {} },
        })
      }
    }
    return out
  }, [blueprintsQ.data, weapons])

  // Combined list handed to ItemSource — crafting designs first (they're the newer,
  // more-often-used source), weapon-bench builds after.
  const buildsForSource = useMemo(
    () => [...craftingDesigns, ...weaponBuildsForSource],
    [craftingDesigns, weaponBuildsForSource],
  )

  const onConfigChange = useCallback((cfg) => { liveConfigRef.current = cfg }, [])

  const handlePick = (item) => {
    if (!item) return
    // A saved design/build — either a user_item_builds row (item_uuid) or a
    // crafting-page quality-sim build surfaced via useUserBlueprints (weaponUuid).
    // Either way: load that design's own item into the bench (not whatever's
    // currently loaded) plus its exact config.
    const buildUuid = item.item_uuid || item.weaponUuid
    if (buildUuid) {
      // Only user_item_builds rows have a persistable build id worth carrying
      // into "Set to loadout" — crafting designs aren't rows in that table.
      const buildId = item.item_uuid ? item.id : null
      // Armour builds jump to their own piece's slot (mirrors the drop paths'
      // load-bench/equip-build routing); weapon builds/designs jump to a
      // weapon slot — staying on selectedSlot if it's already one (the three
      // weapon slots are interchangeable), else 'primary' (mirrors load-bench;
      // picking a weapon while an armour slot is selected can't resolve in
      // the armour benchCatalog otherwise, and the bench appears dead).
      const targetSlot = item.kind === 'armour'
        ? (item.armourSlot ?? selectedSlot)
        : (WEAPON_SLOTS.has(selectedSlot) ? selectedSlot : 'primary')
      setPickState({ slotKey: targetSlot, itemUuid: buildUuid, buildId, config: { ...(item.config || {}), name: item.name } })
      setSelectedSlot(targetSlot)
    } else if (item.uuid && item.base_stats) {
      // A plain weapon/armour catalog blueprint — reset to a fresh config.
      // Armour pieces jump to their own slot (mirrors equip-armour's drop
      // semantics); weapons jump to a weapon slot the same way builds do above.
      const targetSlot = item.base_stats.armour_slot != null
        ? item.base_stats.armour_slot
        : (WEAPON_SLOTS.has(selectedSlot) ? selectedSlot : 'primary')
      setPickState({ slotKey: targetSlot, itemUuid: item.uuid, buildId: null, config: null })
      setSelectedSlot(targetSlot)
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

  const handleDuplicate = async () => {
    if (!currentLoadoutId) return
    try {
      const result = await duplicateFpsLoadout(currentLoadoutId)
      await loadoutsQ.refetch()
      setCurrentLoadoutId(result.id)
    } catch (err) {
      flash('err', `Duplicate failed: ${err?.message || 'unknown error'}`)
    }
  }

  // Persist an item into a loadout slot, creating the loadout on first save.
  // Every attempt reports through the save flash — success or failure, the
  // user always sees what happened. Returns true when the save landed.
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
      flash('ok', `Saved ${payload.itemName || 'item'} → ${slotKey}`)
      return true
    } catch (err) {
      flash('err', `Save failed: ${err?.message || 'unknown error'}`)
      return false
    } finally {
      setSaving(false)
    }
  }

  const handleSetToLoadout = async () => {
    if (!blueprint) return
    const ok = await persistSlot(selectedSlot, {
      itemUuid: blueprint.uuid,
      itemName: blueprint.base_stats?.item_name || blueprint.name,
      itemBuildId: pick?.buildId ?? null,
      config: liveConfigRef.current,
    })
    if (ok) setPickState(null)
  }

  const handleDragStart = (e) => setActiveDrag(e.active?.data?.current || null)
  const handleDragCancel = () => setActiveDrag(null)

  const handleDragEnd = async (e) => {
    setActiveDrag(null)
    const drag = e.active?.data?.current
    // Walk ALL collisions for the first valid combination — droppables nest
    // (bench-slot zones inside the bench panel), and `over` alone is just the
    // top hit, which may be the invalid outer container.
    const action = resolveDropFromCollisions(drag, e.collisions, dropCtx)
      || resolveDrop(drag, e.over?.data?.current, dropCtx)
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
        itemBuildId: null,
        config: { qualities: {}, attachments: {} },
      })
      setSelectedSlot(action.slotKey)
      return
    }
    if (action.type === 'equip-armour') {
      const a = action.armour
      await persistSlot(action.slotKey, {
        itemUuid: a.uuid,
        itemName: a.base_stats?.item_name || a.name,
        itemBuildId: null,
        config: { qualities: {} },
      })
      setSelectedSlot(action.slotKey)
      return
    }
    if (action.type === 'equip-build') {
      const b = action.build
      const catalog = b.kind === 'armour' ? armours : weapons
      const itemUuid = b.item_uuid || b.weaponUuid
      const bp = catalog.find((x) => x.uuid === itemUuid)
      if (!bp) return
      await persistSlot(action.slotKey, {
        itemUuid: bp.uuid,
        itemName: bp.base_stats?.item_name || bp.name,
        // Only user_item_builds rows have a persistable build id.
        itemBuildId: b.item_uuid ? b.id : null,
        config: { ...(b.config || {}), name: b.name },
      })
      setSelectedSlot(action.slotKey)
      return
    }
    if (action.type === 'equip-bench-combo') {
      // The bench header dragged onto a weapon/armour slot: save the bench's
      // current item WITH its live sliders + attachments into that slot.
      if (!blueprint) return
      await persistSlot(action.slotKey, {
        itemUuid: blueprint.uuid,
        itemName: blueprint.base_stats?.item_name || blueprint.name,
        itemBuildId: pick?.buildId ?? null,
        config: liveConfigRef.current,
      })
      setSelectedSlot(action.slotKey)
      return
    }
    if (action.type === 'equip-utility') {
      // A utility item onto its matching paperdoll slot (no bench config —
      // medical/gadget/throwable items aren't craft-tunable in slice 1).
      await persistSlot(action.slotKey, {
        itemUuid: action.item.uuid,
        itemName: action.item.name,
        itemBuildId: null,
        config: null,
      })
      setSelectedSlot(action.slotKey)
      return
    }
    if (action.type === 'equip-melee') {
      // A knife onto util_knife — same no-bench-config treatment as utility items.
      await persistSlot(action.slotKey, {
        itemUuid: action.item.uuid,
        itemName: action.item.name,
        itemBuildId: null,
        config: null,
      })
      setSelectedSlot(action.slotKey)
      return
    }
    if (action.type === 'equip-magazine') {
      // A magazine onto a mag_* slot — same no-bench-config treatment.
      await persistSlot(action.slotKey, {
        itemUuid: action.magazine.uuid,
        itemName: action.magazine.name,
        itemBuildId: null,
        config: null,
      })
      setSelectedSlot(action.slotKey)
      return
    }
    if (action.type === 'equip-attachment-to-slot') {
      // An attachment dropped straight onto a filled paperdoll weapon tile:
      // merge it into that slot's SAVED config (validated against that slot's
      // weapon in resolveDrop) and persist immediately.
      const slot = currentLoadout.slots?.find((s) => s.slot_key === action.slotKey)
      if (!slot?.item_uuid) return
      await persistSlot(action.slotKey, {
        itemUuid: slot.item_uuid,
        itemName: slot.item_name,
        itemBuildId: slot.item_build_id ?? null,
        config: mergeAttachmentIntoConfig(slot.config, action.attachment),
      })
      return
    }
    if (action.type === 'load-bench') {
      // A weapon/armour/build dropped onto the bench: LOAD it for tuning —
      // preview only, nothing saved until "Set to loadout" (or a drag to a slot).
      if (action.weapon) {
        const targetSlot = WEAPON_SLOTS.has(selectedSlot) ? selectedSlot : 'primary'
        setPickState({ slotKey: targetSlot, itemUuid: action.weapon.uuid, buildId: null, config: null })
        setSelectedSlot(targetSlot)
        return
      }
      if (action.armour) {
        const armourSlot = action.armour.base_stats?.armour_slot
        const targetSlot = selectedSlot === armourSlot ? selectedSlot : (armourSlot || selectedSlot)
        setPickState({ slotKey: targetSlot, itemUuid: action.armour.uuid, buildId: null, config: null })
        setSelectedSlot(targetSlot)
        return
      }
      const b = action.build
      const targetSlot = b.kind === 'armour'
        ? (selectedSlot === b.armourSlot ? selectedSlot : (b.armourSlot || selectedSlot))
        : (WEAPON_SLOTS.has(selectedSlot) ? selectedSlot : 'primary')
      setPickState({
        slotKey: targetSlot,
        itemUuid: b.item_uuid || b.weaponUuid,
        buildId: b.item_uuid ? b.id : null,
        config: { ...(b.config || {}), name: b.name },
      })
      setSelectedSlot(targetSlot)
    }
  }

  const handleSaveBuild = (name) => {
    if (!blueprint?.uuid) return
    createItemBuild({ kind: benchKind, itemUuid: blueprint.uuid, name, config: liveConfigRef.current })
      .then(() => buildsQ.refetch?.())
  }
  const handleDeleteBuild = (b) => deleteItemBuild(b.id).then(() => buildsQ.refetch?.())
  const handleLoadBuild = (b) => {
    if (b.item_uuid !== blueprint?.uuid) return
    setPickState({ slotKey: selectedSlot, itemUuid: b.item_uuid, buildId: b.id, config: { ...(b.config || {}), name: b.name } })
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
        isDesign: Boolean(slot.item_build_id),
        attachments: Object.keys(cfg.attachments || {}),
      }
    }).filter(Boolean)
  }, [currentLoadout, weapons, attachments])

  // Per-armour-slot stats for the loadout summary footer, plus the backpack's
  // display info (no combat stats — it only carries inventory volume).
  const armourStats = useMemo(() => {
    const pieces = {}
    for (const slotKey of ARMOUR_STAT_SLOT_KEYS) {
      const slot = currentLoadout.slots?.find((s) => s.slot_key === slotKey)
      if (!slot?.item_uuid) continue
      const bp = armours.find((a) => a.uuid === slot.item_uuid)
      if (!bp) continue
      const adapter = getBenchAdapter('armour')
      pieces[slotKey] = {
        name: slot.item_name || bp.base_stats?.item_name || bp.name,
        stats: adapter.computeStats(bp, (slot.config?.qualities) || {}),
        isDesign: Boolean(slot.item_build_id),
      }
    }
    const backpackSlot = currentLoadout.slots?.find((s) => s.slot_key === 'backpack')
    const backpackBp = backpackSlot?.item_uuid ? armours.find((a) => a.uuid === backpackSlot.item_uuid) : null
    return { pieces, backpack: backpackBp ? { name: backpackBp.base_stats?.item_name || backpackBp.name, volume: backpackBp.base_stats?.inventory_volume ?? null } : null }
  }, [currentLoadout, armours])

  const slotLabel = WEAPON_SLOT_LABEL[selectedSlot] || selectedSlot
  const blueprintOwned = Boolean(blueprint && ownership.owned.has(blueprint.uuid))

  // Ghost label for the DragOverlay — the name of whatever is being dragged.
  const dragLabel = activeDrag?.kind === 'weapon'
    ? (activeDrag.weapon?.base_stats?.item_name || activeDrag.weapon?.name)
    : activeDrag?.kind === 'armour' ? (activeDrag.armour?.base_stats?.item_name || activeDrag.armour?.name)
    : activeDrag?.kind === 'build' ? activeDrag.build?.name
    : activeDrag?.kind === 'attachment' ? activeDrag.attachment?.name
    : activeDrag?.kind === 'utility' ? activeDrag.item?.name
    : activeDrag?.kind === 'bench-combo' && blueprint
      ? `${blueprint.base_stats?.item_name || blueprint.name} (custom build)`
    : null

  return (
    <DndContext sensors={sensors} collisionDetection={forgivingCollision}
      onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
    <div className="flex flex-col h-full overflow-hidden" style={{ padding: '4px 10px 14px' }}>
      <TopBar loadouts={loadouts} currentLoadoutId={currentLoadoutId} onSelect={setCurrentLoadoutId}
        onNew={handleNewLoadout} onDuplicate={handleDuplicate} newLoadoutError={newLoadoutError} />
      {saveFlash && (
        <div
          data-testid="save-flash"
          className="rounded"
          style={{
            position: 'absolute', top: 10, right: 16, zIndex: 30, padding: '6px 14px', fontSize: 12,
            border: `1px solid ${saveFlash.type === 'ok' ? OWN : '#e0564f'}`,
            color: saveFlash.type === 'ok' ? OWN : '#ff8a80',
            background: 'rgba(7,16,22,0.95)',
          }}
        >
          {saveFlash.type === 'ok' ? '✓ ' : '⚠ '}{saveFlash.msg}
        </div>
      )}

      <div className="grid gap-3 mt-3 flex-1 min-h-0" style={{ gridTemplateColumns: '360px 1fr 320px' }}>
        <div className="rounded flex flex-col min-h-0" style={{ border: `1px solid ${LINE}`, background: PANEL }}>
          <ColHeader><b style={{ color: '#fff' }}>My Loadout</b> &mdash; {currentLoadout.name}</ColHeader>
          <div className="flex-1 overflow-y-auto min-h-0" style={{ padding: '11px 12px' }}>
            <MyLoadout loadout={currentLoadout} selectedSlot={selectedSlot} onSelectSlot={setSelectedSlot}
              activeDrag={activeDrag} dropCtx={dropCtx} capacity={capacity} />
          </div>
        </div>

        <div
          ref={benchDrop.setNodeRef}
          data-testid="bench-droppable"
          className="rounded flex flex-col min-h-0"
          style={{
            border: `1px solid ${benchIsValidTarget ? (benchDrop.isOver ? CYAN : 'rgba(0,232,255,0.45)') : LINE}`,
            boxShadow: benchIsValidTarget && benchDrop.isOver ? '0 0 0 1px rgba(0,232,255,0.35), 0 0 18px rgba(0,232,255,0.2)' : 'none',
            background: PANEL,
          }}
        >
          <ColHeader>
            <b style={{ color: '#fff' }}>Craft Bench</b> &mdash; {slotLabel} slot
            <span className="flex-1" />
            {benchIsValidTarget && <span style={{ color: CYAN, fontSize: 10 }}>drop to load</span>}
            {blueprintOwned && <span style={{ color: OWN, fontSize: 11 }}>&#10003; OWNED</span>}
          </ColHeader>
          <div className="flex-1 overflow-y-auto min-h-0" style={{ padding: '11px 12px' }}>
            {!(isWeaponSlot || isArmourSlot) ? (
              <div className="text-center py-12 text-sm italic" style={{ color: ICE_DIM }} data-testid="slot-placeholder">
                {slotLabel} bench coming in slice 3
              </div>
            ) : blueprint ? (
              <>
                <ItemBench kind={benchKind} blueprint={blueprint} attachments={attachments}
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
                  <SavedBuilds items={buildsForBench} canSave={!!blueprint}
                    onSave={handleSaveBuild} onDelete={handleDeleteBuild} onLoad={handleLoadBuild} />
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-sm" style={{ color: ICE_DIM }}>
                {benchKind === 'armour' ? 'Select an armour piece from Item Source.' : 'No craftable weapons available.'}
              </div>
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
            <ItemSource slotKey={selectedSlot} weapon={blueprint} weapons={weapons} attachments={attachments}
              builds={buildsForSource} utility={nonKnifeUtility} knives={knives} magazines={magazines}
              armours={armours} armourBuilds={armourBuildsForSource}
              ownership={ownership} onPick={handlePick} />
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 mt-3">
        <LoadoutStats weaponStats={weaponStats} armourStats={armourStats} />
      </div>
    </div>
    {/* width/height max-content: the overlay wrapper otherwise inherits the
        measured size of the dragged element (the bench header spans its whole
        column → a screen-wide ghost). */}
    <DragOverlay dropAnimation={null} style={{ width: 'max-content', height: 'max-content' }}>
      {dragLabel ? (
        <div
          className="rounded pointer-events-none flex items-center gap-2"
          style={{
            padding: '6px 12px', fontSize: 12, color: CYAN, background: 'rgba(7,16,22,0.92)',
            border: `1px solid ${CYAN}`, boxShadow: '0 4px 18px rgba(0,0,0,0.5), 0 0 12px rgba(0,232,255,0.25)',
            maxWidth: 280, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {dragLabel}
        </div>
      ) : null}
    </DragOverlay>
    </DndContext>
  )
}
