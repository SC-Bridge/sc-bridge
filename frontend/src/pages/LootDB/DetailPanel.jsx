import { X, ShoppingCart, Package, FileText, Plus, Bookmark, BookmarkPlus, ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useLootItem } from '../../hooks/useAPI'
import { rarityStyle, CATEGORY_BADGE_STYLES, CATEGORY_LABELS, RESISTANCE_KEYS, effectiveCategory, humanizeRawDisplayName } from '../../lib/lootDisplay'
import LoadingState from '../../components/LoadingState'
import LocationSection from './LocationSection'
import ResistanceBar from './ResistanceBar'

// ── Detail panel helpers ──────────────────────────────────────────────────────

/**
 * Fix UTF-8 mojibake stored in D1 (e.g. "Â°C" → "°C", "Âµ" → "µ").
 * Caused by double-encoding: UTF-8 bytes stored as Latin-1 characters.
 */
function decodeMojibake(str) {
  if (!str || typeof str !== 'string') return str
  try {
    const encoded = str.replace(/[\x80-\xFF]/g, c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase())
    return decodeURIComponent(encoded)
  } catch { return str }
}

/**
 * Format a fire_modes array into readable text.
 * e.g. ["Burst", "Single"] + burst_count=3 → "3-Round Burst, Single"
 */
function formatFireModes(modes, burstCount) {
  if (!Array.isArray(modes) || modes.length === 0) return null
  return modes
    .map(m => (m === 'Burst' && burstCount) ? `${burstCount}-Round Burst` : m)
    .join(', ')
}

/** Human-readable labels for stat columns. null = hidden. */
const STAT_LABELS = {
  // FPS weapons
  item_port_count:       'Attachment Slots',
  ammo_capacity:         'Ammo Capacity',
  rounds_per_minute:     'Rounds / Min',
  fire_modes:            'Fire Modes',
  burst_count:           null,           // merged into fire_modes display
  damage:                'Damage',
  damage_type:           'Damage Type',
  projectile_speed:      'Projectile Speed',
  effective_range:       'Effective Range',
  dps:                   'DPS',
  zoom_factor:           'Zoom',
  // Magazine / ammo
  caliber:               'Caliber',
  damage_per_round:      'Damage / Round',
  magazine_capacity:     'Capacity',
  // Helmet / armour damage resistances (multiplier: lower = more resistant)
  resist_physical:       'Physical Resist',
  resist_energy:         'Energy Resist',
  resist_distortion:     'Distortion Resist',
  resist_thermal:        'Thermal Resist',
  resist_biochemical:    'Biochemical Resist',
  resist_stun:           'Stun Resist',
  // Helmet / armour misc
  atmosphere_capacity:   'EVA Support',
  ir_emission:           'IR Emission',
  em_emission:           'EM Emission',
  // Attachments
  zoom_scale:            'Zoom',
  second_zoom_scale:     'Alt Zoom',
  damage_multiplier:     'Damage Modifier',
  sound_radius_multiplier:'Sound Radius',
  // Melee weapons
  heavy_damage:          'Heavy Damage',
  attack_types:          'Attack Types',
  can_block:             'Can Block',
  can_takedown:          'Can Takedown',
  // Carryables
  mass:                  'Mass',
  interaction_type:      'Interaction',
  value:                 'Value',
  // Utilities / consumables
  heal_amount:           'Heal Amount',
  effect_duration:       'Duration',
  consumable_type:       'Consumable Type',
  blast_radius:          'Blast Radius',
  fuse_time:             'Fuse Time',
  device_type:           'Device Type',
  // Clothing
  storage_capacity:      'Storage Capacity',
  temperature_range_min: 'Min Temperature',
  temperature_range_max: 'Max Temperature',
  // Vehicle components
  power_output:          'Power Output',
  overpower_performance: 'Overpower Perf.',
  overclock_performance: 'Overclock Perf.',
  thermal_output:        'Thermal Output',
  cooling_rate:          'Cooling Rate',
  max_temperature:       'Max Temperature',
  overheat_temperature:  'Overheat Temp',
  shield_hp:             'Shield HP',
  shield_regen:          'Shield Regen',
  regen_delay:           'Regen Delay',
  downed_regen_delay:    'Downed Regen Delay',
  quantum_speed:         'QT Speed',
  quantum_range:         'QT Range',
  fuel_rate:             'Fuel Rate',
  spool_time:            'Spool Time',
  cooldown_time:         'Cooldown',
  calibration_rate:      'Calibration Rate',
  engage_speed:          'Engage Speed',
  stage1_accel:          'Stage 1 Accel',
  stage2_accel:          'Stage 2 Accel',
  em_signature:          'EM Signature',
  mass:                  'Mass',
  hp:                    'HP',
  base_heat_generation:  'Heat Generation',
  distortion_max:        'Distortion Max',
  ammo_container_size:   'Ammo Pool',
  damage_per_shot:       'Damage/Shot',
  heat_per_shot:         'Heat/Shot',
  power_draw:            'Power Draw',
  rotation_speed:        'Rotation Speed',
  gimbal_type:           'Gimbal Type',
  thrust_force:          'Thrust Force',
  fuel_burn_rate:        'Fuel Burn Rate',
  radar_range:           'Radar Range',
  radar_angle:           'Radar Angle',
  qed_range:             'QED Range',
  qed_strength:          'QED Strength',
  // Ship missiles
  missile_type:          'Missile Type',
  lock_time:             'Lock Time',
  tracking_signal:       'Tracking Signal',
  speed:                 'Speed',
  lock_range:            'Lock Range',
  ammo_count:            'Ammo Count',
}

