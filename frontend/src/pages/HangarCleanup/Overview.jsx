import React from 'react'
import { usd, CATEGORIES } from '../../lib/hangarCleanup'
import { MoneyInput } from './ui'

function Stat({ label, children, tone = 'text-white', sub }) {
  return (
    <div className="stat-card min-w-0">
      <span className="stat-label text-xs">{label}</span>
      <span className={`text-xl font-display tabular-nums ${tone}`}>{children}</span>
      {sub && <span className="text-[11px] font-mono text-gray-500">{sub}</span>}
    </div>
  )
}

/** Money at the top of the page: what's meltable, what's planned, and what's left. */
const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

export function Totals({ totals, credit, creditIsOverride, onCredit, readOnlyCredit }) {
  const { meltableV, meltableN, suggestedV, suggestedN, plannedV, plannedN, rebuyV, rebuyN, buyV, buyN, after } = totals
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-3">
      <Stat label="Meltable" sub={count(meltableN, 'pledge')}>{usd(meltableV)}</Stat>
      <Stat label="Suggested melts" sub={count(suggestedN, 'pledge')}>{usd(suggestedV)}</Stat>
      <Stat label="Planned melts" tone="text-sc-melt" sub={count(plannedN, 'pledge')}>{usd(plannedV)}</Stat>
      <div className="stat-card min-w-0">
        <label htmlFor="hc-credit" className="stat-label text-xs">Store credit now</label>
        {readOnlyCredit
          ? <span className="text-xl font-display">{usd(credit)}</span>
          : <MoneyInput id="hc-credit" label="Current store credit" cents={credit} onCommit={onCredit} />}
        <span className="text-[11px] font-mono text-gray-500">{creditIsOverride ? 'your figure' : 'from your last sync'}</span>
      </div>
      <Stat label="IAE rebuys" sub={count(rebuyN, 'ship')}>{rebuyV ? `−${usd(rebuyV)}` : usd(0)}</Stat>
      <Stat label="IAE buy list" sub={count(buyN, 'ship')}>{buyV ? `−${usd(buyV)}` : usd(0)}</Stat>
      <Stat label="Credit after" tone={after < 0 ? 'text-sc-danger' : 'text-sc-success'} sub={after < 0 ? 'card needed' : 'left over'}>
        {after < 0 ? `−${usd(-after)}` : usd(after)}
      </Stat>
      <Stat label="Need insurance" sub="ships not LTI">{totals.insN}</Stat>
    </div>
  )
}

function Card({ title, count, children }) {
  return (
    <div className="panel p-4 space-y-2 min-w-0">
      <h3 className="flex justify-between gap-2 font-display text-sm uppercase tracking-wider text-gray-200">
        <span>{title}</span>
        <span className="font-mono text-xs text-gray-500">{count}</span>
      </h3>
      {children}
    </div>
  )
}

function Line({ label, value, onClick }) {
  return (
    <li className="flex justify-between gap-3 text-sm">
      {onClick
        ? <button type="button" onClick={onClick} className="text-left text-gray-300 hover:text-sc-accent truncate">{label}</button>
        : <span className="text-gray-300 truncate">{label}</span>}
      <span className="font-mono tabular-nums text-gray-400 shrink-0">{value}</span>
    </li>
  )
}

const TIER = [
  ['LTI', 'LTI', 'bg-sc-lti'],
  ['long', '60–120 mo', 'bg-sc-warn'],
  ['short', 'Under 60 mo', 'bg-sc-danger'],
  ['none', 'None', 'bg-gray-500'],
]

/** Four summary cards: insurance mix, LTI tokens, redundant pledges, meltable by type. */
export function Insights({ rows, tokens, onJump }) {
  const ships = rows.filter((r) => r.cat === 'Ship')
  const tiers = Object.fromEntries(TIER.map(([k]) => [k, ships.filter((r) => r.ins.tier === k).length]))
  const nonLti = ships.filter((r) => r.ins.tier !== 'LTI').sort((a, b) => b.value - a.value)
  const redundant = rows.filter((r) => r.suggestion.action === 'melt').sort((a, b) => b.value - a.value)
  const byCat = CATEGORIES.map((c) => {
    const g = rows.filter((r) => r.cat === c && r.meltable && r.value > 0)
    return [c, g.length, g.reduce((a, r) => a + r.value, 0)]
  }).filter(([, n]) => n)
  const orphans = rows.filter((r) => r.flags.includes('ccu-orphan')).length

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
      <Card title="Ship insurance" count={`${ships.length} ships`}>
        <div className="flex h-2.5 rounded-full overflow-hidden bg-sc-border/30" role="img" aria-label={TIER.map(([k, l]) => `${l}: ${tiers[k]}`).join(', ')}>
          {TIER.map(([k, , c]) => tiers[k] ? <i key={k} className={c} style={{ width: `${(tiers[k] / (ships.length || 1)) * 100}%` }} /> : null)}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-mono text-gray-400">
          {TIER.map(([k, l, c]) => <span key={k}><i className={`inline-block w-2 h-2 rounded-sm mr-1 ${c}`} />{l} {tiers[k]}</span>)}
        </div>
        {nonLti.length
          ? <ul className="space-y-1">{nonLti.slice(0, 6).map((r) => <Line key={r.id} label={`${r.current} · ${r.ins.label}`} value={usd(r.value)} onClick={() => onJump(r.id)} />)}</ul>
          : <p className="text-sm text-gray-500">Every ship is LTI.</p>}
      </Card>
      <Card title="LTI tokens" count={tokens.length}>
        {tokens.length
          ? <>
              <ul className="space-y-1">{tokens.map((r) => <Line key={r.id} label={r.current} value={usd(r.value)} onClick={() => onJump(r.id)} />)}</ul>
              <p className="text-[11px] text-gray-500">Cheap un-upgraded LTI hulls (up to $60). Keep them as bases for CCU chains.</p>
            </>
          : <p className="text-sm text-gray-500">No cheap LTI hulls. Keep one before melting LTI ships.</p>}
      </Card>
      <Card title="Redundant" count={`${redundant.length} · ${usd(redundant.reduce((a, r) => a + r.value, 0))}`}>
        {redundant.length
          ? <>
              <ul className="space-y-1">{redundant.slice(0, 8).map((r) => <Line key={r.id} label={r.name.replace(/^(paints|gear|add-ons)\s*-\s*/i, '')} value={usd(r.value)} onClick={() => onJump(r.id)} />)}</ul>
              {redundant.length > 8 && <p className="text-[11px] text-gray-500">+{redundant.length - 8} more in the ledger.</p>}
            </>
          : <p className="text-sm text-gray-500">Nothing flagged.</p>}
      </Card>
      <Card title="Meltable by type" count={byCat.length}>
        <ul className="space-y-1">{byCat.map(([c, n, v]) => <Line key={c} label={`${c} · ${n}`} value={usd(v)} />)}</ul>
        {orphans > 0 && <p className="text-[11px] text-gray-500">{orphans} CCU{orphans > 1 ? 's' : ''} start from a ship you can’t reach.</p>}
      </Card>
    </div>
  )
}
