import {
  PowerPlantIcon, CoolerIcon, ShieldGeneratorIcon, QuantumDriveIcon,
  RadarIcon, JumpDriveIcon, WeaponIcon, TurretIcon, MissileRackIcon,
  ElectromagneticIcon, MiningLaserIcon, CrossSectionIcon, UtilityIcon, QEDIcon,
} from '../../assets/icons/index.js'

// ─── Damage type shapes (SVG) ────────────────────────────────────────────────
// Distinct shapes for colorblind accessibility:
// Physical=square, Energy=diamond, Distortion=hexagon, Thermal=triangle

export const DMG_TYPES = {
  physical: { label: 'Ballistic', color: '#f59e0b', shape: 'square' },
  energy:   { label: 'Energy',    color: '#22c55e', shape: 'diamond' },
  distortion: { label: 'Distortion', color: '#6366f1', shape: 'hexagon' },
  thermal:  { label: 'Thermal',   color: '#ef4444', shape: 'triangle' },
}

export function DmgShape({ type, size = 12, className = '' }) {
  const { color, shape } = DMG_TYPES[type] || DMG_TYPES.physical
  const s = size
  const svgProps = { width: s, height: s, viewBox: '0 0 10 10', className: `inline-block flex-shrink-0 ${className}` }
  switch (shape) {
    case 'square': return <svg {...svgProps}><rect x="1" y="1" width="8" height="8" rx="1" fill={color} /></svg>
    case 'diamond': return <svg {...svgProps}><polygon points="5,0 10,5 5,10 0,5" fill={color} /></svg>
    case 'hexagon': return <svg {...svgProps}><polygon points="5,0.5 9.3,2.8 9.3,7.2 5,9.5 0.7,7.2 0.7,2.8" fill={color} /></svg>
    case 'triangle': return <svg {...svgProps}><polygon points="5,0.5 9.5,8.5 0.5,8.5" fill={color} /></svg>
    default: return null
  }
}

// ─── Port type config ─────────────────────────────────────────────────────────

export const PORT_TYPE_ICONS = {
  power:          PowerPlantIcon,
  cooler:         CoolerIcon,
  shield:         ShieldGeneratorIcon,
  quantum_drive:  QuantumDriveIcon,
  jump_drive:     JumpDriveIcon,
  sensor:         RadarIcon,
  weapon:         WeaponIcon,
  turret:         TurretIcon,
  missile:        MissileRackIcon,
  countermeasure: ElectromagneticIcon,
  module:         UtilityIcon,
  mining_laser:   MiningLaserIcon,
  salvage_head:   CrossSectionIcon,
  salvage_module: UtilityIcon,
  qed:            QEDIcon,
}

export const PORT_TYPE_LABELS = {
  power:          'Power Plants',
  cooler:         'Coolers',
  shield:         'Shields',
  quantum_drive:  'Quantum Drives',
  jump_drive:     'Jump Drive',
  sensor:         'Sensors',
  weapon:         'Weapons',
  turret:         'Turrets',
  missile:        'Missiles',
  countermeasure: 'Countermeasures',
  module:         'Modules',
  mining_laser:   'Mining Lasers',
  salvage_head:   'Salvage',
  salvage_module: 'Salvage Modules',
  qed:            'QED',
}

export const PORT_CATEGORY_ORDER = [
  'Weapons',
  'Turrets',
  'Missiles',
  'Torpedoes',
  'Point Defense',
  'Shields',
  'Power Plants',
  'Coolers',
  'Quantum Drives',
  'Jump Drive',
  'Countermeasures',
  'Sensors',
  'Modules',
  'Mining Lasers',
  'Salvage',
  'Salvage Modules',
  'QED',
]

/** Map port_type to a display category. Uses category_label from the DB if available. */
export function getPortCategory(portType, categoryLabel) {
  if (categoryLabel) {
    const norm = categoryLabel.trim()
    if (PORT_CATEGORY_ORDER.includes(norm)) return norm
  }
  return PORT_TYPE_LABELS[portType] || portType || 'Other'
}

// ─── Stat formatters ──────────────────────────────────────────────────────────

