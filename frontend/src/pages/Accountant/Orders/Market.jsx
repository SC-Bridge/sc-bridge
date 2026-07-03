import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import PageHeader from '../../../components/PageHeader'
import LoadingState from '../../../components/LoadingState'
import { CATEGORY_LABELS, ORDER_CATEGORIES, ORDER_TYPES, STATUS_LABELS } from '../constants'
import { formatAUEC } from '../formatAUEC'
import { useBadges, useOrders } from '../hooks'
import NewOrderModal from './NewOrderModal'
import OrderDetail from './OrderDetail'
import OrderTable from './OrderTable'
import Pager from '../components/Pager'

// Mirrors the backend PER_PAGE for the orders list — the server pages at 50 and
// echoes only the requested page, so the client derives page count from total.
const PAGE_SIZE = 50

// Order statuses offered as filters (draft/terminated are workorder-only).
const FILTER_STATUSES = ['open', 'in_progress', 'complete', 'cancelled']

const FILTER_GROUPS = [
  { key: 'type', title: 'Type', options: ORDER_TYPES },
  { key: 'category', title: 'Category', options: ORDER_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] })) },
  { key: 'status', title: 'Status', options: FILTER_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })) },
]

function Filters({ params, onChange }) {
  function toggle(key, value, active) {
    const next = new URLSearchParams(params)
    const current = next.getAll(key)
    next.delete(key)
    const updated = active ? current.filter((v) => v !== value) : [...current, value]
    for (const v of updated) next.append(key, v)
    onChange(next)
  }

  return (
    <aside className="w-56 shrink-0 space-y-4" data-testid="market-filters">
      {FILTER_GROUPS.map(({ key, title, options }) => (
        <div key={key}>
          <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-2">{title}</h3>
          {options.map(({ value, label }) => {
            const active = params.getAll(key).includes(value)
            return (
              <label key={value} className="flex items-center gap-2 text-sm text-gray-300 py-0.5">
                <input type="checkbox" checked={active} onChange={() => toggle(key, value, active)} />
                {label}
              </label>
            )
          })}
        </div>
      ))}
    </aside>
  )
}

function OverdueBanner() {
  const { data } = useBadges()
  const count = data?.ordersOverdue ?? 0
  if (count === 0) return null
  return (
    <div role="alert" className="panel p-3 text-sm text-sc-warn border-sc-warn/40">
      {count === 1 ? '1 order past its delivery date' : `${count} orders past their delivery date`}
      {' — fines are accruing.'}
    </div>
  )
}

export default function Market() {
  const [params, setParams] = useSearchParams()
  const { data, error, loading, refetch } = useOrders(params.toString())
  const [adding, setAdding] = useState(false)
  const selectedId = params.get('order')

  function setOrderParam(id) {
    const next = new URLSearchParams(params)
    if (id === null) next.delete('order')
    else next.set('order', String(id))
    setParams(next)
  }

  // Any filter change must return to page 1 — staying on page 7 after a filter
  // trims the result to fewer pages would show an empty list.
  // replace: filtering/paging shouldn't stack Back-button history entries.
  function changeFilters(next) {
    next.delete('page')
    setParams(next, { replace: true })
  }

  function goToPage(p) {
    const next = new URLSearchParams(params)
    if (p <= 1) next.delete('page')
    else next.set('page', String(p))
    setParams(next, { replace: true })
  }

  if (loading && !data) return <LoadingState />
  if (error) {
    return (
      <div className="p-6">
        <div role="alert" className="panel p-4 text-sc-danger text-sm">{error.message}</div>
        <button onClick={refetch} className="mt-3 text-sm text-sc-accent">Retry</button>
      </div>
    )
  }

  const { orders, total, balance, lockedInPOs } = data
  // Distinguish "nothing matches the active filters" from a truly empty
  // account — the CTA hero only makes sense for the latter. Client heuristic
  // on the filter params; `order`/paging params don't narrow the list.
  const filtered = FILTER_GROUPS.some(({ key }) => params.getAll(key).length > 0)

  const page = Math.max(1, parseInt(params.get('page') ?? '1', 10) || 1)
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        title="ORDER MARKET"
        subtitle="Buy and sell agreements with contract terms and locked funds"
        actions={
          <button onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 bg-sc-accent/20 text-sc-accent border border-sc-accent/40 rounded px-3 py-1.5 text-sm hover:bg-sc-accent/30">
            <Plus className="w-4 h-4" /> New Order
          </button>
        }
      />

      <OverdueBanner />

      <div className="flex gap-6">
        {/* replace + page reset live in changeFilters. */}
        <Filters params={params} onChange={changeFilters} />
        <div className="flex-1 min-w-0">
          {total === 0 && filtered ? (
            <div className="panel p-10 text-center text-gray-400">
              <p>No orders match these filters.</p>
            </div>
          ) : total === 0 ? (
            <div className="panel p-10 text-center text-gray-400">
              <p className="mb-3">No orders yet.</p>
              <button onClick={() => setAdding(true)} className="text-sc-accent text-sm">
                Create your first order
              </button>
            </div>
          ) : (
            <OrderTable orders={orders} onSelect={setOrderParam} />
          )}
          <div className="mt-3 flex items-center justify-between gap-4">
            <p className="text-sm text-gray-500">
              Available balance: {formatAUEC(balance)} (locked in POs: {formatAUEC(lockedInPOs)})
            </p>
            <Pager page={page} totalPages={totalPages} onPage={goToPage} />
          </div>
        </div>
      </div>

      {/* key remounts the slide-over per order — action errors and note
          drafts from one order never bleed into the next. */}
      {selectedId && <OrderDetail key={selectedId} id={selectedId} onClose={() => setOrderParam(null)} />}

      {adding && <NewOrderModal onClose={() => setAdding(false)} onSaved={() => setAdding(false)} />}
    </div>
  )
}
