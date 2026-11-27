import { COMPARE_STATS } from './componentsConfig'
import RenderThumb from '../../components/RenderThumb'
import { fmtPct, fmtDec1, fmtInt } from '../Loadout/loadoutHelpers'

function formatValue(val, stat) {
  if (val == null) return '\u2014'
  if (stat.format === 'pct') return fmtPct(val)
  const n = typeof val === 'number' ? val : parseFloat(val)
  if (!isNaN(n)) {
    const formatted = n >= 1000 ? fmtInt(n) : n % 1 === 0 ? String(n) : fmtDec1(n)
    return formatted + (stat.suffix || '')
  }
  return String(val)
}

function getWinner(values, stat) {
  const nums = values.map(v => {
    if (v == null) return null
    const n = typeof v === 'number' ? v : parseFloat(v)
    return isNaN(n) ? null : n
  })
  const valid = nums.filter(n => n !== null)
  if (valid.length < 2) return null
  if (stat.higher) {
    const max = Math.max(...valid)
    if (valid.every(n => n === max)) return null
    return nums.indexOf(max)
  }
  if (stat.lower) {
    const min = Math.min(...valid)
    if (valid.every(n => n === min)) return null
    return nums.indexOf(min)
  }
  return null
}

export default function CompareTable({ items, apiType }) {
  if (!items || items.length < 2) return null

  const stats = COMPARE_STATS[apiType] || []
  const activeStats = stats.filter(s => items.some(i => i[s.key] != null))

  return (
    <div className="space-y-3">
      {/* Item headers */}
      <div className="grid gap-3" style={{ gridTemplateColumns: `8rem repeat(${items.length}, 1fr)` }}>
        <div />
        {items.map(item => (
          <div key={item.id} className="panel p-3 text-center">
            <RenderThumb
              render={item.render}
              kind={item.render_variants_kind}
              itemKey={item.render_item_key}
              title={item.name}
              aspectRatio="square"
              className="mb-2 rounded"
            />
            <p className="text-sm font-medium text-white truncate">{item.name}</p>
            {item.manufacturer_name && (
              <p className="text-xs font-mono text-gray-400 mt-0.5 truncate">{item.manufacturer_name}</p>
            )}
            {item.size != null && (
              <span className="inline-block text-xs font-mono text-sc-accent2 bg-sc-accent2/15 px-1.5 py-0.5 rounded border border-sc-accent2/25 mt-1">
                S{item.size}
              </span>
            )}
          </div>
        ))}
      </div>

      {activeStats.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">No comparable stats</p>
      ) : (
        <div className="panel overflow-hidden divide-y divide-sc-border/50">
          {activeStats.map(stat => {
            const values = items.map(i => i[stat.key])
            const winner = getWinner(values, stat)
            return (
              <div
                key={stat.key}
                className="grid items-center gap-3 px-4 py-2.5"
                style={{ gridTemplateColumns: `8rem repeat(${items.length}, 1fr)` }}
              >
                <span className="text-xs font-mono text-sc-accent2 truncate">{stat.label}</span>
                {values.map((val, idx) => (
                  <span
                    key={idx}
                    className={`text-sm font-mono text-center ${
                      winner === idx
                        ? 'text-sc-accent font-semibold'
                        : val == null ? 'text-gray-600' : 'text-gray-200'
                    }`}
                    style={winner === idx ? { textShadow: '0 0 8px rgba(34, 211, 238, 0.4)' } : undefined}
                  >
                    {formatValue(val, stat)}
                  </span>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
