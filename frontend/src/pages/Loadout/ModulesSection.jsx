import React, { useState } from 'react'
import { ChevronDown, ChevronRight, Package, Check } from 'lucide-react'

function formatPortName(raw) {
  return raw
    .replace(/^hardpoint_/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function isModuleOwned(displayName, ownedTitles) {
  if (!ownedTitles?.length || !displayName) return false
  const lower = displayName.toLowerCase()
  return ownedTitles.some(t => {
    const tl = t.toLowerCase()
    return tl.includes(lower) || lower.includes(tl)
  })
}

export default function ModulesSection({ modules, ownedTitles }) {
  const [collapsed, setCollapsed] = useState(false)

  if (!modules?.length) return null

  // Deduplicate by display_name+port_name, then group by port_name
  const seen = new Set()
  const byPort = new Map()
  for (const m of modules) {
    const dedup = `${m.port_name}:${m.display_name}`
    if (seen.has(dedup)) continue
    seen.add(dedup)
    const port = m.port_name || 'Default'
    if (!byPort.has(port)) byPort.set(port, [])
    byPort.get(port).push(m)
  }

  const portCount = byPort.size
  const portLabel = portCount === 1 ? '1 slot' : `${portCount} slots`

  return (
    <div className="bg-white/[0.02] border border-white/[0.05] rounded-lg overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2 bg-white/[0.02] border-b border-white/[0.06]">
        <button
          onClick={() => setCollapsed(c => !c)}
          className="flex items-center gap-1.5 text-gray-400 hover:text-gray-200 transition-colors cursor-pointer"
        >
          {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          <Package className="w-4 h-4 text-purple-400" />
          <span className="text-[12px] font-semibold uppercase tracking-wider font-hud">Modules</span>
        </button>
        <span className="text-[11px] text-gray-600">{portLabel}</span>
      </div>

      {!collapsed && (
        <div className="divide-y divide-white/[0.04]">
          {[...byPort.entries()].map(([portName, portModules]) => (
            <div key={portName} className="px-3 py-2">
              <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5 font-hud">
                {formatPortName(portName)}
              </div>
              <div className="space-y-1">
                {portModules.map(m => {
                  const owned = isModuleOwned(m.display_name, ownedTitles)
                  return (
                    <div
                      key={m.id}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-sm
                        ${m.is_default
                          ? 'bg-white/[0.03] border border-white/[0.08]'
                          : 'bg-white/[0.01] border border-transparent'
                        }
                        ${owned ? 'border-purple-500/30' : ''}`}
                    >
                      {m.size != null && (
                        <span className="text-[10px] font-mono font-bold text-gray-500 bg-white/[0.05] px-1.5 py-0.5 rounded">
                          S{m.size}
                        </span>
                      )}
                      <span className={`flex-1 ${m.is_default ? 'text-gray-200' : 'text-gray-400'}`}>
                        {m.display_name}
                      </span>
                      {m.price != null ? (
                        <span className="text-[11px] text-amber-300 flex-shrink-0 tabular-nums">
                          {Math.round(m.price).toLocaleString()} aUEC
                        </span>
                      ) : (
                        <span className="text-[11px] text-gray-600 flex-shrink-0">—</span>
                      )}
                      {!!m.is_default && (
                        <span className="text-[9px] text-amber-400/70 uppercase tracking-wider font-semibold">Default</span>
                      )}
                      {owned && (
                        <span className="flex items-center gap-0.5 text-[9px] text-purple-400 uppercase tracking-wider font-semibold">
                          <Check className="w-3 h-3" /> Owned
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
