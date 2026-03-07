import { Link } from 'react-router-dom'
import { getLocationGroup } from '../../lib/lootLocations'
import { resolveLocationEntry } from './lootHelpers'

const LOCATION_GROUP_CONFIG = {
  named:     { label: 'Named Locations', order: 0 },
  cave:      { label: 'Caves',           order: 1 },
  outpost:   { label: 'Outposts',        order: 2 },
  dc:        { label: 'Distribution Centres', order: 3 },
  facility:  { label: 'Facilities',      order: 4 },
  contested: { label: 'Contested Zones', order: 5 },
  station:   { label: 'Stations',        order: 6 },
  derelict:  { label: 'Derelicts',       order: 7 },
  generic:   { label: 'Generic',         order: 8 },
}

function LocationRow({ row, linkTo }) {
  const labelContent = linkTo ? (
    <Link to={linkTo} className="text-xs font-mono text-sc-accent hover:text-sc-accent/80 break-words min-w-0 transition-colors">
      {row.label}
    </Link>
  ) : (
    <span className="text-xs font-mono text-gray-300 break-words min-w-0">{row.label}</span>
  )

  return (
    <div className="flex items-center justify-between gap-2 pl-2 border-l border-sc-border">
      {labelContent}
      <div className="flex items-center gap-1.5 shrink-0">
        {row.detail && (
          <span className="text-[9px] font-mono text-gray-500">{row.detail}</span>
        )}
        {row.probability != null && (
          <span className="text-[9px] font-mono text-gray-600">{(row.probability * 100).toFixed(1)}%</span>
        )}
      </div>
    </div>
  )
}

export default function LocationSection({ label, icon: Icon, data, type }) {
  if (!data || !Array.isArray(data) || data.length === 0) return null

  // Deduplicate: npcs/corpses key by faction+slot; others by label
  const seen = new Map()
  for (const entry of data) {
    const row = resolveLocationEntry(entry, type)
    const key = (type === 'npcs' || type === 'corpses')
      ? `${row.label}|${row.detail || ''}`
      : row.label
    const existing = seen.get(key)
    if (!existing) {
      seen.set(key, row)
    } else if (row.probability != null && (existing.probability == null || row.probability > existing.probability)) {
      existing.probability = row.probability
    }
  }

  const rows = [...seen.values()]

  // Grouped rendering for containers
  if (type === 'containers') {
    // Bucket rows by group
    const buckets = new Map()
    for (const row of rows) {
      const groupKey = getLocationGroup(row.rawKey)
      if (!buckets.has(groupKey)) buckets.set(groupKey, [])
      buckets.get(groupKey).push(row)
    }

    // Sort groups by config order; sort rows within each group alphabetically
    const sortedGroups = [...buckets.entries()].sort(([a], [b]) => {
      const ao = LOCATION_GROUP_CONFIG[a]?.order ?? 99
      const bo = LOCATION_GROUP_CONFIG[b]?.order ?? 99
      return ao - bo
    })
    for (const [, groupRows] of sortedGroups) {
      groupRows.sort((a, b) => a.label.localeCompare(b.label))
    }

    return (
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Icon className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-[10px] font-display uppercase tracking-wider text-gray-400">{label}</span>
        </div>
        <div className="space-y-3">
          {sortedGroups.map(([groupKey, groupRows]) => (
            <div key={groupKey}>
              <p className="text-[9px] font-display uppercase tracking-wider text-gray-500 mb-1 pl-2">
                {LOCATION_GROUP_CONFIG[groupKey]?.label ?? groupKey}
              </p>
              <div className="space-y-1">
                {groupRows.map((row, i) => (
                  <LocationRow
                    key={i}
                    row={row}
                    linkTo={row.rawKey ? `/poi/${encodeURIComponent(row.rawKey)}` : undefined}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Grouped rendering for npcs / corpses — group by faction
  if (type === 'npcs' || type === 'corpses') {
    const factionMap = new Map()
    for (const row of rows) {
      const key = row.faction || row.label
      if (!factionMap.has(key)) factionMap.set(key, [])
      factionMap.get(key).push(row)
    }
    const sortedFactions = [...factionMap.entries()].sort(([a], [b]) => a.localeCompare(b))

    return (
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Icon className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-[10px] font-display uppercase tracking-wider text-gray-400">{label}</span>
        </div>
        <div className="space-y-3">
          {sortedFactions.map(([factionName, factionRows]) => {
            const rawFactionKey = factionRows[0]?.rawKey
            return (
            <div key={factionName}>
              {rawFactionKey ? (
                <Link to={`/poi/npc/${encodeURIComponent(rawFactionKey)}`} className="text-[9px] font-display uppercase tracking-wider text-sc-accent hover:text-sc-accent/80 mb-1 pl-2 block transition-colors">
                  {factionName}
                </Link>
              ) : (
                <p className="text-[9px] font-display uppercase tracking-wider text-gray-500 mb-1 pl-2">
                  {factionName}
                </p>
              )}
              <div className="space-y-1">
                {factionRows.map((row, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 pl-2 border-l border-sc-border">
                    <span className="text-xs font-mono text-gray-300">{row.detail || '—'}</span>
                    {row.probability != null && (
                      <span className="text-[9px] font-mono text-gray-600">{(row.probability * 100).toFixed(1)}%</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Default flat rendering (shops, contracts)
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-[10px] font-display uppercase tracking-wider text-gray-400">{label}</span>
      </div>
      <div className="space-y-1">
        {rows.map((row, i) => (
          <LocationRow
            key={i}
            row={row}
            linkTo={
              row.shopKey && row.rawKey ? `/poi/shop/${encodeURIComponent(row.rawKey)}`
              : row.npcKey && row.rawKey ? `/poi/npc/${encodeURIComponent(row.rawKey)}`
              : row.contractKey && row.contractRef ? `/contracts?guild=${encodeURIComponent(row.contractRef)}`
              : row.contractKey ? '/contracts'
              : undefined
            }
          />
        ))}
      </div>
    </div>
  )
}