/** Display order for stat columns. Unknown fields sort alphabetically after. */
const STAT_ORDER = [
  'item_port_count', 'ammo_capacity', 'rounds_per_minute', 'fire_modes', 'damage', 'damage_type',
  'heavy_damage', 'attack_types', 'can_block', 'can_takedown',
  'mass', 'interaction_type', 'value',
  'damage_per_shot', 'dps', 'projectile_speed', 'effective_range', 'heat_per_shot', 'power_draw',
  'zoom_factor', 'zoom_scale', 'second_zoom_scale', 'damage_multiplier', 'sound_radius_multiplier',
  'resist_physical', 'resist_energy', 'resist_distortion',
  'resist_thermal', 'resist_biochemical', 'resist_stun',
  'atmosphere_capacity', 'ir_emission', 'em_emission',
  'storage_capacity', 'temperature_range_min', 'temperature_range_max',
  'heal_amount', 'effect_duration', 'consumable_type', 'blast_radius', 'fuse_time', 'device_type',
  'power_output', 'overpower_performance', 'overclock_performance', 'thermal_output',
  'cooling_rate', 'max_temperature', 'overheat_temperature',
  'shield_hp', 'shield_regen', 'regen_delay', 'downed_regen_delay',
  'quantum_speed', 'quantum_range', 'fuel_rate', 'spool_time', 'cooldown_time', 'calibration_rate', 'engage_speed', 'stage1_accel', 'stage2_accel',
  'ammo_container_size', 'rotation_speed', 'gimbal_type',
  'thrust_force', 'fuel_burn_rate', 'radar_range', 'radar_angle', 'qed_range', 'qed_strength',
  'missile_type', 'lock_time', 'tracking_signal', 'speed', 'lock_range', 'ammo_count',
]

/** Known stat keys that are hidden from generic display (metadata or merged into other stats) */
const STAT_HIDDEN = new Set([
  'name', 'type', 'sub_type', 'slot', 'size', 'grade', 'description', 'id',
  'burst_count',  // merged into fire_modes display
  'magazine_name', 'magazine_size', 'magazine_loot_uuid',  // rendered in Magazine section
  'power_draw', 'thermal_output',  // internal stats, not player-useful
])

