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

/**
 * Module slots for a ship. Read-only on the Ship DB (no onSelect); interactive
 * in the loadout planner when `onSelect` is provided — clicking an option
 * installs it. `selections` maps port_name → chosen module uuid; the effective
 * installed module per port is the selection, else the ship's default module.
 */
export default function ModulesSection({ modules, ownedTitles, selections, onSelect }) {
  const [collapsed, setCollapsed] = useState(false)
  const editable = typeof onSelect === 'function'

  if (!modules?.length) return null

  // Group by port, de-duped by uuid.
  const seen = new Set()
  const byPort = new Map()
  for (const m of modules) {
    if (m.uuid && seen.has(m.uuid)) continue
    if (m.uuid) seen.add(m.uuid)
    const port = m.port_name || 'Default'
    if (!byPort.has(port)) byPort.set(port, [])
    byPort.get(port).push(m)
  }

  // Effective installed uuid per port: the user's selection, else the default.
  const installedByPort = {}
  for (const [port, list] of byPort.entries()) {
    const chosen = selections?.[port]
    const def = list.find(m => m.is_default)
    installedByPort[port] = chosen || def?.uuid || null
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
        {editable && <span className="text-[10px] text-gray-600 ml-auto">Click to install</span>}
      </div>

      {!collapsed && (
        <div className="divide-y divide-white/[0.04]">
          {[...byPort.entries()].map(([portName, portModules]) => {
            const installedUuid = installedByPort[portName]
            return (
              <div key={portName} className="px-3 py-2">
                <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5 font-hud">
                  {formatPortName(portName)}
                </div>
                <div className="space-y-1">
                  {portModules.map(m => {
                    const owned = isModuleOwned(m.display_name, ownedTitles)
                    const installed = editable && m.uuid && m.uuid === installedUuid
                    const Row = editable ? 'button' : 'div'
                    return (
                      <Row
                        key={m.id ?? m.uuid}
                        {...(editable ? { onClick: () => onSelect(portName, m), type: 'button' } : {})}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-sm text-left transition-colors
                          ${installed
                            ? 'bg-sc-accent/10 border border-sc-accent/40'
                            : m.is_default
                              ? 'bg-white/[0.03] border border-white/[0.08]'
                              : 'bg-white/[0.01] border border-transparent'}
                          ${editable ? 'hover:bg-white/[0.06] cursor-pointer' : ''}
                          ${owned && !installed ? 'border-purple-500/30' : ''}`}
                      >
                        {m.size != null && (
                          <span className="text-[10px] font-mono font-bold text-gray-500 bg-white/[0.05] px-1.5 py-0.5 rounded">
                            S{m.size}
                          </span>
                        )}
                        <span className={`flex-1 ${installed || m.is_default ? 'text-gray-200' : 'text-gray-400'}`}>
                          {m.display_name}
                        </span>
                        {m.price != null ? (
                          <span className="text-[11px] text-amber-300 flex-shrink-0 tabular-nums">
                            {Math.round(m.price).toLocaleString()} aUEC
                          </span>
                        ) : (
                          <span className="text-[11px] text-gray-600 flex-shrink-0">—</span>
                        )}
                        {installed && (
                          <span className="text-[9px] text-sc-accent uppercase tracking-wider font-semibold flex items-center gap-0.5">
                            <Check className="w-3 h-3" /> Installed
                          </span>
                        )}
                        {!!m.is_default && !installed && (
                          <span className="text-[9px] text-amber-400/70 uppercase tracking-wider font-semibold">Default</span>
                        )}
                        {owned && !installed && (
                          <span className="flex items-center gap-0.5 text-[9px] text-purple-400 uppercase tracking-wider font-semibold">
                            <Check className="w-3 h-3" /> Owned
                          </span>
                        )}
                      </Row>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
