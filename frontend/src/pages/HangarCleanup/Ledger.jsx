import React, { useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import SearchInput from '../../components/SearchInput'
import {
  usd, displayName, roleOf, rebuyPrice, iaeReasons, FLAGS, CATEGORIES, IAE_MONTHS,
} from '../../lib/hangarCleanup'
import { Pill, Chip, MoneyInput, DECISIONS, SUGGESTION_TONE } from './ui'

const INS_TONE = { LTI: 'text-sc-lti', long: 'text-sc-warn', short: 'text-red-300', none: 'text-red-300' }
// Left edge colour on a decided row, so a scan down the table shows what's planned.
const DECIDED_EDGE = { melt: 'border-l-2 border-l-sc-melt', 'melt-ig': 'border-l-2 border-l-sc-melt', iae: 'border-l-2 border-l-sc-accent2', ins: 'border-l-2 border-l-sc-accent2', keep: 'border-l-2 border-l-sc-success', review: 'border-l-2 border-l-gray-500' }

function effectiveSuggestion(r, d) {
  if (d?.buy_ingame && r.meltable && r.value > 0 && r.cat !== 'CCU') {
    return { action: 'melt-ig', label: 'Melt, buy in-game', reasons: ['You marked this as buyable with aUEC.', ...r.suggestion.reasons] }
  }
  return r.suggestion
}

function Detail({ r, d, decisions, onDecide }) {
  const s = effectiveSuggestion(r, d)
  const canIg = r.meltable && r.value > 0 && r.cat !== 'CCU'
  const canIae = r.cat === 'Ship' && r.meltable && r.value > 0
  const price = canIae ? rebuyPrice(r, decisions) : null
  const items = r.items.filter((i) => i.kind !== 'Insurance')
  const auec = r.ships.find((x) => x.price_auec)?.price_auec
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3 text-sm">
      <div className="space-y-2 min-w-0">
        <h4 className="font-display text-xs uppercase tracking-wider text-sc-accent2">Why</h4>
        <ul className="list-disc pl-4 space-y-1 text-gray-300">{s.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
        {canIg && (
          <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
            <input type="checkbox" checked={!!d?.buy_ingame} onChange={(e) => onDecide(r.id, { buy_ingame: e.target.checked })} />
            Buyable in-game with aUEC{auec ? <span className="font-mono text-gray-500">({Number(auec).toLocaleString('en-US')} aUEC)</span> : null}
          </label>
        )}
        <p className="text-[11px] font-mono text-gray-500">Pledge #{r.id} · {r.date || 'no date'} · {r.currency || '—'}{r.warbond ? ' · Warbond' : ''}{r.giftable ? ' · Giftable' : ''}</p>
      </div>
      {r.cat === 'Ship' && (
        <div className="space-y-2 min-w-0">
          <h4 className="font-display text-xs uppercase tracking-wider text-sc-accent2">CCU chain</h4>
          {r.chain.length
            ? (
              <div className="flex flex-wrap items-center gap-1 text-xs">
                <span className="px-1.5 py-0.5 rounded border border-white/10 bg-white/[0.03]">{r.chain[0].from}</span>
                {r.chain.map((c, i) => (
                  <React.Fragment key={i}>
                    <span className="text-gray-500">→</span>
                    <span className="px-1.5 py-0.5 rounded border border-white/10 bg-white/[0.03]">{c.to}{c.value != null && <span className="ml-1 font-mono text-gray-500">{usd(c.value)}</span>}</span>
                  </React.Fragment>
                ))}
              </div>
            )
            : <p className="text-gray-500">{r.upgraded ? 'Upgraded, but the sync has no upgrade log for it. Base guessed from the pledge name.' : 'Not upgraded: this is the original hull.'}</p>}
          {canIae && (
            <div className="pt-2 space-y-2">
              <h4 className="font-display text-xs uppercase tracking-wider text-sc-accent2">Melt &amp; rebuy at IAE</h4>
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor={`iae-${r.id}`} className="text-gray-400">IAE price</label>
                <MoneyInput id={`iae-${r.id}`} label={`IAE price for ${displayName(r)}`} cents={price.cents} onCommit={(c) => onDecide(r.id, { iae_price_cents: c })} />
                <span className="text-[11px] font-mono text-gray-500">{price.source === 'yours' ? 'your price' : price.source === 'store' ? 'RSI store price' : 'no price on file'}</span>
                {price.source === 'yours' && <button type="button" className="btn-ghost !px-2 !py-0.5 text-[11px]" onClick={() => onDecide(r.id, { iae_price_cents: null })}>Use store price</button>}
              </div>
              <ul className="list-disc pl-4 space-y-1 text-gray-300">{iaeReasons(r, decisions).map((x) => <li key={x}>{x}</li>)}</ul>
              {d?.decision !== 'iae'
                ? <button type="button" className="btn-secondary !py-1 !px-3 text-xs" onClick={() => onDecide(r.id, { decision: 'iae' })}>Plan this rebuy</button>
                : <p className="text-[11px] text-gray-500">Planned: counted in IAE rebuys and credit after.</p>}
            </div>
          )}
        </div>
      )}
      <div className="space-y-2 min-w-0">
        <h4 className="font-display text-xs uppercase tracking-wider text-sc-accent2">Contents ({items.length})</h4>
        <ul className="space-y-0.5 text-gray-300">
          {items.slice(0, 30).map((i, idx) => (
            <li key={idx} className="truncate">
              {i.title}{i.kind && <span className="text-gray-500"> · {i.kind}</span>}
              {r.paintUnowned && i.kind === 'Skin' && r.paintUnowned.some((h) => i.title.startsWith(h)) && <span className="ml-1"><Pill tone="warn">no ship</Pill></span>}
            </li>
          ))}
          {items.length > 30 && <li className="text-gray-500">+{items.length - 30} more</li>}
        </ul>
      </div>
    </div>
  )
}

const SORTS = {
  value: (r) => r.value,
  name: (r) => displayName(r).toLowerCase(),
  role: (r) => roleOf(r) || '~',
  cat: (r) => r.cat,
  ins: (r) => (r.cat === 'Ship' ? r.ins.rank : -1),
  base: (r) => r.base || '~',
}

/** The full pledge ledger: filters, decision per pledge, and an expandable detail row. */
export default function Ledger({ rows, decisions, onDecide, open, onToggle }) {
  const [q, setQ] = useState('')
  const [meltOnly, setMeltOnly] = useState(true)
  const [cats, setCats] = useState(new Set())
  const [flags, setFlags] = useState(new Set())
  const [sort, setSort] = useState({ key: 'value', dir: -1 })

  const base = useMemo(() => rows.filter((r) => !meltOnly || (r.meltable && r.value > 0)), [rows, meltOnly])
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const v = base.filter((r) => {
      if (cats.size && !cats.has(r.cat)) return false
      if (flags.size && ![...flags].every((f) => r.flags.includes(f))) return false
      if (needle && ![r.name, r.current, r.base, roleOf(r), ...r.items.map((i) => i.title)].join(' ').toLowerCase().includes(needle)) return false
      return true
    })
    const get = SORTS[sort.key]
    return v.sort((a, b) => { const x = get(a), y = get(b); return (x > y ? 1 : x < y ? -1 : 0) * sort.dir || b.value - a.value })
  }, [base, q, cats, flags, sort])

  const toggleSet = (set, setter, key) => { const n = new Set(set); n.has(key) ? n.delete(key) : n.add(key); setter(n) }
  const head = (key, label, cls = '') => (
    <th className={`table-header cursor-pointer select-none whitespace-nowrap ${cls}`} onClick={() => setSort((s) => ({ key, dir: s.key === key ? -s.dir : (key === 'value' || key === 'ins' ? -1 : 1) }))} aria-sort={sort.key === key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
      {label}{sort.key === key && <span className="ml-1 opacity-60">{sort.dir > 0 ? '▲' : '▼'}</span>}
    </th>
  )

  return (
    <section className="space-y-3" id="ledger" aria-label="Ledger">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-display text-lg uppercase tracking-wider text-white mr-auto">Ledger</h3>
        <SearchInput value={q} onChange={setQ} placeholder="Search ship, pledge, role…" className="w-full sm:w-72" />
        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
          <input type="checkbox" checked={meltOnly} onChange={(e) => setMeltOnly(e.target.checked)} /> Meltable only
        </label>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => { const n = base.filter((r) => r.cat === c).length; return n ? <Chip key={c} active={cats.has(c)} count={n} onClick={() => toggleSet(cats, setCats, c)}>{c}</Chip> : null })}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(FLAGS).map(([k, f]) => { const n = base.filter((r) => r.flags.includes(k)).length; return n ? <Chip key={k} active={flags.has(k)} count={n} title={f.tip} onClick={() => toggleSet(flags, setFlags, k)}>{f.label}</Chip> : null })}
      </div>
      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[1040px]">
          <thead>
            <tr>
              <th className="table-header w-8"><span className="sr-only">Expand</span></th>
              <th className="table-header">Decision</th>
              {head('name', 'Ship')}
              {head('role', 'Role')}
              {head('cat', 'Type')}
              {head('value', 'Melt value', 'text-right')}
              {head('ins', 'Insurance')}
              {head('base', 'CCU’d from')}
              <th className="table-header">Flags</th>
              <th className="table-header">Suggestion</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={10} className="table-cell text-gray-500 py-6">No pledges match these filters.</td></tr>
            )}
            {visible.map((r) => {
              const d = decisions[r.id]
              const s = effectiveSuggestion(r, d)
              const isOpen = open.has(r.id)
              const canIae = r.cat === 'Ship' && r.meltable && r.value > 0
              const sub = r.name + (r.cat === 'Ship' && r.chain.length ? ` · ${r.chain.length} CCU step${r.chain.length > 1 ? 's' : ''}` : '') + (r.cat !== 'Ship' && r.cat !== 'CCU' ? ` · ${r.items.length} item${r.items.length === 1 ? '' : 's'}` : '')
              return (
                <React.Fragment key={r.id}>
                  <tr id={`hc-row-${r.id}`} className="hover:bg-white/[0.02] align-top">
                    <td className={`table-cell ${DECIDED_EDGE[d?.decision] ?? 'border-l-2 border-l-transparent'}`}>
                      <button type="button" onClick={() => onToggle(r.id)} aria-expanded={isOpen} aria-label={`Details for ${displayName(r)}`} className="text-gray-500 hover:text-sc-accent">
                        <ChevronRight className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                      </button>
                    </td>
                    <td className="table-cell">
                      <select
                        value={d?.decision ?? ''}
                        onChange={(e) => onDecide(r.id, { decision: e.target.value || null })}
                        aria-label={`Decision for ${displayName(r)}`}
                        className="bg-sc-darker border border-sc-border/60 rounded px-1.5 py-1 text-xs text-gray-200 max-w-[11rem]"
                      >
                        {DECISIONS.filter(([v]) => v !== 'iae' || canIae || d?.decision === 'iae').map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </td>
                    <td className="table-cell min-w-[14rem]">
                      <button type="button" onClick={() => onToggle(r.id)} className="text-left">
                        <div className="font-display font-semibold text-white">{displayName(r)}</div>
                        <div className="text-[11px] font-mono text-gray-500">{sub}</div>
                      </button>
                    </td>
                    <td className="table-cell text-xs text-gray-300 whitespace-nowrap">{roleOf(r) || <span className="text-gray-600">—</span>}</td>
                    <td className="table-cell text-xs text-gray-300">{r.cat}</td>
                    <td className={`table-cell text-right font-mono tabular-nums ${r.meltable ? 'text-gray-100' : 'text-gray-600'}`}>{usd(r.value)}</td>
                    <td className="table-cell text-xs">
                      {r.cat === 'Ship' ? <span className={`font-semibold ${INS_TONE[r.ins.tier]}`}>{r.ins.label}</span> : r.ins.tier !== 'none' ? <span className="text-gray-500">{r.ins.label}</span> : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="table-cell text-xs text-gray-300">{r.cat === 'Ship' ? r.base : <span className="text-gray-600">—</span>}</td>
                    <td className="table-cell">
                      <div className="flex flex-wrap gap-1">
                        {r.flags.filter((f) => f !== 'not-meltable' || !meltOnly).map((f) => <Pill key={f} tone={FLAGS[f].tone === 'good' && f === 'lti-token' ? 'lti' : FLAGS[f].tone} title={FLAGS[f].tip}>{FLAGS[f].label}</Pill>)}
                      </div>
                    </td>
                    <td className="table-cell"><Pill tone={SUGGESTION_TONE[s.action]}>{s.label}</Pill></td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={10} className="table-cell bg-white/[0.02] px-6 py-4">
                        <Detail r={r} d={d} decisions={decisions} onDecide={onDecide} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-gray-500 max-w-4xl">
        Melt value is what RSI returns as store credit. Warbond pledges melt for what you paid, but buying back with credit costs the standard price.
        Melting a CCU’d LTI ship returns its full value and loses the LTI on its base hull. “Melt, rebuy at IAE” assumes a standalone ship with {IAE_MONTHS}-month insurance.
      </p>
    </section>
  )
}