/** Primary stat to highlight per effective category */
const PRIMARY_STAT = {
  weapon:         { key: 'dps', label: 'DPS', color: 'text-red-400' },
  ship_weapon:    { key: 'dps', label: 'DPS', color: 'text-red-400' },
  armour:         null,  // uses resistance bars
  helmet:         null,
  ship_component: null,  // determined by sub-type below
  missile:        { key: 'damage', label: 'Damage', color: 'text-red-400' },
  consumable:     { key: 'heal_amount', label: 'Heal', color: 'text-green-400' },
  utility:        null,
}

const SHIP_COMPONENT_PRIMARY = {
  PowerPlant:   { key: 'power_output', label: 'Power Output', color: 'text-yellow-400' },
  Cooler:       { key: 'cooling_rate', label: 'Cooling Rate', color: 'text-blue-400' },
  Shield:       { key: 'shield_hp', label: 'Shield HP', color: 'text-cyan-400' },
  QuantumDrive: { key: 'quantum_speed', label: 'QT Speed', color: 'text-purple-400', suffix: ' m/s' },
}

/** Stat grouping for structured display */
const STAT_GROUPS = {
  combat: { label: 'Combat', keys: new Set(['dps', 'damage', 'damage_per_shot', 'damage_type', 'rounds_per_minute', 'fire_modes', 'projectile_speed', 'effective_range', 'ammo_capacity', 'ammo_container_size', 'heat_per_shot', 'power_draw', 'item_port_count', 'charge_time', 'recoil_strength']) },
  defense: { label: 'Defenses', keys: new Set(['shield_hp', 'shield_regen', 'regen_delay', 'downed_regen_delay', 'resist_physical', 'resist_energy', 'resist_distortion', 'resist_thermal', 'resist_biochemical', 'resist_stun', 'atmosphere_capacity', 'ir_emission', 'em_emission']) },
  performance: { label: 'Performance', keys: new Set(['power_output', 'overpower_performance', 'overclock_performance', 'overclock_threshold_min', 'overclock_threshold_max', 'cooling_rate', 'max_temperature', 'overheat_temperature', 'thermal_output', 'quantum_speed', 'quantum_range', 'fuel_rate', 'spool_time', 'cooldown_time', 'calibration_rate', 'engage_speed', 'stage1_accel', 'stage2_accel', 'base_heat_generation', 'distortion_max']) },
  physical: { label: 'Physical', keys: new Set(['em_signature', 'mass', 'hp']) },
  turret: { label: 'Turret', keys: new Set(['rotation_speed', 'gimbal_type', 'min_pitch', 'max_pitch', 'min_yaw', 'max_yaw']) },
  optics: { label: 'Optics', keys: new Set(['zoom_scale', 'second_zoom_scale', 'zoom_factor', 'damage_multiplier', 'sound_radius_multiplier']) },
  missile_stats: { label: 'Missile', keys: new Set(['missile_type', 'tracking_signal', 'lock_time', 'lock_range', 'speed', 'blast_radius', 'ammo_count']) },
  clothing_stats: { label: 'Properties', keys: new Set(['storage_capacity', 'temperature_range_min', 'temperature_range_max']) },
  utility_stats: { label: 'Properties', keys: new Set(['heal_amount', 'effect_duration', 'consumable_type', 'blast_radius', 'fuse_time', 'device_type', 'detonation_type']) },
  melee_stats: { label: 'Combat', keys: new Set(['heavy_damage', 'attack_types', 'can_block', 'can_takedown']) },
  carryable_stats: { label: 'Properties', keys: new Set(['mass', 'interaction_type', 'value']) },
}

/** Keys where the stored value is a multiplier (1.0 = base); display as % of base. */
const MULTIPLIER_STATS = new Set(['damage_multiplier', 'sound_radius_multiplier'])
/** Keys where the stored value is a damage resistance multiplier (lower = more resistant). */
const RESISTANCE_STATS = new Set(['resist_physical', 'resist_energy', 'resist_distortion', 'resist_thermal', 'resist_biochemical', 'resist_stun'])
/** Stats that should always display for certain categories — show "N/A" when null so users know it's not missing data. */
const ALWAYS_SHOW_STATS = {
  armour:  ['ir_emission', 'em_emission'],
  helmet:  ['ir_emission', 'em_emission'],
}

