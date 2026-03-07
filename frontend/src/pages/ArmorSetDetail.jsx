import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Shield } from 'lucide-react'
import { useLootSet, useLootCollection, setLootCollectionQuantity } from '../hooks/useAPI'
import useGameVersion from '../hooks/useGameVersion'
import { useSession } from '../lib/auth-client'
import PageHeader from '../components/PageHeader'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'
import CollectionStepper from './LootDB/CollectionStepper'
import LocationSection from './LootDB/LocationSection'
import SourceIcons from './LootDB/SourceIcons'
import { SOURCE_DEFS, parseJson } from './LootDB/lootHelpers'
import {
  RARITY_STYLES, CATEGORY_LABELS, CATEGORY_BADGE_STYLES,
  RESISTANCE_KEYS, RESISTANCE_LABELS,
} from '../lib/lootDisplay'

function PieceCard({ piece, collectionQty, onSetQty }) {
  const det = piece.item_details
  const catStyle = CATEGORY_BADGE_STYLES[piece.category] || CATEGORY_BADGE_STYLES.unknown || ''
  const catLabel = CATEGORY_LABELS[piece.category] || piece.category
  const rs = piece.rarity ? RARITY_STYLES[piece.rarity] : null

  return (
    <div className="bg-sc-dark/60 rounded-lg border border-sc-border p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 min-w-0">
          <Link
            to={`/loot/${piece.uuid}`}
            className="text-sm font-semibold text-white hover:text-sc-accent transition-colors block truncate"
          >
            {piece.name}
          </Link>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`text-[9px] font-display uppercase tracking-wide px-1.5 py-0.5 rounded ${catStyle}`}>
              {catLabel}
            </span>
            {piece.sub_type && (
              <span className="text-[9px] font-mono text-gray-400 bg-gray-800/60 px-1.5 py-0.5 rounded">
                {piece.sub_type}
              </span>
            )}
            {piece.rarity && rs && (
              <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${rs.badge}`}>
                {piece.rarity}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <SourceIcons item={piece} />
          {onSetQty && (
            <CollectionStepper qty={collectionQty} onSetQty={(q) => onSetQty(piece.uuid, q)} />
          )}
        </div>
      </div>

      {/* Key stats */}
      {det?.stats_json && det.stats_json !== 'null' && (() => {
        try {
          const stats = JSON.parse(det.stats_json)
          const resistances = RESISTANCE_KEYS
            .filter(k => stats[k] != null)
            .map(k => ({ label: RESISTANCE_LABELS[k], value: Math.round((1 - stats[k]) * 100) }))
          const hasAtmo = stats.atmosphere_capacity != null

          if (resistances.length === 0 && !hasAtmo) return null
          return (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono">
              {resistances.map(r => (
                <span key={r.label} className="text-gray-400">
                  {r.label} <span className="text-gray-300">{r.value}%</span>
                </span>
              ))}
              {hasAtmo && (
                <span className="text-gray-400">
                  EVA <span className="text-gray-300">{stats.atmosphere_capacity > 0 ? 'Yes' : 'No'}</span>
                </span>
              )}
            </div>
          )
        } catch { return null }
      })()}
    </div>
  )
}

function AggregateStats({ pieces }) {
  const totals = {}
  let count = 0

  for (const piece of pieces) {
    const det = piece.item_details
    if (!det?.stats_json || det.stats_json === 'null') continue
    try {
      const stats = JSON.parse(det.stats_json)
      let contributed = false
      for (const k of RESISTANCE_KEYS) {
        if (stats[k] != null) {
          if (!totals[k]) totals[k] = { sum: 0, n: 0 }
          totals[k].sum += (1 - stats[k]) * 100
          totals[k].n++
          contributed = true
        }
      }
      if (contributed) count++
    } catch { /* skip */ }
  }

  if (count === 0) return null

  return (
    <div className="bg-sc-dark/60 rounded-lg border border-sc-border p-4">
      <p className="text-[10px] font-display uppercase tracking-wider text-gray-500 mb-3">
        Combined Resistances ({count} piece{count !== 1 ? 's' : ''})
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {RESISTANCE_KEYS.map(k => {
          const t = totals[k]
          if (!t) return null
          return (
            <div key={k} className="text-center">
              <p className="text-lg font-mono text-white">{Math.round(t.sum)}%</p>
              <p className="text-[9px] font-display uppercase tracking-wider text-gray-500">
                {RESISTANCE_LABELS[k]}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CombinedLocations({ pieces }) {
  const merged = {}
  for (const piece of pieces) {
    for (const { key, jsonKey } of SOURCE_DEFS) {
      const entries = parseJson(piece[jsonKey])
      if (entries.length === 0) continue
      if (!merged[key]) merged[key] = []
      merged[key].push(...entries)
    }
  }

  const hasAny = Object.values(merged).some(arr => arr.length > 0)
  if (!hasAny) return null

  return (
    <div className="bg-sc-dark/60 rounded-lg border border-sc-border p-4 space-y-4">
      <p className="text-[10px] font-display uppercase tracking-wider text-gray-500">Where to Find</p>
      {SOURCE_DEFS.map(({ key, label, icon }) => {
        const data = merged[key]
        if (!data || data.length === 0) return null
        return <LocationSection key={key} label={label} icon={icon} data={data} type={key} />
      })}
    </div>
  )
}

export default function ArmorSetDetail() {
  const { setSlug } = useParams()
  const { activeCode } = useGameVersion()
  const { data: session } = useSession()
  const isAuthed = !!session?.user

  const { data: set, loading, error, refetch } = useLootSet(setSlug, activeCode)
  const { data: collection, refetch: refetchCollection } = useLootCollection(isAuthed)

  const collectionMap = {}
  if (collection) {
    for (const c of collection) collectionMap[c.loot_map_id] = c.quantity
  }

  const handleSetQty = async (uuid, qty) => {
    try {
      await setLootCollectionQuantity(uuid, qty)
      refetchCollection()
    } catch { /* ignore */ }
  }

  if (loading) return <LoadingState fullScreen message="Loading armor set..." />
  if (error) return <ErrorState message={error} onRetry={refetch} />
  if (!set) return <ErrorState message="Set not found" />

  const { setName, manufacturer, pieces } = set

  return (
    <div className="space-y-6">
      <PageHeader
        title={setName}
        subtitle={manufacturer || undefined}
        actions={
          <Link
            to="/loot"
            className="flex items-center gap-1.5 text-xs font-mono text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Loot DB
          </Link>
        }
      />

      {/* Set info bar */}
      <div className="flex items-center gap-3">
        <Shield className="w-5 h-5 text-sc-accent" />
        <span className="text-sm font-mono text-gray-300">
          {pieces.length} piece{pieces.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Aggregate stats */}
      <AggregateStats pieces={pieces} />

      {/* Pieces grid */}
      <div>
        <p className="text-[10px] font-display uppercase tracking-wider text-gray-500 mb-3">Set Pieces</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {pieces.map(piece => (
            <PieceCard
              key={piece.uuid}
              piece={piece}
              collectionQty={collectionMap[piece.id] || 0}
              onSetQty={isAuthed ? handleSetQty : null}
            />
          ))}
        </div>
      </div>

      {/* Combined locations */}
      <CombinedLocations pieces={pieces} />
    </div>
  )
}
