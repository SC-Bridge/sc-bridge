// PART L L8 — Storage taxonomy display for ship detail.
// Summary tiles (rolled-up totals) + collapsible per-feature detail list.
//
// The summary columns (internal_cargo_scu, external_cargo_scu, ...) are a
// one-off backfill the pipeline does not maintain: NULL for ships added since,
// out of date for others. `vehicles.cargo` is the maintained figure, so
// StoragePanel (the ship overview) leads with it and passes it down as
// `liveCargo`, which decides what the two cargo tiles may still say:
//   - Interior Cargo is never shown: it is the same quantity as the cargo
//     figure, so it either repeats it (Carrack 456) or contradicts it (MOLE 96
//     vs 32).
//   - External Pods is a split of the cargo figure, shown only when it fits
//     inside it (0 < external <= cargo). When the pods are all of the cargo
//     (Hull C) the tile says so instead of repeating the number.
// Refuel cargo, personal grid, lockers and the detail list measure other things
// and are shown as before.

import { CargoTile } from '../../components/ModularCargo'
import { maxCargo } from '../../lib/moduleCargo'

const TYPE_LABELS = {
  internal_grid: 'Interior Grid',
  external_pod: 'External Pod',
  fuel_cargo: 'Refuel Cargo',
  personal_locker: 'Personal Locker',
  suit_locker: 'Suit Locker',
  weapon_rack: 'Weapon Rack',
}

const TYPE_ORDER = [
  'internal_grid',
  'external_pod',
  'fuel_cargo',
  'personal_locker',
  'suit_locker',
  'weapon_rack',
]

function fmtScu(n) {
  if (n == null || n === 0) return null
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} SCU`
}

function fmtMicroScu(n) {
  if (n == null || n === 0) return null
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} µSCU`
}

function SummaryTile({ label, value, accent }) {
  if (value == null || value === 0 || value === '') return null
  return (
    <div className="panel">
      <div className="p-3">
        <div className="text-xs font-mono text-gray-500 uppercase tracking-wider">{label}</div>
        <div className={`text-lg font-mono mt-1 ${accent || 'text-white'}`}>{value}</div>
      </div>
    </div>
  )
}

function DetailRow({ row }) {
  const capacity = row.scu_capacity != null
    ? fmtScu(row.scu_capacity)
    : fmtMicroScu(row.microscu_capacity)
  const count = row.count > 1 ? ` × ${row.count}` : ''
  const total = row.scu_capacity != null && row.count > 1
    ? ` = ${fmtScu(row.scu_capacity * row.count)}`
    : ''
  const label = TYPE_LABELS[row.storage_type] || row.storage_type
  const location = row.location_label || row.container_class_name || ''
  return (
    <li className="flex items-baseline justify-between gap-3 py-1 text-xs font-mono">
      <span className="text-gray-400">
        <span className="text-white">{label}</span>
        {location ? <span className="text-gray-500"> · {location}</span> : null}
      </span>
      <span className="text-gray-300 whitespace-nowrap">
        {capacity ?? '—'}{count}{total}
      </span>
    </li>
  )
}

function externalPodsValue(external, liveCargo) {
  if (liveCargo === undefined) return fmtScu(external)
  if (!(external > 0) || !(external <= liveCargo)) return null
  return external === liveCargo ? 'All cargo' : fmtScu(external)
}

/** Summary tiles that have something to show. `liveCargo` — see the file header. */
function summaryTiles(summary, liveCargo) {
  if (!summary) return []
  return [
    { label: 'Interior Cargo', value: liveCargo === undefined ? fmtScu(summary.internal_cargo_scu) : null },
    { label: 'External Pods', value: externalPodsValue(summary.external_cargo_scu, liveCargo), accent: 'text-emerald-400' },
    { label: 'Refuel Cargo', value: fmtScu(summary.fuel_cargo_scu), accent: 'text-sky-400' },
    { label: 'Personal Grid', value: fmtMicroScu(summary.personal_grid_microscu) },
    { label: 'Suit Lockers', value: summary.locker_count > 0 ? String(summary.locker_count) : null },
  ].filter(t => t.value != null)
}

const hasDetailRows = (storage) => Array.isArray(storage) && storage.length > 0

/**
 * Ship overview "Storage" panel: the live cargo figure (with the ceiling its
 * modules reach) followed by whatever StorageBreakdown still has to add.
 * Renders nothing at all — no header — when there is nothing to show.
 */
export function StoragePanel({ ship, modules }) {
  const hasCargo = maxCargo(ship.cargo, modules) != null
  const liveCargo = ship.cargo ?? null
  const hasBreakdown = summaryTiles(ship, liveCargo).length > 0 || hasDetailRows(ship.storage)
  if (!hasCargo && !hasBreakdown) return null
  return (
    <div className="panel">
      <div className="panel-header">Storage</div>
      <div className="p-4 space-y-4">
        {hasCargo && <CargoTile hull={ship.cargo} modules={modules} />}
        <StorageBreakdown storage={ship.storage} summary={ship} liveCargo={liveCargo} />
      </div>
    </div>
  )
}

export default function StorageBreakdown({ storage, summary, liveCargo }) {
  const tiles = summaryTiles(summary, liveCargo)
  const hasSummary = tiles.length > 0
  const hasDetail = hasDetailRows(storage)
  if (!hasSummary && !hasDetail) return null

  const sortedStorage = hasDetail
    ? [...storage].sort((a, b) => {
        const ai = TYPE_ORDER.indexOf(a.storage_type)
        const bi = TYPE_ORDER.indexOf(b.storage_type)
        if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
        return (b.scu_capacity || 0) - (a.scu_capacity || 0)
      })
    : []

  return (
    <div className="space-y-3">
      {hasSummary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {tiles.map(t => <SummaryTile key={t.label} label={t.label} value={t.value} accent={t.accent} />)}
        </div>
      )}
      {hasDetail && (
        <details className="panel">
          <summary className="px-3 py-2 cursor-pointer text-xs font-mono text-gray-400 uppercase tracking-wider hover:text-white">
            Storage detail ({sortedStorage.length})
          </summary>
          <ul className="px-3 pb-3 space-y-1">
            {sortedStorage.map((row) => <DetailRow key={row.id ?? `${row.storage_type}-${row.container_class_name}-${row.location_label}`} row={row} />)}
          </ul>
        </details>
      )}
    </div>
  )
}