/** Human-readable labels for consumable effect keys from DataCore. */
const EFFECT_LABELS = {
  Health: 'Health',
  Hunger: 'Hunger',
  Thirst: 'Thirst',
  Oxygen: 'Oxygen',
  Hydrating: 'Hydrating',
  Dehydrating: 'Dehydrating',
  Energizing: 'Energizing',
  Stun: 'Stun',
  Slam: 'Slam',
  BloodDrugLevel: 'Drug Level',
  BodyRadiation: 'Radiation',
  CognitiveBoost: 'Cognitive Boost',
  CognitiveImpair: 'Cognitive Impair',
  Atrophic: 'Atrophic',
  Hypertrophic: 'Hypertrophic',
  HyperMetabolic: 'Hyper Metabolic',
  HypoMetabolic: 'Hypo Metabolic',
  RadiationAntidote: 'Rad Antidote',
  DrugDurationMultiplier: 'Drug Duration',
  OverdoseRevival: 'OD Revival',
  OverdoseRevivalBDLDecay: 'OD BDL Decay',
  // Mask effects — boolean flags (magnitude null = active)
  StunRecoveryMask: 'Stun Recovery',
  MoveSpeedMask: 'Move Speed',
  WeaponSwayMask: 'Weapon Sway',
  ADSEnterMask: 'ADS Speed',
  ArmsLockMask: 'Arms Lock',
  StaminaPoolMask: 'Stamina Pool',
  StaminaRegenMask: 'Stamina Regen',
  ImpactResistanceKnockdownMask: 'Knockdown Resist',
  ImpactResistanceStaggerMask: 'Stagger Resist',
  ImpactResistanceTwitchMask: 'Twitch Resist',
  ImpactResistanceFlinchMask: 'Flinch Resist',
  BloodVisionMask: 'Blood Vision',
  BlurredVisionMask: 'Blurred Vision',
  DoubleVisionMask: 'Double Vision',
  HurtLocomotionMask: 'Hurt Movement',
  DrunkLocomotionMask: 'Drunk Movement',
  DrunkManoeuvringMask: 'Drunk Manoeuvring',
  TraversalLockMask: 'Traversal Lock',
  TraversalLockProneMask: 'Prone Lock',
  PainGruntMask: 'Pain Grunt',
  MuffledAudioInjuryMask: 'Muffled Audio',
  WheezingAudioMask: 'Wheezing Audio',
}

