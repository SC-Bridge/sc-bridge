import ResistanceBar from './ResistanceBar'
import { getStatConfig } from './CategoryStatConfig'
import { formatMicroScu } from '../../lib/lootDisplay'

function formatStatValue(value, format, suffix = '') {
  if (value == null) return null
  if (format === 'number') {
    const n = typeof value === 'string' ? parseFloat(value) : value
    if (isNaN(n)) return null
    return (n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n % 1 === 0 ? n : n.toFixed(1)) + suffix
  }
  if (format === 'zoom') {
    const n = parseFloat(value)
    if (isNaN(n) || n <= 0) return null
    return n.toFixed(1) + 'x' + suffix
  }
  if (format === 'multiplier') {
    const n = parseFloat(value)
    if (isNaN(n) || n === 1) return null
    return (n < 1 ? '-' : '+') + Math.round(Math.abs(1 - n) * 100) + '%'
  }
  if (format === 'badge') return value
  if (format === 'microscu') return formatMicroScu(value)
  return String(value) + suffix
}

function SizeBadge({ size }) {
  if (size == null) return null
  return (
    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-sc-accent2/30 bg-sc-accent2/10 text-sc-accent2">
      S{size}
    </span>
  )
}

function GradeBadge({ grade }) {
  if (!grade) return null
  return (
    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-400">
      {grade}
    </span>
  )
}

export default function ItemCardStats({ item, category }) {
  const config = getStatConfig(category)

  // Resistance bars for armour/helmets
  if (config.resistanceBars) {
    const keys = config.resistanceKeys || ['resist_physical', 'resist_energy', 'resist_distortion']
    const hasAny = keys.some(k => item[k] != null)
    if (!hasAny) return null
    return (
      <div className="space-y-0.5 mt-1">
        {keys.map(k => <ResistanceBar key={k} statKey={k} value={item[k]} />)}
      </div>
    )
  }

  const parts = []

  // Size/Grade badges for ship components
  if (config.badges) {
    const badges = []
    if (config.badges.includes('comp_size') && item.comp_size != null) badges.push(<SizeBadge key="sz" size={item.comp_size} />)
    if (config.badges.includes('comp_grade') && item.comp_grade) badges.push(<GradeBadge key="gr" grade={item.comp_grade} />)
    if (badges.length > 0) parts.push(<div key="badges" className="flex items-center gap-1">{badges}</div>)
  }

  // Sub-type specific primary stat for ship components
  if (config.subTypeConfigs && item.type) {
    const sub = config.subTypeConfigs[item.type]
    if (sub && item[sub.key] != null) {
      const val = typeof item[sub.key] === 'number' ? item[sub.key] : parseFloat(item[sub.key])
      if (!isNaN(val)) {
        parts.push(
          <div key="primary" className="flex items-center gap-1">
            <span className={`text-sm font-display font-bold ${sub.color}`}>
              {val >= 1000 ? val.toLocaleString(undefined, { maximumFractionDigits: 0 }) : val % 1 === 0 ? val : val.toFixed(1)}
            </span>
            <span className="text-[9px] font-mono text-gray-500">{sub.label}</span>
          </div>
        )
      }
    }
  }

  // Generic card stats
  if (config.cardStats) {
    const statParts = []
    for (const stat of config.cardStats) {
      const raw = item[stat.key]
      if (raw == null) continue
      if (stat.showWhenNonNull && raw == null) continue
      const formatted = formatStatValue(raw, stat.format, stat.suffix || '')
      if (!formatted) continue

      if (stat.format === 'badge') {
        statParts.push(
          <span key={stat.key} className="text-[9px] font-mono text-gray-400 bg-gray-800/60 px-1.5 py-0.5 rounded">
            {formatted}
          </span>
        )
      } else {
        statParts.push(
          <span key={stat.key} className="flex items-center gap-0.5">
            <span className={`text-sm font-display font-bold ${stat.color || 'text-white'}`}>{formatted}</span>
            {stat.label && <span className="text-[9px] font-mono text-gray-500">{stat.label}</span>}
          </span>
        )
      }
    }
    if (statParts.length > 0) parts.push(<div key="stats" className="flex items-center gap-2 flex-wrap">{statParts}</div>)
  }

  // Secondary stats
  if (config.secondaryStats) {
    const secParts = []
    for (const stat of config.secondaryStats) {
      const raw = item[stat.key]
      if (raw == null) continue
      const val = typeof raw === 'number' ? raw : parseFloat(raw)
      if (isNaN(val)) continue
      secParts.push(
        <span key={stat.key} className="text-[9px] font-mono text-gray-500">
          {stat.label}: <span className="text-gray-300">{val % 1 === 0 ? val : val.toFixed(1)}{stat.suffix || ''}</span>
        </span>
      )
    }
    if (secParts.length > 0) parts.push(<div key="sec" className="flex items-center gap-2 flex-wrap">{secParts}</div>)
  }

  if (parts.length === 0) return null
  return <div className="space-y-1 mt-1">{parts}</div>
}
