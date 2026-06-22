import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { RotateCcw, ShoppingCart, ChevronDown, ChevronRight, FlaskConical, ExternalLink } from 'lucide-react'
import { useShip, useLoadoutComponents, useShipModules, useOwnedModules, useFleetLoadout, useLoadoutCart, useFleet, saveFleetLoadout, resetFleetLoadout, addToLoadoutCart, useLoanerLoadout, saveLoanerLoadout, resetLoanerLoadout, useModuleSelections, saveModuleSelections, resetModuleSelection, useGadgetSelections, saveGadgetSelections, resetGadgetSelection } from '../../hooks/useAPI'
import LoadingState from '../../components/LoadingState'
import ComponentPicker from './ComponentPicker'
import StatsPanel from './StatsPanel'
import CartPanel from './CartPanel'
import WeaponBlock from './WeaponBlock'
import MissileBlock from './MissileBlock'
import TurretHeader from './TurretHeader'
import LockedPort from './LockedPort'
import DamageBreakdown from './DamageBreakdown'
import PowerPips from './PowerPips'
import ModulesSection from './ModulesSection'
import GadgetModulesSection from './GadgetModulesSection'
import PaintsSection from './PaintsSection'
import LocationPlanner from './LocationPlanner'
import { PORT_TYPE_ICONS, PORT_CATEGORY_ORDER, getPortCategory, getPrimaryStat, aggregateCombatStats, fmtInt, fmtCompact, fmtDec1, fmtSpeed, getDamageType, DmgShape } from './loadoutHelpers'