export default function DetailPanel({ uuid, manufacturerName, collectionQty, craftedQty = 0, onSetCollectionQty, wishlisted, onToggleWishlist, isAuthed, onClose }) {
  const { data: item, loading } = useLootItem(uuid)

  if (!uuid) return null

  const locationData = (type) => item?.locations?.[type] || []

  const rs = item?.rarity ? rarityStyle(item.rarity) : null
  const eCat = item ? effectiveCategory(item) : ''
  const catStyle = item ? CATEGORY_BADGE_STYLES[eCat] || CATEGORY_BADGE_STYLES.unknown : ''
  const catLabel = item ? CATEGORY_LABELS[eCat] || eCat : ''

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel */}
      <div
        className="fixed right-0 top-0 h-full w-full sm:w-[36rem] bg-sc-darker border-l border-sc-border z-50 flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-sc-border shrink-0">
          <span className="text-xs font-display uppercase tracking-wider text-gray-400">Item Detail</span>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <LoadingState message="Loading item..." />
          </div>
        )}

        {item && !loading && (
          <div className="flex-1 overflow-y-auto p-4 pb-8 space-y-5">
            {/* Name + badges */}
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-white leading-tight">{humanizeRawDisplayName(item.name)}</h2>
              {manufacturerName && (
                <p className="text-[10px] font-mono text-gray-500">{manufacturerName}</p>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`text-[10px] font-display uppercase tracking-wide px-1.5 py-0.5 rounded ${catStyle}`}>
                  {catLabel}
                </span>
                {item.rarity && rs && (
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${rs.badge}`}>
                    {item.rarity}
                  </span>
                )}
                {item.sub_type && item.sub_type !== 'UNDEFINED' && (
                  <span className="text-[10px] font-mono text-gray-400 bg-gray-800/60 px-1.5 py-0.5 rounded">
                    {item.sub_type}
                  </span>
                )}
              </div>
              {/* Full page link for complex items */}
              {(eCat === 'ship_component' || eCat === 'ship_weapon' || eCat === 'missile') && (
                <Link
                  to={`/loot/${uuid}/detail`}
                  className="inline-flex items-center gap-1.5 text-[10px] font-display uppercase tracking-wide text-sc-accent hover:text-sc-accent/80 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" /> View Full Details
                </Link>
              )}
            </div>

            {/* Action buttons */}
            {isAuthed && (
              <div className="flex gap-2">
                <button
                  onClick={() => onToggleWishlist(uuid, wishlisted)}
                  className={`flex-1 py-2 rounded text-xs font-display uppercase tracking-wide border transition-all duration-150 flex items-center justify-center gap-2 ${
                    wishlisted
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-400'
                      : 'border-sc-border text-gray-400 hover:text-gray-200 hover:border-gray-500'
                  }`}
                >
                  {wishlisted ? <Bookmark className="w-3.5 h-3.5" /> : <BookmarkPlus className="w-3.5 h-3.5" />}
                  {wishlisted ? 'On Wishlist' : 'Add to Wishlist'}
                </button>
                <div className="flex-1 border border-sc-border rounded flex items-center justify-center gap-2 py-2">
                  {collectionQty === 0 ? (
                    <button
                      onClick={() => onSetCollectionQty(uuid, 1)}
                      className="flex items-center gap-1.5 text-xs font-display uppercase tracking-wide text-gray-400 hover:text-gray-200 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Mark Collected
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => onSetCollectionQty(uuid, collectionQty - 1)}
                        className="w-5 h-5 flex items-center justify-center rounded text-sc-accent hover:bg-sc-accent/20 transition-colors text-base leading-none"
                        title={collectionQty === 1 ? 'Remove from collection' : 'Decrease'}
                      >−</button>
                      <span className="text-sm font-mono text-sc-accent min-w-[20px] text-center">{collectionQty}</span>
                      <button
                        onClick={() => onSetCollectionQty(uuid, collectionQty + 1)}
                        className="w-5 h-5 flex items-center justify-center rounded text-sc-accent hover:bg-sc-accent/20 transition-colors"
                        title="Increase"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-[10px] font-display uppercase tracking-wide text-sc-accent/70">Collected</span>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Crafted counter — read-only sum of all crafted_quantity values
                across user_blueprints + user_blueprint_builds whose
                output_item maps to this loot item. Mutated from /crafting,
                shown here as a passive indicator. */}
            {isAuthed && craftedQty > 0 && (
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-300/90">
                <Package className="w-3.5 h-3.5" />
                <span className="text-xs font-mono">{craftedQty}</span>
                <span className="text-[10px] font-display uppercase tracking-wide opacity-75">
                  Crafted
                </span>
                <span className="ml-auto text-[10px] opacity-60">
                  via My Blueprints
                </span>
              </div>
            )}

            {/* Item stats from linked table */}
            {item.item_details && (() => {
              const det = item.item_details
              const hasDescription = !!det.description

              // Primary stat — big highlighted number
              const primaryDef = eCat === 'ship_component' ? SHIP_COMPONENT_PRIMARY[det.type] : PRIMARY_STAT[eCat]
              const primaryVal = primaryDef && det[primaryDef.key] != null ? det[primaryDef.key] : null

              // Size + Grade as badges
              const hasSize = det.size != null
              const hasGrade = det.grade != null

              // Build all stats, filter hidden, sort by order
              const alwaysShow = new Set(ALWAYS_SHOW_STATS[eCat] || [])
              const detWithDefaults = { ...det }
              for (const key of alwaysShow) {
                if (!(key in detWithDefaults)) detWithDefaults[key] = null
              }

              // Format a stat value for display
              const formatStat = (k, v) => {
                if (v == null) return 'N/A'
                if (k === 'fire_modes') return formatFireModes(typeof v === 'string' ? v.split(',').map(s => s.trim()) : v, det.burst_count)
                if (Array.isArray(v)) return v.join(', ')
                if (RESISTANCE_STATS.has(k)) return null  // rendered as bars
                if (MULTIPLIER_STATS.has(k) && typeof v === 'number') return `${Math.round(v * 100)}% of base`
                if ((k === 'zoom_scale' || k === 'second_zoom_scale' || k === 'zoom_factor') && typeof v === 'number') return `${v}x`
                if (k === 'atmosphere_capacity' && typeof v === 'number') return v > 0 ? 'Yes' : 'No'
                if (k === 'blast_radius' && typeof v === 'number') return `${v}m`
                if (k === 'can_block' || k === 'can_takedown') return v ? 'Yes' : 'No'
                return String(v)
              }

              const allStats = Object.entries(detWithDefaults)
                .filter(([k, v]) => !STAT_HIDDEN.has(k) && (v != null || alwaysShow.has(k)) && STAT_LABELS[k] !== null && STAT_LABELS[k] !== undefined)
                .filter(([k]) => !k.startsWith('resist_'))  // resists rendered as bars
                .filter(([k]) => !(primaryDef && k === primaryDef.key))  // primary shown above
                .sort(([a], [b]) => {
                  const ai = STAT_ORDER.indexOf(a)
                  const bi = STAT_ORDER.indexOf(b)
                  if (ai === -1 && bi === -1) return a.localeCompare(b)
                  if (ai === -1) return 1
                  if (bi === -1) return -1
                  return ai - bi
                })
                .map(([k, v]) => ({
                  k, label: STAT_LABELS[k] ?? k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                  display: formatStat(k, v),
                }))
                .filter(({ display }) => display)

              // Resistance keys present in data
              const resistKeys = RESISTANCE_KEYS.filter(k => det[k] != null)

              // Group stats into sections
              const grouped = {}
              for (const entry of allStats) {
                let placed = false
                for (const [gk, group] of Object.entries(STAT_GROUPS)) {
                  if (group.keys.has(entry.k)) {
                    if (!grouped[gk]) grouped[gk] = { label: group.label, entries: [] }
                    grouped[gk].entries.push(entry)
                    placed = true
                    break
                  }
                }
                if (!placed) {
                  if (!grouped._other) grouped._other = { label: 'Other', entries: [] }
                  grouped._other.entries.push(entry)
                }
              }

              const effects = Array.isArray(det.effects) ? det.effects : []

              return (
                <div className="space-y-4">
                  {/* Size + Grade badges */}
                  {(hasSize || hasGrade) && (
                    <div className="flex items-center gap-2">
                      {hasSize && (
                        <span className="text-[10px] font-mono px-2 py-1 rounded border border-sc-accent2/30 bg-sc-accent2/10 text-sc-accent2">
                          Size {det.size}
                        </span>
                      )}
                      {hasGrade && (
                        <span className="text-[10px] font-mono px-2 py-1 rounded border border-amber-500/30 bg-amber-500/10 text-amber-400">
                          Grade {det.grade}
                        </span>
                      )}
                      {det.slot && (
                        <span className="text-[10px] font-mono px-2 py-1 rounded border border-white/[0.08] bg-white/[0.03] text-gray-400">
                          {det.slot}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Primary stat — big highlighted number */}
                  {primaryVal != null && (
                    <div className="panel p-3 flex items-center justify-between">
                      <span className="text-xs font-display uppercase tracking-wide text-gray-400">{primaryDef.label}</span>
                      <span className={`text-2xl font-display font-bold ${primaryDef.color}`}>
                        {typeof primaryVal === 'number' ? (primaryVal >= 1000 ? primaryVal.toLocaleString(undefined, { maximumFractionDigits: 0 }) : primaryVal % 1 === 0 ? primaryVal : primaryVal.toFixed(1)) : primaryVal}
                        {primaryDef.suffix || ''}
                      </span>
                    </div>
                  )}

                  {/* Resistance bars */}
                  {resistKeys.length > 0 && (
                    <div className="panel p-3 space-y-2">
                      <p className="text-[10px] font-display uppercase tracking-wider text-gray-500">Resistances</p>
                      {resistKeys.map(k => <ResistanceBar key={k} statKey={k} value={det[k]} />)}
                    </div>
                  )}

                  {/* Grouped stat sections */}
                  {Object.entries(grouped).map(([gk, group]) => (
                    <div key={gk} className="space-y-1.5">
                      <p className="text-[10px] font-display uppercase tracking-wider text-gray-500">{group.label}</p>
                      <div className="text-xs font-mono space-y-1">
                        {group.entries.map(({ k, label, display }) => (
                          <div key={k} className="flex justify-between gap-2">
                            <span className="text-gray-500">{label}</span>
                            <span className="text-gray-200 text-right">{display}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Magazine link */}
                  {det.magazine_name && (
                    <div className="text-xs font-mono flex justify-between gap-2">
                      <span className="text-gray-500">Magazine</span>
                      <span className="text-gray-200">
                        {det.magazine_loot_uuid ? (
                          <Link to={`/loot/${det.magazine_loot_uuid}`} className="text-sc-accent hover:text-sc-accent/80 transition-colors">
                            {det.magazine_name}
                          </Link>
                        ) : det.magazine_name}
                        {det.magazine_size != null && ` (${det.magazine_size} rds)`}
                      </span>
                    </div>
                  )}

                  {/* Effects */}
                  {effects.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-display uppercase tracking-wider text-gray-500">Effects</p>
                      <div className="text-xs font-mono space-y-1">
                        {effects.map((eff) => (
                          <div key={eff.effect_key} className="flex justify-between gap-2">
                            <span className="text-gray-500 truncate">
                              {EFFECT_LABELS[eff.effect_key] || eff.effect_key.replace(/([A-Z])/g, ' $1').trim()}
                            </span>
                            <span className="text-gray-200 shrink-0 text-right">
                              {eff.magnitude != null ? eff.magnitude : ''}
                              {eff.magnitude != null && eff.duration_seconds != null ? ' · ' : ''}
                              {eff.duration_seconds != null ? `${eff.duration_seconds}s` : ''}
                              {eff.magnitude == null && eff.duration_seconds == null ? 'Active' : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Description */}
                  {hasDescription && (
                    <p className="text-gray-400 text-[11px] leading-relaxed whitespace-pre-wrap border-t border-sc-border/50 pt-3">
                      {decodeMojibake(det.description.replace(/\\n/g, '\n'))}
                    </p>
                  )}
                </div>
              )
            })()}

            {/* Where to find — structured location data from API */}
            {(() => {
              const npcEntries = locationData('npcs')
              const locationSections = [
                { label: 'Shops',      icon: ShoppingCart, type: 'shops',      data: locationData('shops') },
                { label: 'Containers', icon: Package,      type: 'containers', data: locationData('containers'), npcData: npcEntries },
                { label: 'Contracts',  icon: FileText,     type: 'contracts',  data: locationData('contracts') },
              ]
              const hasAny = locationSections.some(s => s.data.length > 0) || npcEntries.length > 0
              return hasAny ? (
                <div>
                  <p className="text-[10px] font-display uppercase tracking-wider text-gray-500 mb-3">Where to Find</p>
                  <div className="space-y-4">
                    {locationSections.map(({ label, icon, data, type, npcData }) => (
                      <LocationSection key={label} label={label} icon={icon} data={data} type={type} npcData={npcData} />
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-500 font-mono">No location data available.</p>
              )
            })()}
          </div>
        )}
      </div>
    </>
  )
}
