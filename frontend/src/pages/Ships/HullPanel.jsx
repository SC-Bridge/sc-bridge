// Hull HP for the ship overview: the total over every structural part first,
// the hull (body) part beside it, then the per-part breakdown from the vehicle
// XML. Field meanings are in lib/hullHp.js.

import { useState } from 'react'
import { hullTotal, hullPartLabel, hullPartRows } from '../../lib/hullHp'

const COLLAPSED_ROWS = 12

function fmtHp(n) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

export default function HullPanel({ ship }) {
  const [showAll, setShowAll] = useState(false)
  const total = hullTotal(ship)
  if (total == null) return null

  const showBody = ship.hull_hp_total != null && ship.hull_hp != null
  const rows = hullPartRows(ship.hull_parts)
  const visible = showAll ? rows : rows.slice(0, COLLAPSED_ROWS)

  return (
    <div className="panel">
      <div className="panel-header">Hull</div>
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="panel">
            <div className="p-3">
              <div className="text-xs font-mono text-gray-500 uppercase tracking-wider">Total Hull HP</div>
              <div className="text-lg font-mono mt-1 text-amber-400" data-testid="hull-total">{fmtHp(total)}</div>
            </div>
          </div>
          {showBody && (
            <div className="panel">
              <div className="p-3">
                <div className="text-xs font-mono text-gray-500 uppercase tracking-wider">Body (destroys ship)</div>
                <div className="text-lg font-mono mt-1 text-white" data-testid="hull-body">{fmtHp(ship.hull_hp)}</div>
              </div>
            </div>
          )}
        </div>

        {rows.length > 0 && (
          <div>
            <div className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-2">Parts</div>
            <ul className="space-y-0">
              {visible.map((p, i) => (
                <li
                  key={`${p.name}-${i}`}
                  data-testid="hull-part"
                  data-depth={p.depth}
                  className="flex items-center justify-between py-1 border-b border-white/[0.04] text-sm"
                  style={{ paddingLeft: `${p.depth * 1}rem` }}
                >
                  <span className="text-gray-300">
                    {hullPartLabel(p.name, ship.class_name)}
                    {p.vital && (
                      <span className="ml-2 text-[11px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded border border-red-500/20">
                        Destroys ship
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-gray-400">{fmtHp(p.hp)}</span>
                </li>
              ))}
            </ul>
            {rows.length > COLLAPSED_ROWS && (
              <button
                type="button"
                className="mt-2 text-xs text-sky-400 hover:text-sky-300"
                onClick={() => setShowAll(v => !v)}
              >
                {showAll ? 'Show fewer' : `Show all ${rows.length} parts`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
