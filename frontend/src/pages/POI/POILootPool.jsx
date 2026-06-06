import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Package } from 'lucide-react'
import SearchInput from '../../components/SearchInput'
import {
  RARITY_STYLES, RARITY_ORDER, CATEGORY_LABELS, CATEGORY_BADGE_STYLES, CATEGORY_ORDER,
  humanizeRawDisplayName,
} from '../../lib/lootDisplay'

function pct(n) {
  if (n == null || Number.isNaN(n)) return '—'
  const v = n * 100
  if (v >= 10) return `${v.toFixed(0)}%`
  if (v >= 1) return `${v.toFixed(1)}%`
  return `${v.toFixed(2)}%`
}

/**
 * Loot pools at this POI. Key framing improvement over the old design: we
 * say "items drop from the LootTable.X pool with N rolls per container" so
 * the probabilities are interpretable. Previously the page said "N items
 * available" with no context, making the "Rare 0.9%" label meaningless.
 */
export default function POILootPool({ envelope }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [rarity, setRarity] = useState('all')

  const pools = envelope.data || []

  // Merge + filter items across pools for the current category/rarity/search so
  // the filter chips operate over everything visible on screen at once.
  const { visiblePools, categoryCounts, rarityCounts } = useMemo(() => {
    const q = query.trim().toLowerCase()
    const counts = { all: 0 }
    const rCounts = {}
    const out = pools.map(pool => {
      const filtered = pool.items.filter(item => {
        counts.all++
        counts[item.category] = (counts[item.category] || 0) + 1
        if (item.rarity) rCounts[item.rarity] = (rCounts[item.rarity] || 0) + 1
        if (category !== 'all' && item.category !== category) return false
        if (rarity !== 'all' && item.rarity !== rarity) return false
        if (q && !item.name.toLowerCase().includes(q)) return false
        return true
      })
      return { ...pool, filteredItems: filtered }
    })
    return { visiblePools: out, categoryCounts: counts, rarityCounts: rCounts }
  }, [pools, query, category, rarity])

  if (envelope.partial && envelope.count === 0) {
    return (
      <section>
        <h2 className="text-sm font-display uppercase tracking-widest text-gray-400 mb-3">Loot from containers</h2>
        <p className="text-xs text-gray-500">{envelope.note || 'Temporarily unavailable.'}</p>
      </section>
    )
  }
  if (envelope.count === 0) {
    return null // no loot pool → skip section entirely (not every POI has loot)
  }

  const totalItems = pools.reduce((sum, p) => sum + p.items.length, 0)
  const orderedCats = ['all', ...CATEGORY_ORDER.filter(c => categoryCounts[c] > 0)]
  const presentRarities = RARITY_ORDER.filter(r => rarityCounts[r] > 0)

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-display uppercase tracking-widest text-gray-400">
          Loot from containers ({envelope.count} pool{envelope.count !== 1 ? 's' : ''})
        </h2>
        <span className="text-xs text-gray-500 font-mono">{totalItems.toLocaleString()} possible drops</span>
      </div>

      <div className="flex gap-3 items-center flex-wrap">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search items in this pool..."
          className="flex-1 max-w-sm"
        />
        <div className="flex gap-1.5 flex-wrap">
          {orderedCats.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-2.5 py-1 text-[10px] font-display uppercase tracking-wide rounded border transition-colors ${
                category === cat
                  ? 'text-sc-accent border-sc-accent/40 bg-sc-accent/10'
                  : 'text-gray-500 border-sc-border hover:text-gray-300'
              }`}
            >
              {cat === 'all' ? `All (${categoryCounts.all || 0})` : `${CATEGORY_LABELS[cat] || cat} (${categoryCounts[cat] || 0})`}
            </button>
          ))}
        </div>
      </div>

      {/* Rarity / quality filter (#95) — only shown when items carry rarity */}
      {presentRarities.length > 0 && (
        <div className="flex gap-1.5 flex-wrap items-center">
          <span className="text-[10px] font-display uppercase tracking-wider text-gray-600 mr-1">Quality</span>
          <button
            onClick={() => setRarity('all')}
            className={`px-2.5 py-1 text-[10px] font-display uppercase tracking-wide rounded border transition-colors ${
              rarity === 'all'
                ? 'text-sc-accent border-sc-accent/40 bg-sc-accent/10'
                : 'text-gray-500 border-sc-border hover:text-gray-300'
            }`}
          >
            All ({categoryCounts.all || 0})
          </button>
          {presentRarities.map(r => {
            const rs = RARITY_STYLES[r]
            const active = rarity === r
            return (
              <button
                key={r}
                onClick={() => setRarity(active ? 'all' : r)}
                className={`px-2.5 py-1 text-[10px] font-mono rounded border transition-colors ${
                  active ? rs.badge : 'text-gray-500 border-sc-border hover:text-gray-300'
                }`}
              >
                {r} ({rarityCounts[r]})
              </button>
            )
          })}
        </div>
      )}

      {visiblePools.map(pool => {
        if (pool.filteredItems.length === 0) return null
        return (
          <div key={`${pool.loot_table}:${pool.container_type}`} className="space-y-2">
            <header className="flex items-baseline gap-2 text-xs">
              <Package className="w-3.5 h-3.5 text-gray-500" />
              <span className="font-display uppercase tracking-wider text-gray-400">
                {pool.container_type || 'Container'}
              </span>
              <span className="text-gray-600 font-mono">·</span>
              <span className="text-gray-500 font-mono">{pool.rolls} roll{pool.rolls !== 1 ? 's' : ''}/container</span>
              <span className="text-gray-600 font-mono">·</span>
              <span className="text-gray-600 font-mono text-[10px]">{pool.loot_table}</span>
            </header>
            <div className="border border-sc-border rounded overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] font-display uppercase tracking-wide text-gray-500 border-b border-sc-border">
                    <th className="text-left px-3 py-2">Item</th>
                    <th className="text-left px-3 py-2 w-24">Category</th>
                    <th className="text-right px-3 py-2 w-20" title="Probability per roll">Per roll</th>
                    <th className="text-right px-3 py-2 w-28" title={`Probability at least one of ${pool.rolls} rolls returns this item`}>Per container</th>
                  </tr>
                </thead>
                <tbody>
                  {pool.filteredItems.map((item, i) => {
                    const catStyle = CATEGORY_BADGE_STYLES[item.category] || 'bg-gray-500/10 text-gray-400 border-gray-500/30'
                    const rs = RARITY_STYLES[item.rarity] || null
                    return (
                      <tr key={item.uuid || i} className="border-b border-sc-border/50 last:border-0 hover:bg-white/3">
                        <td className="px-3 py-1.5">
                          <Link to={`/loot/${item.uuid}`} className="text-gray-200 hover:text-sc-accent transition-colors">
                            {humanizeRawDisplayName(item.name)}
                          </Link>
                          {item.rarity && item.rarity !== 'N/A' && rs && (
                            <span className={`ml-2 text-[9px] font-mono px-1.5 py-0.5 rounded border ${rs.badge}`}>
                              {item.rarity}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1.5">
                          {item.category && (
                            <span className={`text-[9px] font-display uppercase tracking-wide px-1.5 py-0.5 rounded border ${catStyle}`}>
                              {CATEGORY_LABELS[item.category] || item.category}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-gray-400">{pct(item.per_roll)}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-gray-300">{pct(item.per_container_odds)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}

      <p className="text-[10px] text-gray-600">
        <strong className="text-gray-500">How this works:</strong> each container at this POI rolls a fixed number
        of times against the pool above. "Per roll" is the chance any single roll returns that item;
        "per container" is the chance at least one of those rolls does (1 − (1 − p)<sup>n</sup>).
      </p>
    </section>
  )
}
