import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Package, Swords, FileText, Bookmark, BookmarkPlus, Plus, Check, MapPin } from 'lucide-react'
import { useLootItem, useLootCollection, useLootWishlist, toggleLootWishlist, setLootCollectionQuantity } from '../../hooks/useAPI'
import { useSession } from '../../lib/auth-client'
import { rarityStyle, CATEGORY_BADGE_STYLES, CATEGORY_LABELS, effectiveCategory, humanizeRawDisplayName } from '../../lib/lootDisplay'
import PageHeader from '../../components/PageHeader'
import LoadingState from '../../components/LoadingState'
import ErrorState from '../../components/ErrorState'
import ResistanceBar from './ResistanceBar'
import LocationSection from './LocationSection'
import ReportPriceModal from './ReportPriceModal'

// Price provenance → display label + badge style (#139: UEX / SC-Companion / User Reported)
const PRICE_SOURCE_BADGES = {
  uex: { label: 'UEX', cls: 'bg-sky-500/10 text-sky-400 border-sky-500/20' },
  'sc-companion': { label: 'SC-Companion', cls: 'bg-violet-500/10 text-violet-400 border-violet-500/20' },
  user: { label: 'User Reported', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
}

function WhereToBuy({ shops, isAuthed, onReport }) {
  const sorted = [...shops].sort((a, b) => (a.location_label || '').localeCompare(b.location_label || ''))
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-[10px] font-display uppercase tracking-widest text-gray-500">Where to Buy</h3>
        {isAuthed ? (
          <button onClick={onReport} className="text-[10px] font-mono text-sc-accent hover:text-sc-accent/80 transition-colors">+ Report price</button>
        ) : (
          <Link to="/login" className="text-[10px] font-mono text-gray-500 hover:text-gray-300 transition-colors">Log in to report</Link>
        )}
      </div>
      {sorted.length === 0 ? (
        <div className="flex items-center gap-2 px-3 py-4 text-xs text-gray-500">
          <MapPin className="w-3.5 h-3.5 text-gray-600" />
          Location unknown — no community price reported yet.
        </div>
      ) : (
        <div className="space-y-1">
          {sorted.map((s, i) => {
            const badge = PRICE_SOURCE_BADGES[s.price_source] || null
            return (
              <div key={i} className="flex items-center justify-between gap-2 pl-2 border-l border-sc-border py-0.5">
                <span className="min-w-0">
                  <span className="text-xs font-mono text-gray-200 break-words">{s.shop_name}</span>
                  {s.location_label && <span className="text-[10px] font-mono text-gray-500 ml-1.5">{s.location_label}</span>}
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {s.buy_price > 0 && <span className="text-[11px] font-mono text-amber-400">{Math.round(s.buy_price).toLocaleString()} aUEC</span>}
                  {badge && <span className={`text-[9px] font-mono px-1 py-0.5 rounded border ${badge.cls}`}>{badge.label}</span>}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const STAT_GROUPS = {
  combat: {
    label: 'Combat',
    keys: ['dps', 'damage_per_shot', 'damage', 'damage_type', 'rounds_per_minute', 'fire_modes',
           'projectile_speed', 'effective_range', 'ammo_container_size', 'heat_per_shot', 'power_draw'],
  },
  defense: {
    label: 'Defenses',
    keys: ['shield_hp', 'shield_regen', 'regen_delay', 'downed_regen_delay',
           'resist_physical', 'resist_energy', 'resist_distortion', 'resist_thermal', 'resist_biochemical', 'resist_stun'],
  },
  performance: {
    label: 'Performance',
    keys: ['power_output', 'overpower_performance', 'overclock_performance',
           'cooling_rate', 'max_temperature', 'overheat_temperature', 'thermal_output',
           'quantum_speed', 'quantum_range', 'fuel_rate', 'spool_time', 'cooldown_time',
           'stage1_accel', 'stage2_accel'],
  },
  turret: {
    label: 'Turret',
    keys: ['rotation_speed', 'gimbal_type', 'min_pitch', 'max_pitch', 'min_yaw', 'max_yaw'],
  },
  signature: {
    label: 'Signature',
    keys: ['ir_emission', 'em_emission', 'radar_range', 'radar_angle', 'qed_range', 'qed_strength'],
  },
  missile: {
    label: 'Missile',
    keys: ['missile_type', 'tracking_signal', 'lock_time', 'lock_range', 'speed', 'blast_radius', 'ammo_count'],
  },
}

const STAT_LABELS = {
  dps: 'DPS', damage_per_shot: 'Damage/Shot', damage: 'Damage', damage_type: 'Damage Type',
  rounds_per_minute: 'RPM', fire_modes: 'Fire Modes', projectile_speed: 'Projectile Speed',
  effective_range: 'Range', ammo_container_size: 'Ammo Pool', heat_per_shot: 'Heat/Shot',
  power_draw: 'Power Draw', shield_hp: 'Shield HP', shield_regen: 'Shield Regen',
  regen_delay: 'Regen Delay', downed_regen_delay: 'Downed Regen Delay',
  resist_physical: 'Physical', resist_energy: 'Energy', resist_distortion: 'Distortion',
  resist_thermal: 'Thermal', resist_biochemical: 'Biochemical', resist_stun: 'Stun',
  power_output: 'Power Output', overpower_performance: 'Overpower', overclock_performance: 'Overclock',
  cooling_rate: 'Cooling Rate', max_temperature: 'Max Temp', overheat_temperature: 'Overheat Temp',
  thermal_output: 'Thermal Output', quantum_speed: 'QT Speed', quantum_range: 'QT Range',
  fuel_rate: 'Fuel Rate', spool_time: 'Spool Time', cooldown_time: 'Cooldown',
  stage1_accel: 'Stage 1 Accel', stage2_accel: 'Stage 2 Accel',
  rotation_speed: 'Rotation Speed', gimbal_type: 'Gimbal Type',
  min_pitch: 'Min Pitch', max_pitch: 'Max Pitch', min_yaw: 'Min Yaw', max_yaw: 'Max Yaw',
  ir_emission: 'IR Emission', em_emission: 'EM Emission',
  radar_range: 'Radar Range', radar_angle: 'Radar Angle',
  qed_range: 'QED Range', qed_strength: 'QED Strength',
  missile_type: 'Type', tracking_signal: 'Tracking', lock_time: 'Lock Time',
  lock_range: 'Lock Range', speed: 'Speed', blast_radius: 'Blast Radius', ammo_count: 'Ammo',
}

function formatValue(key, value) {
  if (value == null) return null
  if (key.startsWith('resist_')) return null // handled by ResistanceBar
  if (typeof value === 'number') {
    if (value >= 10000) return value.toLocaleString(undefined, { maximumFractionDigits: 0 })
    if (value % 1 === 0) return String(value)
    return value.toFixed(2)
  }
  if (Array.isArray(value)) return value.join(', ')
  return String(value)
}

function StatGroup({ label, stats, det }) {
  const resistKeys = stats.filter(k => k.startsWith('resist_') && det[k] != null)
  const otherStats = stats.filter(k => !k.startsWith('resist_') && det[k] != null)

  if (resistKeys.length === 0 && otherStats.length === 0) return null

  return (
    <div className="panel p-4 space-y-3">
      <h3 className="text-[10px] font-display uppercase tracking-widest text-gray-500">{label}</h3>
      {resistKeys.length > 0 && (
        <div className="space-y-1.5">
          {resistKeys.map(k => <ResistanceBar key={k} statKey={k} value={det[k]} />)}
        </div>
      )}
      {otherStats.length > 0 && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          {otherStats.map(k => (
            <div key={k} className="flex justify-between gap-2">
              <span className="text-xs font-mono text-gray-500">{STAT_LABELS[k] || k}</span>
              <span className="text-xs font-mono text-white">{formatValue(k, det[k])}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function FullItemDetail() {
  const { uuid } = useParams()
  const navigate = useNavigate()
  const { data: item, loading, error, refetch } = useLootItem(uuid)
  const { data: session } = useSession()
  const isAuthed = !!session?.user
  const [reportOpen, setReportOpen] = useState(false)
  const { data: collectionIds, refetch: refetchCollection } = useLootCollection(isAuthed)
  const { data: wishlistItems, refetch: refetchWishlist } = useLootWishlist(isAuthed)

  const collected = new Map((collectionIds || []).map(e => [e.loot_uuid, e.quantity]))
  const wishlistIds = new Set((wishlistItems || []).map(i => i.uuid))

  if (loading) return <LoadingState message="Loading item..." />
  if (error) return <ErrorState message={error} />
  if (!item) return <ErrorState message="Item not found" />

  const rs = item.rarity ? rarityStyle(item.rarity) : null
  const eCat = effectiveCategory(item)
  const catStyle = CATEGORY_BADGE_STYLES[eCat] || CATEGORY_BADGE_STYLES.unknown
  const catLabel = CATEGORY_LABELS[eCat] || eCat
  const det = item.item_details || {}
  const collectionQty = collected.get(item.uuid) ?? 0
  const isWishlisted = wishlistIds.has(item.uuid)

  const locationData = (type) => item?.locations?.[type] || []
  const npcEntries = locationData('npcs')

  const handleToggleWishlist = async () => {
    await toggleLootWishlist(uuid, isWishlisted)
    refetchWishlist()
  }
  const handleSetQty = async (qty) => {
    await setLootCollectionQuantity(uuid, qty)
    refetchCollection()
  }

  return (
    <div className="space-y-6 animate-fade-in-up max-w-5xl mx-auto">
      {/* Back link */}
      <Link to="/loot" className="inline-flex items-center gap-1.5 text-xs font-mono text-gray-500 hover:text-sc-accent transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Item Finder
      </Link>

      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] font-display uppercase tracking-wide px-1.5 py-0.5 rounded ${catStyle}`}>
            {catLabel}
          </span>
          {det.size != null && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-sc-accent2/30 bg-sc-accent2/10 text-sc-accent2">
              S{det.size}
            </span>
          )}
          {det.grade && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-400">
              {det.grade}
            </span>
          )}
          {item.rarity && rs && (
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${rs.badge}`}>
              {item.rarity}
            </span>
          )}
        </div>
        <h1 className="text-xl font-display font-bold text-white">{humanizeRawDisplayName(item.name)}</h1>
        {item.manufacturer_name && (
          <p className="text-sm font-mono text-gray-400">{item.manufacturer_name}</p>
        )}
        {det.description && (
          <p className="text-xs text-gray-400 leading-relaxed max-w-2xl">
            {det.description.replace(/\\n/g, '\n')}
          </p>
        )}
      </div>

      {/* Actions */}
      {isAuthed && (
        <div className="flex gap-2">
          <button
            onClick={handleToggleWishlist}
            className={`flex items-center gap-1.5 px-3 py-2 rounded text-xs font-display uppercase tracking-wide border transition-all ${
              isWishlisted
                ? 'bg-amber-500/10 border-amber-500/40 text-amber-400'
                : 'border-sc-border text-gray-400 hover:text-gray-200 hover:border-gray-500'
            }`}
          >
            {isWishlisted ? <Bookmark className="w-3.5 h-3.5" /> : <BookmarkPlus className="w-3.5 h-3.5" />}
            {isWishlisted ? 'Wishlisted' : 'Add to Wishlist'}
          </button>
          <button
            onClick={() => handleSetQty(collectionQty > 0 ? 0 : 1)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded text-xs font-display uppercase tracking-wide border transition-all ${
              collectionQty > 0
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                : 'border-sc-border text-gray-400 hover:text-gray-200 hover:border-gray-500'
            }`}
          >
            {collectionQty > 0 ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {collectionQty > 0 ? `Collected (${collectionQty})` : 'Mark Collected'}
          </button>
        </div>
      )}

      {/* Stat groups */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(STAT_GROUPS).map(([key, group]) => (
          <StatGroup key={key} label={group.label} stats={group.keys} det={det} />
        ))}
      </div>

      {/* Where to buy — shops + prices (UEX / SC-Companion / user reports) */}
      <WhereToBuy shops={locationData('shops')} isAuthed={isAuthed} onReport={() => setReportOpen(true)} />

      {/* Where to find — containers, NPCs, contracts (shops moved to Where to Buy) */}
      {(() => {
        const locationSections = [
          { label: 'Containers', icon: Package, type: 'containers', data: locationData('containers'), npcData: npcEntries },
          { label: 'Contracts', icon: FileText, type: 'contracts', data: locationData('contracts') },
        ]
        const hasAny = locationSections.some(s => s.data.length > 0) || npcEntries.length > 0
        if (!hasAny) return null
        return (
          <div className="panel p-4">
            <h3 className="text-[10px] font-display uppercase tracking-widest text-gray-500 mb-4">Where to Find</h3>
            <div className="space-y-4">
              {locationSections.map(({ label, icon, data, type, npcData }) => (
                <LocationSection key={label} label={label} icon={icon} data={data} type={type} npcData={npcData} />
              ))}
            </div>
          </div>
        )
      })()}

      {reportOpen && (
        <ReportPriceModal
          uuid={uuid}
          itemName={humanizeRawDisplayName(item.name)}
          onClose={() => setReportOpen(false)}
          onSubmitted={refetch}
        />
      )}
    </div>
  )
}