export default function Loadout() {
  const { slug } = useParams()
  const [searchParams] = useSearchParams()
  const fleetId = searchParams.get('fleet_id') ? parseInt(searchParams.get('fleet_id'), 10) : null
  // Loaners are derived (no fleet id) — they persist by their vehicle id instead.
  const loanerVehicleId = searchParams.get('loaner_vehicle_id') ? parseInt(searchParams.get('loaner_vehicle_id'), 10) : null
  const canPersist = !!(fleetId || loanerVehicleId)

  const { data: ship } = useShip(slug)
  const { data: stockComponents, loading: stockLoading, error: stockError } = useLoadoutComponents(slug)
  const { data: modules } = useShipModules(slug)
  const { data: ownedModules } = useOwnedModules(slug)
  const { data: fleetLoadout, refetch: refetchFleetLoadout } = useFleetLoadout(fleetId)
  const { data: loanerLoadout, refetch: refetchLoanerLoadout } = useLoanerLoadout(loanerVehicleId)

  // Module selections persist against the same owner (fleet entry or loaner vehicle).
  const moduleOwnerKind = loanerVehicleId ? 'loaner' : 'fleet'
  const moduleOwnerId = loanerVehicleId || fleetId
  const { data: moduleSelData, refetch: refetchModuleSel } = useModuleSelections(moduleOwnerKind, moduleOwnerId)
  const { data: gadgetSelData, refetch: refetchGadgetSel } = useGadgetSelections(moduleOwnerKind, moduleOwnerId)
  const { data: fleetEntries, refetch: refetchFleet } = useFleet()
  const { data: cartData, loading: cartLoading, refetch: refetchCart } = useLoadoutCart()

  // Resolve this fleet entry's currently-equipped paint (if any). Drives the
  // PaintsSection highlight + the parent-page image swap (PR4).
  const fleetEntry = useMemo(
    () => (fleetEntries || []).find(e => e.id === fleetId) || null,
    [fleetEntries, fleetId],
  )
  const equippedPaintId = fleetEntry?.equipped_paint_id ?? null

  const [overrides, setOverrides] = useState({})
  const [pickerPortId, setPickerPortId] = useState(null)
  const [pickerPortType, setPickerPortType] = useState(null)
  const [collapsed, setCollapsed] = useState({})
  const [showCart, setShowCart] = useState(false)

  useEffect(() => {
    const src = loanerVehicleId ? loanerLoadout : fleetLoadout
    if (src?.overrides) {
      const map = {}
      for (const o of src.overrides) map[o.port_id] = o
      setOverrides(map)
    }
  }, [fleetLoadout, loanerLoadout, loanerVehicleId])

  // Group components by category, re-parenting turret children into the Turrets group
  const grouped = useMemo(() => {
    if (!stockComponents) return []

    // Build set of turret port_ids so we can re-parent their children.
    // Includes weapon ports with weapon_count > 1 (e.g. Terrapin nose turret housing)
    const turretIds = new Set(
      stockComponents
        .filter(c => !c.parent_port_id && (
          c.port_type === 'turret' ||
          (c.port_type === 'weapon' && c.weapon_count > 1)
        ))
        .map(c => c.port_id)
    )

    // Filter out noise child ports (ammo_slot, weapon_controller, empty S0/S1 non-weapon)
    const NOISE_PORTS = new Set(['ammo_slot', 'weapon_controller', 'ammo_box'])
    const filtered = stockComponents.filter(c => {
      if (NOISE_PORTS.has(c.port_name)) return false
      // Empty non-weapon S0 ports
      if (c.size_max === 0 && !c.component_name) return false
      return true
    })

    const groups = {}
    for (const comp of filtered) {
      // If this component's parent is a turret, force it into the Turrets group
      const isTurretChild = comp.parent_port_id && turretIds.has(comp.parent_port_id)
      // Weapon ports that house multiple children are turrets (e.g. Terrapin nose)
      const isWeaponTurret = comp.port_type === 'weapon' && !comp.parent_port_id && comp.weapon_count > 1
      // Missile racks on turret mounts should go in Missiles, not Turrets
      const isMissileRack = comp.mount_type === 'MissileLauncher' || comp.component_type === 'MissileLauncher'
      // Jump drives go into the Quantum Drives group
      const isJumpDrive = comp.port_type === 'jump_drive'
      // Torpedo racks get their own section
      const isTorpedo = (comp.port_name || '').toLowerCase().includes('torpedo')
      // PDC ports get their own section
      const isPDC = (comp.port_name || '').toLowerCase().includes('pdc')
      const cat = isTorpedo && isMissileRack ? 'Torpedoes'
        : isMissileRack ? 'Missiles'
        : isJumpDrive ? 'Quantum Drives'
        : isPDC ? 'Point Defense'
        : (isTurretChild || isWeaponTurret) ? 'Turrets'
        : getPortCategory(comp.port_type, comp.category_label)
      if (!groups[cat]) groups[cat] = { label: cat, portType: isPDC ? 'turret' : (isTurretChild || isWeaponTurret) ? 'turret' : comp.port_type, items: [] }
      groups[cat].items.push(comp)
    }
    return PORT_CATEGORY_ORDER.filter(cat => groups[cat]).map(cat => groups[cat])
  }, [stockComponents])

  // Aggregate combat stats — stock baseline
  const combatStock = useMemo(() => {
    if (!stockComponents) return null
    return aggregateCombatStats(stockComponents)
  }, [stockComponents])

  // Aggregate combat stats — with overrides applied
  const combat = useMemo(() => {
    if (!stockComponents) return null
    const merged = stockComponents.map(c => overrides[c.port_id] ? { ...c, ...overrides[c.port_id] } : c)
    return aggregateCombatStats(merged)
  }, [stockComponents, overrides])

  // Effective loadout (stock with overrides applied) for the Location Planner (#94)
  const effectiveComponents = useMemo(() => {
    if (!stockComponents) return []
    return stockComponents.map(c => overrides[c.port_id] ? { ...c, ...overrides[c.port_id] } : c)
  }, [stockComponents, overrides])

  // Equipped tool heads (mining lasers / salvage heads) that carry gadget slots.
  // Keyed by the effective (possibly swapped) component uuid + the ship port so
  // gadget selections persist per head. MOLE's 3 turret lasers → 3 distinct heads.
  const toolHeads = useMemo(() => {
    const heads = []
    for (const c of effectiveComponents) {
      const type = c.component_type || c.type
      if ((type === 'WeaponMining' || type === 'SalvageHead') && c.component_uuid) {
        heads.push({ uuid: c.component_uuid, port_name: c.port_name, name: c.component_name || c.child_name })
      }
    }
    return heads
  }, [effectiveComponents])

  // Auto-collapse Point Defense section when >6 items
  useEffect(() => {
    const pdcGroup = grouped.find(g => g.label === 'Point Defense')
    if (pdcGroup && pdcGroup.items.length > 6) {
      setCollapsed(prev => ({ ...prev, 'Point Defense': prev['Point Defense'] ?? true }))
    }
  }, [grouped])

  // Split groups into left (weapons/turrets/missiles/pdc) and right (systems)
  const leftCategories = ['Weapons', 'Turrets', 'Missiles', 'Torpedoes', 'Point Defense']
  const leftGroups = grouped.filter(g => leftCategories.includes(g.label))
  const rightGroups = grouped.filter(g => !leftCategories.includes(g.label) && g.label !== 'Modules')

  const handleSelectComponent = useCallback(async (portId, component) => {
    const stockComp = stockComponents?.find(c => c.port_id === portId)
    const isResetToStock = stockComp && component.uuid === stockComp.component_uuid
    if (isResetToStock) {
      setOverrides(prev => { const next = { ...prev }; delete next[portId]; return next })
    } else {
      setOverrides(prev => ({
        ...prev,
        [portId]: {
          port_id: portId, component_id: component.id,
          child_name: component.name, component_name: component.name,
          component_uuid: component.uuid,
          shops: component.shops, // keep accurate buy locations for the Location Planner (#94)
          type: component.type, size: component.size, grade: component.grade,
          manufacturer_name: component.manufacturer_name,
          power_output: component.power_output, cooling_rate: component.cooling_rate,
          shield_hp: component.shield_hp, shield_regen: component.shield_regen,
          dps: component.dps, damage_per_shot: component.damage_per_shot,
          damage_type: component.damage_type,
          damage_physical: component.damage_physical, damage_energy: component.damage_energy,
          damage_distortion: component.damage_distortion, damage_thermal: component.damage_thermal,
          rounds_per_minute: component.rounds_per_minute,
          quantum_speed: component.quantum_speed, quantum_range: component.quantum_range,
          fuel_rate: component.fuel_rate, spool_time: component.spool_time,
          radar_range: component.radar_range, power_draw: component.power_draw, power_draw_min: component.power_draw_min,
          thermal_output: component.thermal_output,
          resist_physical: component.resist_physical, resist_energy: component.resist_energy,
          resist_distortion: component.resist_distortion,
        },
      }))
    }
    setPickerPortId(null)
  }, [stockComponents])

  const handleSave = useCallback(async () => {
    if (!canPersist) return
    const overrideList = Object.entries(overrides).map(([portId, data]) => ({
      port_id: parseInt(portId, 10), component_id: data.component_id,
    }))
    if (loanerVehicleId) {
      await saveLoanerLoadout(loanerVehicleId, overrideList)
      refetchLoanerLoadout()
    } else {
      await saveFleetLoadout(fleetId, overrideList)
      refetchFleetLoadout()
    }
  }, [canPersist, fleetId, loanerVehicleId, overrides, refetchFleetLoadout, refetchLoanerLoadout])

  const handleResetAll = useCallback(async () => {
    setOverrides({})
    if (loanerVehicleId) { await resetLoanerLoadout(loanerVehicleId); refetchLoanerLoadout() }
    else if (fleetId) { await resetFleetLoadout(fleetId); refetchFleetLoadout() }
  }, [fleetId, loanerVehicleId, refetchFleetLoadout, refetchLoanerLoadout])

  // Module slot selections (port_name → chosen module uuid).
  const moduleSelections = useMemo(() => {
    const map = {}
    for (const s of moduleSelData?.selections || []) map[s.port_name] = s.module_uuid
    return map
  }, [moduleSelData])

  const handleSelectModule = useCallback(async (portName, module) => {
    if (!canPersist) return
    // Choosing the default clears the override (back to stock); else save the choice.
    if (module.is_default) {
      await resetModuleSelection(moduleOwnerKind, moduleOwnerId, portName)
    } else {
      await saveModuleSelections(moduleOwnerKind, moduleOwnerId, [{ port_name: portName, module_uuid: module.uuid }])
    }
    refetchModuleSel()
  }, [canPersist, moduleOwnerKind, moduleOwnerId, refetchModuleSel])

  // Gadget slot selections (composite slot key '<headPortName>#<slotIndex>' → uuid).
  const gadgetSelections = useMemo(() => {
    const map = {}
    for (const s of gadgetSelData?.selections || []) map[s.port_name] = s.module_uuid
    return map
  }, [gadgetSelData])

  const handleSelectGadget = useCallback(async (slotKey, gadget, kind) => {
    if (!canPersist) return
    if (!gadget) {
      await resetGadgetSelection(moduleOwnerKind, moduleOwnerId, slotKey)
    } else {
      await saveGadgetSelections(moduleOwnerKind, moduleOwnerId, [{ port_name: slotKey, module_uuid: gadget.uuid, module_kind: kind }])
    }
    refetchGadgetSel()
  }, [canPersist, moduleOwnerKind, moduleOwnerId, refetchGadgetSel])

  const handleAddNonStockToCart = useCallback(async () => {
    const items = Object.values(overrides).map(o => ({ component_id: o.component_id, source_fleet_id: fleetId || undefined }))
    if (items.length === 0) return
    await addToLoadoutCart(items)
    refetchCart()
    setShowCart(true)
  }, [overrides, fleetId, refetchCart])

  const overrideCount = Object.keys(overrides).length
  const cartCount = cartData?.items?.length || 0

  if (stockLoading) return <LoadingState />
  if (stockError) return <div className="p-6 text-red-400">Error: {stockError}</div>

  const hasComponents = stockComponents?.length > 0

  return (
    <div className="min-h-screen animate-fade-in-up">
      {/* Under-testing notice — the loadout builder + Location Planner are still
          being validated; invite bug reports. */}
      <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2">
        <div className="max-w-[1400px] mx-auto flex items-center gap-2 text-[12px] text-amber-200/90 flex-wrap">
          <FlaskConical className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>The loadout builder &amp; Location Planner are still under testing — data may be incomplete or off.</span>
          <a
            href="https://github.com/SC-Bridge/sc-bridge/issues/new?template=01-bug-report.yml"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-amber-300 hover:text-amber-200 underline underline-offset-2 transition-colors"
          >
            Report an issue <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
      {/* ============================================================ */}
      {/* SHIP HERO HEADER                                              */}
      {/* ============================================================ */}
      <div className="relative bg-sc-panel border-b border-sc-border">
        <div className="max-w-[1400px] mx-auto flex items-stretch">
          <div className="flex-1 h-44 flex-shrink-0 overflow-hidden relative hidden md:block">
            {(() => {
              // Prefer the equipped paint's image when this is a fleet entry
              // with a paint equipped; fall back to the ship's default image.
              const paintImg = fleetEntry?.paint_image_url_large
                || fleetEntry?.paint_image_url_medium
                || fleetEntry?.paint_image_url
              const shipImg = ship?.image_url_large || ship?.image_url_medium || ship?.image_url
              const src = paintImg || shipImg
              if (!src) return null
              return (
                <img
                  src={src}
                  alt={ship?.name || slug}
                  className="w-full h-full object-cover opacity-80"
                  onError={(e) => {
                    if (paintImg && shipImg && e.target.src !== shipImg) {
                      e.target.src = shipImg
                    } else if (ship?.image_url_medium && e.target.src !== ship.image_url_medium) {
                      e.target.src = ship.image_url_medium
                    } else if (ship?.image_url && e.target.src !== ship.image_url) {
                      e.target.src = ship.image_url
                    }
                  }}
                />
              )
            })()}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent via-40% to-sc-panel" />
          </div>
          <div className="w-[420px] flex-shrink-0 px-4 py-3 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="font-hud text-3xl text-white tracking-wide" style={{ textShadow: '0 0 20px rgba(34,211,238,0.15)' }}>
                  {ship?.name || slug}
                </h1>
                {fleetId && (
                  <span className="text-[11px] bg-sc-accent/10 text-sc-accent px-2 py-0.5 rounded border border-sc-accent/20 font-medium">Fleet Ship</span>
                )}
                {loanerVehicleId && (
                  <span className="text-[11px] bg-amber-500/10 text-amber-300 px-2 py-0.5 rounded border border-amber-500/20 font-medium">Loaner</span>
                )}
                {overrideCount > 0 && (
                  <span className="text-[11px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded border border-amber-500/20 font-medium">{overrideCount} customized</span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {ship?.manufacturer_name && <span className="text-gray-400">{ship.manufacturer_name}</span>}
                {ship?.focus && <span> · {ship.focus}</span>}
                {ship?.size_label && <span> · {ship.size_label}</span>}
                {ship?.crew_min != null && <span> · Crew {ship.crew_min}{ship.crew_max > ship.crew_min ? `–${ship.crew_max}` : ''}</span>}
              </p>
              {ship && (
                <div className="flex items-center gap-4 mt-2 text-[12px] text-gray-500 font-mono flex-wrap">
                  {ship.hull_hp > 0 && <span>HP <span className="text-gray-300">{fmtInt(ship.hull_hp)}</span></span>}
                  {ship.speed_scm > 0 && <span>SCM <span className="text-gray-300">{ship.speed_scm}</span> m/s</span>}
                  {ship.mass > 0 && <span>Mass <span className="text-gray-300">{fmtInt(ship.mass)}</span> kg</span>}
                  {ship.cargo > 0 && <span>Cargo <span className="text-gray-300">{ship.cargo}</span> SCU</span>}
                </div>
              )}
            </div>
            {hasComponents && <div className="flex items-center gap-1.5 mt-3 flex-wrap justify-end">
              {canPersist && overrideCount > 0 && (
                <button onClick={handleSave} className="px-2.5 py-1 text-xs bg-sc-accent/20 hover:bg-sc-accent/30 text-sc-accent border border-sc-accent/30 rounded transition-all font-medium cursor-pointer">
                  Save
                </button>
              )}
              {overrideCount > 0 && (
                <>
                  <button onClick={handleAddNonStockToCart} className="px-2.5 py-1 text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded transition-all flex items-center gap-1 cursor-pointer">
                    <ShoppingCart className="w-3 h-3" /> To Cart
                  </button>
                  <button onClick={handleResetAll} className="px-2.5 py-1 text-xs bg-white/[0.04] hover:bg-white/[0.08] text-gray-400 border border-white/[0.06] rounded transition-all flex items-center gap-1 cursor-pointer">
                    <RotateCcw className="w-3 h-3" /> Reset All
                  </button>
                </>
              )}
              <button onClick={() => setShowCart(!showCart)}
                className="relative px-2.5 py-1 text-xs bg-white/[0.04] hover:bg-white/[0.08] text-gray-400 border border-white/[0.06] rounded transition-all flex items-center gap-1 cursor-pointer">
                <ShoppingCart className="w-3 h-3" /> Cart
                {cartCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-sc-accent text-black text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center" style={{ boxShadow: '0 0 6px rgba(34,211,238,0.5)' }}>
                    {cartCount}
                  </span>
                )}
              </button>
              <Link to={`/ships/${slug}`} className="px-2.5 py-1 text-xs text-gray-600 hover:text-gray-300 transition-colors">
                Detail →
              </Link>
            </div>}
          </div>
        </div>
      </div>

      {/* No loadout data — concept ship or not yet in game */}
      {!hasComponents && (
        <div className="max-w-[1400px] mx-auto p-8 text-center">
          <div className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-8 max-w-lg mx-auto">
            <div className="text-gray-500 text-sm mb-2">No loadout data available</div>
            <div className="text-gray-600 text-xs">
              This ship doesn't have component data in the game files yet.
              {ship?.classification && <> It's listed as <span className="text-gray-400">{ship.classification}</span>.</>}
            </div>
            <Link to={`/ships/${slug}`} className="inline-block mt-4 px-4 py-2 text-xs bg-white/[0.04] hover:bg-white/[0.08] text-gray-400 border border-white/[0.06] rounded transition-colors">
              ← Back to Ship Detail
            </Link>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* STATS SUMMARY BAR                                             */}
      {/* ============================================================ */}
      {hasComponents && <div className="bg-sc-dark/80 backdrop-blur border-b border-sc-border">
        <div className="max-w-[1400px] mx-auto px-4 py-3">
          <div className="flex items-stretch gap-4">

            {/* LEFT: Offense — DPS + Alpha + Damage breakdown */}
            <div className="flex-shrink-0 w-[260px] flex flex-col gap-2">
              <div className="flex items-stretch gap-px">
                <div className="flex-1 flex flex-col items-center justify-center bg-white/[0.02] rounded-l-md py-2">
                  <div className="flex items-baseline gap-1">
                    <span className="font-hud text-[32px] text-sc-accent leading-none" style={{ textShadow: '0 0 12px rgba(34,211,238,0.3)' }}>
                      {combat ? fmtCompact(Math.round(combat.totalDps)) : '—'}
                    </span>
                    <span className="text-[13px] text-gray-500">dps</span>
                  </div>
                  <div className="text-[10px] text-gray-600 uppercase tracking-wider mt-0.5">Sustained DPS</div>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center bg-white/[0.02] rounded-r-md py-2">
                  <div className="flex items-baseline gap-1">
                    <span className="font-hud text-[32px] text-white leading-none">
                      {combat ? fmtCompact(Math.round(combat.totalAlpha)) : '—'}
                    </span>
                    <span className="text-[13px] text-gray-500">dmg</span>
                  </div>
                  <div className="text-[10px] text-gray-600 uppercase tracking-wider mt-0.5">Alpha Strike</div>
                </div>
              </div>
              {combat && (
                <DamageBreakdown
                  dpsPhysical={combat.dpsPhysical}
                  dpsEnergy={combat.dpsEnergy}
                  dpsDistortion={combat.dpsDistortion}
                  dpsThermal={combat.dpsThermal}
                />
              )}
            </div>

            {/* Divider */}
            <div className="w-px bg-white/[0.06] self-stretch" />

            {/* CENTER: Power Management */}
            <PowerPips components={stockComponents} ship={ship} combat={combat} />

            {/* Divider */}
            <div className="w-px bg-white/[0.06] self-stretch" />

            {/* RIGHT: Defense + Vitals */}
            <div className="flex-shrink-0 w-[300px] flex flex-col gap-1.5">
              {/* Defense: Shield + Armor */}
              <div className="flex gap-px">
                <StatCell label="Shield HP" value={combat?.totalShieldHp} format={fmtCompact} color="text-blue-400" unit="hp" />
                <StatCell label="Regen/s" value={combat?.totalShieldRegen} format={fmtCompact} color="text-blue-300" unit="hp/s" />
                <StatCell label="Hull HP" value={ship?.armor_hp || ship?.hull_hp} format={fmtCompact} color="text-amber-400" unit="hp" />
              </div>
              {/* Vitals: Fuel + Speed */}
              <div className="flex gap-px">
                <StatCell label="H2 Fuel" value={ship?.fuel_capacity_hydrogen} format={fmtDec1} color="text-orange-400" unit="SCU" size="sm" />
                <StatCell label="QT Fuel" value={ship?.fuel_capacity_quantum} format={fmtDec1} color="text-purple-400" unit="SCU" size="sm" />
                <StatCell label="SCM" value={ship?.speed_scm} format={fmtInt} color="text-gray-300" unit="m/s" size="sm" />
                <StatCell label="Max" value={ship?.speed_max} format={fmtInt} color="text-gray-400" unit="m/s" size="sm" />
              </div>
              {/* Signatures */}
              <div className="flex gap-px">
                <div className="flex-1 bg-white/[0.02] rounded-l-md px-2 py-1 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-[10px] text-red-400">IR</span>
                    <span className="font-mono text-[13px] text-gray-400">{ship?.cross_section_x ? fmtInt(Math.round(ship.cross_section_x)) : '—'}</span>
                  </div>
                </div>
                <div className="flex-1 bg-white/[0.02] px-2 py-1 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-[10px] text-yellow-400">EM</span>
                    <span className="font-mono text-[13px] text-gray-400">{ship?.cross_section_y ? fmtInt(Math.round(ship.cross_section_y)) : '—'}</span>
                  </div>
                </div>
                <div className="flex-1 bg-white/[0.02] rounded-r-md px-2 py-1 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-[10px] text-cyan-400">CS</span>
                    <span className="font-mono text-[13px] text-gray-400">{ship?.cross_section_z ? fmtInt(Math.round(ship.cross_section_z)) : '—'}</span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>}

      {/* Stats panel — always visible, shows deltas when overrides active */}
      {hasComponents && (
        <StatsPanel stockComponents={stockComponents} overrides={overrides} horizontal />
      )}

      {hasComponents && <>
      {/* ============================================================ */}
      {/* MAIN CONTENT: TWO-COLUMN LAYOUT                               */}
      {/* ============================================================ */}
      <div className="max-w-[1400px] mx-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* LEFT: Weapons / Turrets / Missiles */}
          <div className="space-y-4">
            {leftGroups.map(group => (
              <SectionCard
                key={group.label}
                group={group}
                collapsed={collapsed}
                setCollapsed={setCollapsed}
                overrides={overrides}
                onResetCategory={(portIds) => setOverrides(prev => { const next = { ...prev }; portIds.forEach(id => delete next[id]); return next })}
                onResetComponent={(portId) => setOverrides(prev => { const next = { ...prev }; delete next[portId]; return next })}
                onOpenPicker={(portId, portType) => { setPickerPortId(portId); setPickerPortType(portType) }}
                onAddToCart={async (comp) => { await addToLoadoutCart([{ component_id: comp.component_id || comp.id }]); refetchCart() }}
                isWeaponSection
              />
            ))}
          </div>

          {/* RIGHT: Systems */}
          <div className="space-y-4">
            {rightGroups.map(group => (
              <SectionCard
                key={group.label}
                group={group}
                collapsed={collapsed}
                setCollapsed={setCollapsed}
                overrides={overrides}
                onResetCategory={(portIds) => setOverrides(prev => { const next = { ...prev }; portIds.forEach(id => delete next[id]); return next })}
                onResetComponent={(portId) => setOverrides(prev => { const next = { ...prev }; delete next[portId]; return next })}
                onOpenPicker={(portId, portType) => { setPickerPortId(portId); setPickerPortType(portType) }}
                onAddToCart={async (comp) => { await addToLoadoutCart([{ component_id: comp.component_id || comp.id }]); refetchCart() }}
              />
            ))}
          </div>
        </div>

        {/* MODULES (full-width) */}
        {modules?.length > 0 && (
          <div className="mt-4">
            <ModulesSection
              modules={modules}
              ownedTitles={ownedModules}
              selections={canPersist ? moduleSelections : undefined}
              onSelect={canPersist ? handleSelectModule : undefined}
            />
          </div>
        )}

        {/* MINING / SALVAGE GADGET MODULES (per equipped tool head) */}
        {toolHeads.length > 0 && (
          <div className="mt-4 space-y-4">
            {toolHeads.map(head => (
              <GadgetModulesSection
                key={`${head.port_name}:${head.uuid}`}
                head={head}
                selections={canPersist ? gadgetSelections : undefined}
                onSelect={canPersist ? handleSelectGadget : undefined}
              />
            ))}
          </div>
        )}

        {/* PAINTS (full-width, only when viewing a fleet entry) */}
        {fleetId && (
          <div className="mt-4">
            <PaintsSection
              shipSlug={slug}
              fleetId={fleetId}
              equippedPaintId={equippedPaintId}
              onEquipped={refetchFleet}
            />
          </div>
        )}

        {/* LOCATION PLANNER — where to buy the active loadout's components (#94) */}
        <div className="mt-4">
          <LocationPlanner components={effectiveComponents} />
        </div>
      </div>
      </>}

      {/* Component Picker Modal */}
      {pickerPortId && (
        <ComponentPicker
          slug={slug} portId={pickerPortId} portType={pickerPortType}
          currentOverride={overrides[pickerPortId]}
          onSelect={(comp) => handleSelectComponent(pickerPortId, comp)}
          onAddToCart={async (comp) => {
            await addToLoadoutCart([{ component_id: comp.id, source_fleet_id: fleetId || undefined }])
            refetchCart()
          }}
          onClose={() => setPickerPortId(null)}
        />
      )}

      {/* Cart Panel */}
      {showCart && (
        <CartPanel cartData={cartData} cartLoading={cartLoading} refetchCart={refetchCart} onClose={() => setShowCart(false)} />
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCell({ label, value, format, color, unit, size }) {
  const formatted = value != null && value > 0 ? (format ? format(value) : String(value)) : '—'
  const isSmall = size === 'sm'
  return (
    <div className={`flex-1 flex flex-col items-center justify-center bg-white/[0.02] first:rounded-l-md last:rounded-r-md ${isSmall ? 'px-2 py-1.5' : 'px-3 py-1.5'}`}>
      <div className={`font-hud leading-none whitespace-nowrap ${color} ${isSmall ? 'text-[18px]' : 'text-[22px]'}`}>{formatted}</div>
      <div className="text-[10px] text-gray-600 uppercase tracking-wider">{label}</div>
    </div>
  )
}

function SectionCard({ group, collapsed, setCollapsed, overrides, onResetCategory, onResetComponent, onOpenPicker, onAddToCart, isWeaponSection }) {
  const isCollapsed = collapsed[group.label]
  const Icon = PORT_TYPE_ICONS[group.portType]
  const categoryOverrides = group.items.filter(i => overrides[i.port_id]).length

  const iconColors = {
    weapon: 'text-sc-accent', turret: 'text-orange-400', missile: 'text-red-400',
    shield: 'text-blue-400', power: 'text-yellow-400', cooler: 'text-cyan-300',
    quantum_drive: 'text-purple-400', jump_drive: 'text-purple-300', sensor: 'text-green-400',
    countermeasure: 'text-gray-400', module: 'text-purple-400',
  }

  return (
    <div className="bg-white/[0.02] border border-white/[0.05] rounded-lg overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2 bg-white/[0.02] border-b border-white/[0.06]">
        <button
          onClick={() => setCollapsed(prev => ({ ...prev, [group.label]: !prev[group.label] }))}
          className="flex items-center gap-1.5 text-gray-400 hover:text-gray-200 transition-colors cursor-pointer"
        >
          {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {Icon && <Icon className={`w-4 h-4 ${iconColors[group.portType] || 'text-gray-400'}`} />}
          <span className="text-[12px] font-semibold uppercase tracking-wider font-hud">{group.label}</span>
        </button>
        <span className="text-[11px] text-gray-600">{group.items.length}</span>
        {categoryOverrides > 0 && (
          <span className="text-[11px] text-sc-accent ml-1" style={{ textShadow: '0 0 8px rgba(34,211,238,0.3)' }}>
            {categoryOverrides} custom
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onResetCategory?.(group.items.map(i => i.port_id)) }}
          className="text-[11px] text-gray-600 hover:text-gray-400 cursor-pointer transition-colors ml-auto"
        >RESET</button>
      </div>

      {!isCollapsed && (
        <div>
          {group.items.map(item => {
            const override = overrides[item.port_id]
            const isOverridden = !!override

            // Missile racks — parent→child (check before turret)
            if (item.mount_type === 'MissileLauncher' || item.component_type === 'MissileLauncher') {
              return <MissileBlock key={item.port_id} item={item} onClick={() => onOpenPicker(item.port_id, 'missile')} onAddToCart={() => onAddToCart?.(item)} />
            }

            // Turret housing — section header with weapon children
            // Includes weapon ports with weapon_count > 1 (e.g. Terrapin nose)
            const isTurretHousing = !item.parent_port_id && (
              item.port_type === 'turret' ||
              (item.port_type === 'weapon' && item.weapon_count > 1)
            )
            if (isTurretHousing) {
              const children = group.items.filter(c => c.parent_port_id === item.port_id)
              return <TurretHeader key={item.port_id} item={item} children={children} overrides={overrides} onOpenPicker={onOpenPicker} onAddToCart={onAddToCart} />
            }

            // Skip turret children — rendered inside their parent TurretHeader
            if (item.parent_port_id && group.items.some(p => p.port_id === item.parent_port_id && (
              p.port_type === 'turret' || (p.port_type === 'weapon' && p.weapon_count > 1)
            ))) {
              return null
            }

            // Weapon sections use WeaponBlock for parent-child rendering
            if (isWeaponSection || item.port_type === 'weapon') {
              return (
                <WeaponBlock
                  key={item.port_id}
                  item={override ? { ...item, ...override } : item}
                  isCustomized={isOverridden}
                  weaponGroups={[]}
                  onClickMount={() => onOpenPicker(item.port_id, item.port_type)}
                  onClickWeapon={() => onOpenPicker(item.port_id, item.port_type)}
                  onAddToCart={() => onAddToCart?.(item)}
                  onReset={isOverridden ? () => onResetComponent(item.port_id) : undefined}
                />
              )
            }

            // Locked/non-editable ports
            if (item.editable === 0 || item.editable === false) {
              return <LockedPort key={item.port_id} item={item} />
            }

            // Empty ports
            if (!item.component_name && !item.child_name && !item.mount_name) {
              return (
                <div key={item.port_id} className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.03] opacity-30">
                  <span className="text-[12px] w-7 text-center flex-shrink-0 font-mono bg-white/[0.06] border border-white/[0.1] rounded px-1.5 py-px text-gray-500">
                    S{item.size_max}
                  </span>
                  <span className="text-sm text-gray-600">Empty</span>
                </div>
              )
            }

            // Skip jump drive children — rendered inline by their QD parent below
            if (item.port_type === 'jump_drive' && item.parent_port_id) {
              return null
            }

            // System components — simple row
            const displayName = override?.component_name || item.component_name
            const primaryStat = getPrimaryStat(item, override)
            const sz = item.component_size || item.size_max
            // Find jump drive child if this is a quantum drive
            const jumpChild = item.port_type === 'quantum_drive'
              ? group.items.find(c => c.port_type === 'jump_drive' && c.parent_port_id === item.port_id)
              : null

            return (
              <div key={item.port_id} className="border-b border-white/[0.03]">
                <button
                  onClick={() => onOpenPicker(item.port_id, item.port_type)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-all duration-200 cursor-pointer
                    ${isOverridden
                      ? 'bg-sc-accent/[0.04] border-l-2 border-l-sc-accent/60 hover:bg-sc-accent/[0.08]'
                      : 'hover:bg-white/[0.03] border-l-2 border-l-transparent'}`}
                >
                  <span className="text-[12px] w-7 text-center flex-shrink-0 font-mono bg-white/[0.06] border border-white/[0.1] rounded px-1.5 py-px text-gray-400">
                    S{sz}
                  </span>
                  <span className={`text-sm truncate flex-1 ${isOverridden ? 'text-sc-accent font-medium' : 'text-gray-300'}`}
                    style={isOverridden ? { textShadow: '0 0 8px rgba(34,211,238,0.3)' } : undefined}>
                    {displayName || 'Empty'}
                  </span>
                  {item.grade && (
                    <span className="font-mono text-[11px] px-1 py-px rounded flex-shrink-0 bg-gray-500/10 text-gray-400 border border-gray-500/20">
                      {item.grade}
                    </span>
                  )}
                  {item.manufacturer_name && <span className="text-[11px] text-gray-600 flex-shrink-0">{item.manufacturer_name}</span>}
                  {primaryStat && (
                    <span className="text-[12px] font-mono text-gray-500 flex-shrink-0 tabular-nums ml-auto" title={item.port_type === 'shield' ? 'Shield HP' : item.port_type === 'power' ? 'Power Output' : item.port_type === 'cooler' ? 'Cooling Rate' : item.port_type === 'quantum_drive' ? 'Quantum Speed' : item.port_type === 'sensor' ? 'Radar Range' : undefined}>{primaryStat}</span>
                  )}
                  {isOverridden && (
                    <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); onResetComponent(item.port_id) }}
                      className="p-1 text-gray-600 hover:text-amber-400 transition-colors cursor-pointer flex-shrink-0" title="Reset to default">
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  )}
                </button>
                {/* Jump drive child row under quantum drive */}
                {jumpChild && (
                  <button
                    onClick={() => onOpenPicker(jumpChild.port_id, jumpChild.port_type)}
                    className="w-full flex items-center gap-2 py-1.5 px-1 text-left cursor-pointer rounded transition-colors hover:bg-white/[0.03]"
                    style={{ marginLeft: '34px' }}
                  >
                    <svg className="flex-shrink-0 w-3.5 h-[16px] -ml-3.5 mr-0" style={{ color: 'rgba(255,255,255,0.15)' }}
                      viewBox="0 0 14 16" fill="none">
                      <path d="M 2 0 L 2 9 Q 2 13 6 13 L 14 13" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                    </svg>
                    <span className="text-[12px] w-7 text-center flex-shrink-0 font-mono bg-white/[0.06] border border-white/[0.1] rounded px-1.5 py-px text-gray-400">
                      S{jumpChild.component_size || jumpChild.size_max}
                    </span>
                    <span className="text-sm text-gray-300">{jumpChild.child_name || jumpChild.component_name || 'Jump Drive'}</span>
                    {jumpChild.grade && (
                      <span className="font-mono text-[11px] px-1 py-px rounded flex-shrink-0 bg-gray-500/10 text-gray-400 border border-gray-500/20">
                        {jumpChild.grade}
                      </span>
                    )}
                    {jumpChild.manufacturer_name && <span className="text-[11px] text-gray-600 flex-shrink-0">{jumpChild.manufacturer_name}</span>}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
