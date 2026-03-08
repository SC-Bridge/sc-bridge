import { X, ShoppingCart, Package, Swords, Skull, FileText, Plus, Bookmark, BookmarkPlus } from 'lucide-react'
import { useLootItem } from '../../hooks/useAPI'
import useGameVersion from '../../hooks/useGameVersion'
import { rarityStyle, CATEGORY_BADGE_STYLES, CATEGORY_LABELS, RESISTANCE_KEYS } from '../../lib/lootDisplay'
import LoadingState from '../../components/LoadingState'
import LocationSection from './LocationSection'

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

/** Human-readable labels for known stats_json fields. null = hidden. */
const STAT_LABELS = {
  // FPS weapons
  item_port_count:       'Attachment Slots',
  ammo_capacity:         'Ammo Capacity',
  rounds_per_minute:     'Rounds / Min',
  fire_modes:            'Fire Modes',
  burst_count:           null,           // merged into fire_modes display
  physical_damage:       'Physical Damage',
  // Helmet / armour damage resistances (multiplier: lower = more resistant)
  physical_resistance:   'Physical Resist',
  energy_resistance:     'Energy Resist',
  distortion_resistance: 'Distortion Resist',
  thermal_resistance:    'Thermal Resist',
  biochemical_resistance:'Biochemical Resist',
  stun_resistance:       'Stun Resist',
  // Helmet / armour misc
  atmosphere_capacity:   'EVA Support',
  ir_emission:           'IR Emission',
  em_emission:           'EM Emission',
  // Attachments
  zoom_scale:            'Zoom',
  second_zoom_scale:     'Alt Zoom',
  damage_multiplier:     'Damage Modifier',
  sound_radius_multiplier:'Sound Radius',
  // Utilities / consumables
  consumable_volume:     'Volume (microSCU)',
  consumable_doses:      'Doses',
  blast_radius:          'Blast Radius',
  pressure:              'Pressure',
  device_type:           'Device Type',
}

/** Display order for known stats fields. Unknown fields sort alphabetically after. */
const STAT_ORDER = [
  'item_port_count', 'ammo_capacity', 'rounds_per_minute', 'fire_modes', 'physical_damage',
  'zoom_scale', 'second_zoom_scale', 'damage_multiplier', 'sound_radius_multiplier',
  'physical_resistance', 'energy_resistance', 'distortion_resistance',
  'thermal_resistance', 'biochemical_resistance', 'stun_resistance',
  'atmosphere_capacity', 'ir_emission', 'em_emission',
  'consumable_volume', 'consumable_doses', 'blast_radius', 'pressure', 'device_type',
]

/** Keys where the stored value is a multiplier (1.0 = base); display as % of base. */
const MULTIPLIER_STATS = new Set(['damage_multiplier', 'sound_radius_multiplier'])
/** Keys where the stored value is a damage resistance multiplier (lower = more resistant). */
const RESISTANCE_STATS = new Set(RESISTANCE_KEYS)

