// Storage summary for the ship overview.
//
// `vehicles.cargo` is the maintained cargo figure, so StoragePanel leads with
// it (and the ceiling the ship's modules reach) and passes it down as
// `liveCargo`. The summary tiles add what the cargo figure does not say:
//   - External Pods is a split of the cargo figure, shown only when it fits
//     inside it (0 < external <= cargo). When the pods are all of the cargo
//     (Hull C) the tile says so instead of repeating the number.
//   - Refuel cargo, personal grid and suit lockers measure other things.
// There is no interior-cargo tile (it was the same quantity as the cargo
// figure) and no per-feature detail list: both were retired with migration
// 0282.

import { CargoTile } from '../../components/ModularCargo'
import { maxCargo } from '../../lib/moduleCargo'

function fmtScu(n) {
  if (n == null || n === 0) return null
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} SCU`
}

function fmtMicroScu(n) {
  if (n == null || n === 0) return null
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} µSCU`
}

function SummaryTile({ label, value, accent }) {
  return (
    <div className="panel">
      <div className="p-3">
        <div className="text-xs font-mono text-gray-500 uppercase tracking-wider">{label}</div>
        <div className={`text-lg font-mono mt-1 ${accent || 'text-white'}`}>{value}</div>
      </div>
    </div>
  )
}

function externalPodsValue(external, liveCargo) {
  if (!(external > 0) || !(external <= liveCargo)) return null
  return external === liveCargo ? 'All cargo' : fmtScu(external)
}

/** Summary tiles that have something to show. `liveCargo` — see the file header. */
function summaryTiles(summary, liveCargo) {
  if (!summary) return []
  return [
    { label: 'External Pods', value: externalPodsValue(summary.external_cargo_scu, liveCargo), accent: 'text-emerald-400' },
    { label: 'Refuel Cargo', value: fmtScu(summary.fuel_cargo_scu), accent: 'text-sky-400' },
    { label: 'Personal Grid', value: fmtMicroScu(summary.personal_grid_microscu) },
    { label: 'Suit Lockers', value: summary.locker_count > 0 ? String(summary.locker_count) : null },
  ].filter(t => t.value != null)
}

/**
 * Ship overview "Storage" panel: the live cargo figure (with the ceiling its
 * modules reach) followed by whatever StorageBreakdown still has to add.
 * Renders nothing at all — no header — when there is nothing to show.
 */
export function StoragePanel({ ship, modules }) {
  const hasCargo = maxCargo(ship.cargo, modules) != null
  const liveCargo = ship.cargo ?? null
  if (!hasCargo && summaryTiles(ship, liveCargo).length === 0) return null
  return (
    <div className="panel">
      <div className="panel-header">Storage</div>
      <div className="p-4 space-y-4">
        {hasCargo && <CargoTile hull={ship.cargo} modules={modules} />}
        <StorageBreakdown summary={ship} liveCargo={liveCargo} />
      </div>
    </div>
  )
}

export default function StorageBreakdown({ summary, liveCargo }) {
  const tiles = summaryTiles(summary, liveCargo)
  if (tiles.length === 0) return null
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {tiles.map(t => <SummaryTile key={t.label} label={t.label} value={t.value} accent={t.accent} />)}
    </div>
  )
}