export const fmtInt = (v) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })
export const fmtCompact = (v) => {
  const n = Number(v)
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}M`
  if (n >= 100_000) return `${(n / 1_000).toLocaleString(undefined, { maximumFractionDigits: 0 })}K`
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}
export const fmtDec1 = (v) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 1 })
export const fmtPct = (v) => `${(Number(v) * 100).toFixed(1)}%`
export const fmtSpeed = (v) => `${(Number(v) / 1000000).toLocaleString(undefined, { maximumFractionDigits: 0 })} Mm/s`
export const fmtRange = (v) => `${(Number(v) / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })} km`
export const fmtSec = (v) => `${(Number(v) / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}s`
export const fmtRPM = (v) => `${fmtInt(v)} RPM`
export const fmtMS = (v) => `${fmtInt(v)} m/s`
export const fmtM = (v) => `${fmtInt(v)} m`

// ─── Column definitions per port_type ─────────────────────────────────────────

export const PICKER_COLUMNS = {
  weapon: [
    { key: 'name', label: 'Name', align: 'left', width: 'flex-[2]' },
    { key: 'manufacturer_name', label: 'Mfr', align: 'left', width: 'w-32' },
    { key: 'size', label: 'Size', width: 'w-8' },
    { key: 'grade', label: 'Grade', width: 'w-8' },
    { key: 'dps', label: 'DPS', format: fmtDec1, width: 'w-16' },
    { key: 'damage_per_shot', label: 'Alpha', format: fmtDec1, width: 'w-14' },
    { key: 'rounds_per_minute', label: 'RPM', format: fmtInt, width: 'w-14' },
    { key: 'effective_range', label: 'Range', format: fmtM, width: 'w-16' },
    { key: 'ammo_container_size', label: 'Ammo', format: fmtInt, width: 'w-12' },
    { key: 'power_draw', label: 'Power', format: fmtDec1, width: 'w-12' },
  ],
  turret: [
    { key: 'name', label: 'Name', align: 'left', width: 'flex-[2]' },
    { key: 'manufacturer_name', label: 'Mfr', align: 'left', width: 'w-32' },
    { key: 'size', label: 'Size', width: 'w-8' },
    { key: 'grade', label: 'Grade', width: 'w-8' },
    { key: 'dps', label: 'DPS', format: fmtDec1, width: 'w-16' },
    { key: 'damage_per_shot', label: 'Alpha', format: fmtDec1, width: 'w-14' },
    { key: 'rotation_speed', label: 'Rot', format: (v) => `${v}°/s`, width: 'w-14' },
  ],
  shield: [
    { key: 'name', label: 'Name', align: 'left', width: 'flex-[2]' },
    { key: 'manufacturer_name', label: 'Mfr', align: 'left', width: 'w-32' },
    { key: 'size', label: 'Size', width: 'w-8' },
    { key: 'grade', label: 'Grade', width: 'w-8' },
    { key: 'shield_hp', label: 'HP', format: fmtInt, width: 'w-16' },
    { key: 'shield_regen', label: 'Regen', format: fmtDec1, width: 'w-14' },
    { key: 'regen_delay', label: 'Delay', format: fmtSec, width: 'w-14' },
    { key: 'resist_physical', label: 'Phys', format: fmtPct, width: 'w-14' },
    { key: 'resist_energy', label: 'Enrg', format: fmtPct, width: 'w-14' },
    { key: 'resist_distortion', label: 'Dist', format: fmtPct, width: 'w-14' },
  ],
  cooler: [
    { key: 'name', label: 'Name', align: 'left', width: 'flex-[2]' },
    { key: 'manufacturer_name', label: 'Mfr', align: 'left', width: 'w-32' },
    { key: 'size', label: 'Size', width: 'w-8' },
    { key: 'grade', label: 'Grade', width: 'w-8' },
    { key: 'cooling_rate', label: 'Cooling', format: (v) => `${fmtInt(v)}/s`, width: 'w-18' },
    { key: 'max_temperature', label: 'Max T', format: fmtInt, width: 'w-14' },
  ],
  power: [
    { key: 'name', label: 'Name', align: 'left', width: 'flex-[2]' },
    { key: 'manufacturer_name', label: 'Mfr', align: 'left', width: 'w-32' },
    { key: 'size', label: 'Size', width: 'w-8' },
    { key: 'grade', label: 'Grade', width: 'w-8' },
    { key: 'power_output', label: 'Output', format: fmtInt, width: 'w-16' },
    { key: 'overpower_performance', label: 'OvrPwr', format: fmtDec1, width: 'w-14' },
    { key: 'overclock_performance', label: 'OvrClk', format: fmtDec1, width: 'w-14' },
  ],
  quantum_drive: [
    { key: 'name', label: 'Name', align: 'left', width: 'flex-[2]' },
    { key: 'manufacturer_name', label: 'Mfr', align: 'left', width: 'w-32' },
    { key: 'size', label: 'Size', width: 'w-8' },
    { key: 'grade', label: 'Grade', width: 'w-8' },
    { key: 'quantum_speed', label: 'Speed', format: fmtSpeed, width: 'w-18' },
    { key: 'quantum_range', label: 'Range', format: fmtRange, width: 'w-16' },
    { key: 'fuel_rate', label: 'Fuel', format: fmtDec1, width: 'w-12' },
    { key: 'spool_time', label: 'Spool', format: fmtSec, width: 'w-14' },
  ],
  sensor: [
    { key: 'name', label: 'Name', align: 'left', width: 'flex-[2]' },
    { key: 'manufacturer_name', label: 'Mfr', align: 'left', width: 'w-32' },
    { key: 'size', label: 'Size', width: 'w-8' },
    { key: 'grade', label: 'Grade', width: 'w-8' },
    { key: 'radar_range', label: 'Range', format: fmtRange, width: 'w-16' },
    { key: 'radar_angle', label: 'Angle', format: (v) => `${v}°`, width: 'w-12' },
  ],
}

PICKER_COLUMNS.missile = [
  { key: 'name', label: 'Name', align: 'left', width: 'flex-[2]' },
  { key: 'manufacturer_name', label: 'Mfr', align: 'left', width: 'w-32' },
  { key: 'size', label: 'Size', width: 'w-8' },
  { key: 'damage', label: 'Damage', format: fmtDec1, width: 'w-16' },
  { key: 'tracking_signal', label: 'Track', align: 'left', width: 'w-16' },
  { key: 'lock_time', label: 'Lock', format: fmtSec, width: 'w-14' },
  { key: 'speed', label: 'Speed', format: fmtMS, width: 'w-14' },
]

PICKER_COLUMNS.mining_laser = PICKER_COLUMNS.weapon
PICKER_COLUMNS.salvage_head = PICKER_COLUMNS.weapon
PICKER_COLUMNS.qed = PICKER_COLUMNS.sensor
PICKER_COLUMNS.countermeasure = PICKER_COLUMNS.sensor

/** Get column definitions for a port_type */
export function getColumnsForPortType(portType) {
  return PICKER_COLUMNS[portType] || [
    { key: 'name', label: 'Name', align: 'left', width: 'flex-[2]' },
    { key: 'manufacturer_name', label: 'Mfr', align: 'left', width: 'w-32' },
    { key: 'size', label: 'Size', width: 'w-8' },
    { key: 'grade', label: 'Grade', width: 'w-8' },
  ]
}

/** Get the default sort key for a port_type */
export function getDefaultSortKey(portType) {
  const map = {
    weapon: 'dps', turret: 'dps', shield: 'shield_hp', cooler: 'cooling_rate',
    power: 'power_output', quantum_drive: 'quantum_speed', sensor: 'radar_range',
    missile: 'damage', mining_laser: 'dps', qed: 'radar_range',
  }
  return map[portType] || 'name'
}

/** Format the primary stat for a component based on port_type */
export function getPrimaryStat(item, override) {
  const data = override || item
  const pt = item.port_type

  if (pt === 'power' && data.power_output) return `${fmtInt(data.power_output)} pwr`
  if (pt === 'cooler' && data.cooling_rate) return `${fmtInt(data.cooling_rate)}/s`
  if (pt === 'shield' && data.shield_hp) return `${fmtInt(data.shield_hp)} HP`
  if (pt === 'quantum_drive' && data.quantum_speed) return fmtSpeed(data.quantum_speed)
  if ((pt === 'weapon' || pt === 'turret') && data.dps) return `${fmtDec1(data.dps)} DPS`
  if (pt === 'sensor' && data.radar_range) return fmtRange(data.radar_range)
  return null
}

/** Get the primary damage type for a component */
export function getDamageType(item) {
  const dp = item.damage_physical || 0
  const de = item.damage_energy || 0
  const dd = item.damage_distortion || 0
  const dt = item.damage_thermal || 0
  if (dp > de && dp > dd && dp > dt) return 'physical'
  if (de > dp && de > dd && de > dt) return 'energy'
  if (dd > dp && dd > de && dd > dt) return 'distortion'
  if (dt > dp && dt > de && dt > dd) return 'thermal'
  if (de > 0) return 'energy'
  if (dp > 0) return 'physical'
  // Fallback to damage_type string
  if (item.damage_type === 'Energy') return 'energy'
  if (item.damage_type === 'Physical' || item.damage_type === 'Ballistic') return 'physical'
  if (item.damage_type === 'Distortion') return 'distortion'
  return null
}

/** Stat key used for sorting compatible components */
export const SORT_STAT_KEY = {
  PowerPlant: 'power_output',
  Cooler: 'cooling_rate',
  Shield: 'shield_hp',
  QuantumDrive: 'quantum_speed',
  WeaponGun: 'dps',
  Radar: 'radar_range',
  TurretBase: 'dps',
  Turret: 'dps',
  QuantumInterdictionGenerator: 'qed_range',
  MissileLauncher: 'damage',
}

/** Map backend component type to port_type for stat display */
export const COMPONENT_TYPE_TO_PORT_TYPE = {
  PowerPlant: 'power',
  Cooler: 'cooler',
  Shield: 'shield',
  QuantumDrive: 'quantum_drive',
  JumpDrive: 'jump_drive',
  WeaponGun: 'weapon',
  Radar: 'sensor',
  TurretBase: 'turret',
  Turret: 'turret',
  QuantumInterdictionGenerator: 'qed',
  MissileLauncher: 'missile',
  MiningModifier: 'mining_laser',
  SalvageHead: 'salvage_head',
  Module: 'module',
}

// ─── Aggregation helpers ──────────────────────────────────────────────────────

/** Aggregate combat stats from all weapon/turret ports */
export function aggregateCombatStats(components) {
  let totalDps = 0, totalAlpha = 0
  let dpsPhysical = 0, dpsEnergy = 0, dpsDistortion = 0, dpsThermal = 0
  let totalShieldHp = 0, totalShieldRegen = 0
  let totalPowerOutput = 0, totalPowerDraw = 0, totalCoolingRate = 0

  for (const c of components) {
    if ((c.port_type === 'weapon' || c.port_type === 'turret') && c.dps) {
      totalDps += c.dps
      totalAlpha += c.damage_per_shot || 0
      const rpm = c.rounds_per_minute || 0
      if (rpm > 0) {
        dpsPhysical += (c.damage_physical || 0) * rpm / 60
        dpsEnergy += (c.damage_energy || 0) * rpm / 60
        dpsDistortion += (c.damage_distortion || 0) * rpm / 60
        dpsThermal += (c.damage_thermal || 0) * rpm / 60
      } else {
        const dtype = getDamageType(c)
        if (dtype === 'physical') dpsPhysical += c.dps
        else if (dtype === 'energy') dpsEnergy += c.dps
        else if (dtype === 'distortion') dpsDistortion += c.dps
        else if (dtype === 'thermal') dpsThermal += c.dps
      }
    }
    if (c.port_type === 'shield' && c.shield_hp) {
      totalShieldHp += c.shield_hp
      totalShieldRegen += c.shield_regen || 0
    }
    // Power aggregation
    if (c.power_output > 0) totalPowerOutput += c.power_output
    if (c.power_draw > 0) totalPowerDraw += c.power_draw
    if (c.cooling_rate > 0) totalCoolingRate += c.cooling_rate
  }

  return {
    totalDps, totalAlpha,
    dpsPhysical, dpsEnergy, dpsDistortion, dpsThermal,
    totalShieldHp, totalShieldRegen,
    totalPowerOutput, totalPowerDraw, totalCoolingRate,
  }
}

// ─── Location planner (#94) ─────────────────────────────────────────────────
// Group the active loadout's components by the cheapest shop that sells each,
// producing a "go here for these items" shopping plan. Components carry a
// `shops` array ({ shop_name, location_label, buy_price }) from the
// /api/loadout/:slug/components response (loadout.ts shopMap). Components with
// no buyable shop entry fall into `lootOnly`.
export function groupLoadoutByLocation(components) {
  const empty = { groups: [], lootOnly: [], totalCost: 0 }
  if (!Array.isArray(components) || components.length === 0) return empty

  const groups = new Map() // key → { shop_name, location_label, items, subtotal }
  const lootOnly = []

  for (const comp of components) {
    const name = comp.name || comp.component_name || comp.child_name || 'Component'
    const buyable = (comp.shops || []).filter((s) => Number(s.buy_price) > 0)
    if (buyable.length === 0) {
      lootOnly.push({ name })
      continue
    }
    // Cheapest shop wins (optimized per-item; the cart's "Optimize" does true
    // set-cover across shops — this is the lighter inline summary).
    const best = buyable.reduce((a, b) => (Number(b.buy_price) < Number(a.buy_price) ? b : a))
    const key = [best.shop_name, best.location_label].filter(Boolean).join(' · ') || 'Unknown shop'
    if (!groups.has(key)) {
      groups.set(key, { shop_name: best.shop_name || null, location_label: best.location_label || null, items: [], subtotal: 0 })
    }
    const g = groups.get(key)
    g.items.push({ name, buy_price: Number(best.buy_price) })
    g.subtotal += Number(best.buy_price)
  }

  const ordered = [...groups.values()].sort((a, b) =>
    (a.shop_name || '').localeCompare(b.shop_name || ''),
  )
  for (const g of ordered) g.items.sort((a, b) => a.name.localeCompare(b.name))

  return {
    groups: ordered,
    lootOnly: lootOnly.sort((a, b) => a.name.localeCompare(b.name)),
    totalCost: ordered.reduce((sum, g) => sum + g.subtotal, 0),
  }
}