export default function DetailPanel({ uuid, manufacturerName, collectionQty, onSetCollectionQty, wishlisted, onToggleWishlist, isAuthed, onClose }) {
  const { activeCode } = useGameVersion()
  const { data: item, loading } = useLootItem(uuid, activeCode)

  if (!uuid) return null

  const parsedJson = (key) => {
    if (!item?.[key] || item[key] === 'null' || item[key] === '[]') return []
    try { return JSON.parse(item[key]) } catch { return [] }
  }

  const rs = item?.rarity ? rarityStyle(item.rarity) : null
  const catStyle = item ? CATEGORY_BADGE_STYLES[item.category] || CATEGORY_BADGE_STYLES.unknown : ''
  const catLabel = item ? CATEGORY_LABELS[item.category] || item.category : ''

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
        className="fixed right-0 top-0 h-full w-full sm:w-[28rem] bg-sc-darker border-l border-sc-border z-50 flex flex-col overflow-hidden"
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
              <h2 className="text-sm font-semibold text-white leading-tight">{item.name}</h2>
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
                {item.sub_type && (
                  <span className="text-[10px] font-mono text-gray-400 bg-gray-800/60 px-1.5 py-0.5 rounded">
                    {item.sub_type}
                  </span>
                )}
              </div>
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

            {/* Item stats from linked table */}
            {item.item_details && (() => {
              const det = item.item_details
              const hasDescription = !!det.description
              const hasType = det.type && det.type !== item.type
              const hasSubType = !!det.sub_type && det.sub_type !== 'UNDEFINED' && det.sub_type !== det.type
              const hasSlot = !!det.slot
              const hasSize = det.size != null
              const hasGrade = det.grade != null
              const hasStats = det.stats_json && det.stats_json !== 'null'
              if (!hasDescription && !hasType && !hasSubType && !hasSlot && !hasSize && !hasGrade && !hasStats) return null

              // Parse and sort stats entries: known fields first (STAT_ORDER), then alphabetical
              let statsEntries = []
              if (hasStats) {
                try {
                  const stats = JSON.parse(det.stats_json)
                  statsEntries = Object.entries(stats)
                    .filter(([k]) => STAT_LABELS[k] !== null)
                    .sort(([a], [b]) => {
                      const ai = STAT_ORDER.indexOf(a)
                      const bi = STAT_ORDER.indexOf(b)
                      if (ai === -1 && bi === -1) return a.localeCompare(b)
                      if (ai === -1) return 1
                      if (bi === -1) return -1
                      return ai - bi
                    })
                    .map(([k, v]) => {
                      const label = STAT_LABELS[k] ?? k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                      let display
                      if (k === 'fire_modes') {
                        display = formatFireModes(v, stats.burst_count)
                      } else if (Array.isArray(v)) {
                        display = v.join(', ')
                      } else if (RESISTANCE_STATS.has(k) && typeof v === 'number') {
                        // e.g. 0.6 → "40% reduction"
                        display = `${Math.round((1 - v) * 100)}% reduction`
                      } else if (MULTIPLIER_STATS.has(k) && typeof v === 'number') {
                        // e.g. 0.66 → "66% of base"
                        display = `${Math.round(v * 100)}% of base`
                      } else if ((k === 'zoom_scale' || k === 'second_zoom_scale') && typeof v === 'number') {
                        display = `${v}x`
                      } else if (k === 'atmosphere_capacity' && typeof v === 'number') {
                        display = v > 0 ? 'Yes' : 'No'
                      } else if (k === 'blast_radius' && typeof v === 'number') {
                        display = `${v}m`
                      } else {
                        display = String(v)
                      }
                      return { k, label, display }
                    })
                    .filter(({ display }) => display)
                } catch { /* skip */ }
              }

              return (
                <div>
                  <p className="text-[10px] font-display uppercase tracking-wider text-gray-500 mb-2">Item Details</p>
                  <div className="space-y-1 text-xs font-mono">
                    {hasType && (
                      <div className="flex gap-2">
                        <span className="text-gray-500 w-32 shrink-0">Type</span>
                        <span className="text-gray-300">{det.type}</span>
                      </div>
                    )}
                    {hasSubType && (
                      <div className="flex gap-2">
                        <span className="text-gray-500 w-32 shrink-0">Sub Type</span>
                        <span className="text-gray-300">{det.sub_type}</span>
                      </div>
                    )}
                    {hasSlot && (
                      <div className="flex gap-2">
                        <span className="text-gray-500 w-32 shrink-0">Slot</span>
                        <span className="text-gray-300">{det.slot}</span>
                      </div>
                    )}
                    {hasSize && (
                      <div className="flex gap-2">
                        <span className="text-gray-500 w-32 shrink-0">Size</span>
                        <span className="text-gray-300">S{det.size}</span>
                      </div>
                    )}
                    {hasGrade && (
                      <div className="flex gap-2">
                        <span className="text-gray-500 w-32 shrink-0">Grade</span>
                        <span className="text-gray-300">{det.grade}</span>
                      </div>
                    )}
                    {/* stats_json fields before description so RPM/fire modes group with structural info */}
                    {statsEntries.map(({ k, label, display }) => (
                      <div key={k} className="flex gap-2">
                        <span className="text-gray-500 w-32 shrink-0">{label}</span>
                        <span className="text-gray-300">{display}</span>
                      </div>
                    ))}
                    {hasDescription && (
                      <p className="text-gray-400 text-[11px] leading-relaxed whitespace-pre-wrap pt-1">
                        {decodeMojibake(det.description.replace(/\\n/g, '\n'))}
                      </p>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* Where to find — parse JSON directly (has_* flags not present in detail response) */}
            {(() => {
              const locationSections = [
                { label: 'Shops',      icon: ShoppingCart, type: 'shops',      data: parsedJson('shops_json') },
                { label: 'Containers', icon: Package,      type: 'containers', data: parsedJson('containers_json') },
                { label: 'NPCs',       icon: Swords,       type: 'npcs',       data: parsedJson('npcs_json') },
                { label: 'Corpses',    icon: Skull,        type: 'corpses',    data: parsedJson('corpses_json') },
                { label: 'Contracts',  icon: FileText,     type: 'contracts',  data: parsedJson('contracts_json') },
              ]
              const hasAny = locationSections.some(s => s.data.length > 0)
              return hasAny ? (
                <div>
                  <p className="text-[10px] font-display uppercase tracking-wider text-gray-500 mb-3">Where to Find</p>
                  <div className="space-y-4">
                    {locationSections.map(({ label, icon, data, type }) => (
                      <LocationSection key={label} label={label} icon={icon} data={data} type={type} />
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
