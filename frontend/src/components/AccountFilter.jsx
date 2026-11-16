import React from 'react'
import { accountName, accountColor } from '../lib/accounts'

// Same look as the Hangar page's FilterChip.
const BASE = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-display uppercase tracking-[0.05em] border transition-all cursor-pointer'
const ON = 'bg-sc-accent/15 text-sc-accent border-sc-accent/40'
const OFF = 'bg-white/[0.03] text-gray-400 border-white/10 hover:text-gray-200 hover:border-white/25'

function Chip({ checked, onClick, children }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onClick}
      className={`${BASE} ${checked ? ON : OFF}`}
    >
      {children}
    </button>
  )
}

/**
 * Multi-select chip bar: "All accounts" plus one checkbox chip per RSI account.
 * `filter` is the result of useAccountFilter; renders nothing unless it is active.
 */
export default function AccountFilter({ accounts, filter }) {
  if (!filter?.active || !accounts) return null
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by RSI account">
      <Chip checked={filter.isAll} onClick={filter.selectAll}>All accounts</Chip>
      {accounts.map((a, i) => (
        <Chip key={a.id} checked={filter.selectedIds.has(a.id)} onClick={() => filter.toggle(a.id)}>
          <span
            aria-hidden="true"
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: accountColor(a, i) }}
          />
          {accountName(a)}
        </Chip>
      ))}
    </div>
  )
}
