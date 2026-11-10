import React, { useMemo, useState } from 'react'
import SearchInput from '../../components/SearchInput'
import { usd, IAE_MONTHS } from '../../lib/hangarCleanup'
import { Pill, MoneyInput } from './ui'

/**
 * Every pledgeable ship with its RSI store price, to plan IAE purchases.
 * Ticked ships come off "Credit after" and appear in the step-by-step plan.
 */
export default function BuyList({ catalog, owned, buys, remelts, onToggle, onPrice, onRemelt }) {
  const [q, setQ] = useState('')
  const [maker, setMaker] = useState('')
  const [hideOwned, setHideOwned] = useState(false)
  const [listOnly, setListOnly] = useState(false)
  const [sort, setSort] = useState({ key: 'price', dir: -1 })

  const ships = useMemo(() => catalog.list.filter((s) => s.pledgeable && s.pledge_price_cents != null), [catalog])
  const makers = useMemo(() => [...new Set(ships.map((s) => s.maker).filter(Boolean))].sort(), [ships])
  const picked = Object.keys(buys)
  const priceOf = (s) => (buys[s.id] != null ? buys[s.id] : s.pledge_price_cents)
  const total = picked.reduce((a, id) => { const s = catalog.byId.get(Number(id)); return a + ((buys[id] ?? s?.pledge_price_cents) || 0) }, 0)
  const remeltCount = picked.filter((id) => remelts[id]).length

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const get = { price: (s) => s.pledge_price_cents ?? -1, auec: (s) => s.price_auec ?? -1, name: (s) => s.name.toLowerCase(), maker: (s) => s.maker, role: (s) => s.role }[sort.key]
    return ships
      .filter((s) => (!listOnly || s.id in buys) && (!hideOwned || !owned.has(s.id)) && (!maker || s.maker === maker))
      .filter((s) => !needle || `${s.name} ${s.maker} ${s.role}`.toLowerCase().includes(needle))
      .sort((a, b) => { const x = get(a), y = get(b); return (x > y ? 1 : x < y ? -1 : 0) * sort.dir || a.name.localeCompare(b.name) })
  }, [ships, q, maker, hideOwned, listOnly, buys, owned, sort])

  const head = (key, label, cls = '') => (
    <th className={`table-header cursor-pointer select-none whitespace-nowrap ${cls}`} onClick={() => setSort((s) => ({ key, dir: s.key === key ? -s.dir : (key === 'price' || key === 'auec' ? -1 : 1) }))} aria-sort={sort.key === key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
      {label}{sort.key === key && <span className="ml-1 opacity-60">{sort.dir > 0 ? '▲' : '▼'}</span>}
    </th>
  )

  return (
    <section className="space-y-3" aria-label="Buy at IAE">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-display text-lg uppercase tracking-wider text-white mr-auto">Buy at IAE</h3>
        <SearchInput value={q} onChange={setQ} placeholder="Search ship, maker, role…" className="w-full sm:w-64" />
        <select value={maker} onChange={(e) => setMaker(e.target.value)} aria-label="Manufacturer" className="bg-sc-darker border border-sc-border/60 rounded px-2 py-1.5 text-sm text-gray-200">
          <option value="">All makers</option>
          {makers.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer"><input type="checkbox" checked={hideOwned} onChange={(e) => setHideOwned(e.target.checked)} /> Hide ships I own</label>
        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer"><input type="checkbox" checked={listOnly} onChange={(e) => setListOnly(e.target.checked)} /> Buy list only</label>
      </div>
      <p className="text-sm text-gray-400">
        {picked.length
          ? <>Buy list: <span className="font-mono text-gray-100">{picked.length}</span> ship{picked.length > 1 ? 's' : ''}, <span className="font-mono text-gray-100">{usd(total)}</span>{remeltCount > 0 && `, ${remeltCount} to remelt for a buyback token`}</>
          : 'Tick ships to plan IAE purchases. Their cost comes off "Credit after".'}
      </p>
      <div className="panel overflow-x-auto max-h-[38rem] overflow-y-auto">
        <table className="w-full min-w-[900px]">
          <thead className="sticky top-0 bg-sc-panel z-10">
            <tr>
              <th className="table-header w-10">Buy</th>
              {head('name', 'Ship')}
              {head('maker', 'Maker')}
              {head('role', 'Role')}
              <th className="table-header whitespace-nowrap">After buying</th>
              {head('price', 'Expected price', 'text-right')}
              {head('auec', 'In-game (aUEC)', 'text-right')}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && <tr><td colSpan={7} className="table-cell text-gray-500 py-6">No ships match.</td></tr>}
            {visible.map((s) => {
              const isPicked = s.id in buys
              return (
                <tr key={s.id} className={isPicked ? 'bg-sc-melt/[0.06]' : 'hover:bg-white/[0.02]'}>
                  <td className="table-cell"><input type="checkbox" checked={isPicked} onChange={(e) => onToggle(s.id, e.target.checked)} aria-label={`Buy ${s.name}`} /></td>
                  <td className="table-cell">
                    <span className="font-display font-semibold text-white">{s.name}</span>
                    {owned.has(s.id) && <span className="ml-2"><Pill tone="info">Owned</Pill></span>}
                  </td>
                  <td className="table-cell text-xs text-gray-300">{s.maker}</td>
                  <td className="table-cell text-xs text-gray-300">{s.role || <span className="text-gray-600">—</span>}</td>
                  <td className="table-cell">
                    {isPicked && (
                      <select
                        value={remelts[s.id] ? 'remelt' : 'keep'}
                        onChange={(e) => onRemelt(s.id, e.target.value === 'remelt')}
                        aria-label={`After buying ${s.name}`}
                        className="bg-sc-darker border border-sc-border/60 rounded px-2 py-1 text-xs text-gray-200 max-w-[16rem]"
                      >
                        <option value="keep">Buy and keep</option>
                        <option value="remelt">Buy and immediately remelt for buyback token</option>
                      </select>
                    )}
                  </td>
                  <td className="table-cell text-right font-mono tabular-nums">
                    {isPicked
                      ? <MoneyInput label={`Price for ${s.name}`} cents={priceOf(s)} onCommit={(c) => onPrice(s.id, c == null || c === s.pledge_price_cents ? null : c)} />
                      : usd(s.pledge_price_cents)}
                  </td>
                  <td className="table-cell text-right font-mono tabular-nums text-gray-400">{s.price_auec ? Number(s.price_auec).toLocaleString('en-US') : <span className="text-gray-600">—</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-gray-500 max-w-4xl">
        Expected price is RSI’s current store price, before tax. IAE prices and which ships are offered change by day, so edit the price on anything in your buy list.
        Standalone ships bought during IAE have usually come with {IAE_MONTHS}-month insurance.
        “Buy and immediately remelt” puts the ship in Buy Back Pledges at the price you paid and returns that price as store credit. The in-game column is SC Bridge’s aUEC price; blank means no known shop sells it.
      </p>
    </section>
  )
}
