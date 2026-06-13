import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { CATEGORY_LABELS, FINE_RATE_TYPES, ORDER_TYPES, RATE_CHANGE_CONDITIONS, STATUS_LABELS } from '../constants'
import { formatAUEC, signClass } from '../formatAUEC'
import { cancelOrder, updateOrder, useOrder } from '../hooks'
import { orderRef } from '../orderMath'
import FulfillmentModal from './FulfillmentModal'

const TYPE_LABELS = Object.fromEntries(ORDER_TYPES.map(({ value, label }) => [value, label]))
const FINE_TYPE_LABELS = Object.fromEntries(FINE_RATE_TYPES.map(({ value, label }) => [value, label]))
const RATE_CHANGE_LABELS = Object.fromEntries(RATE_CHANGE_CONDITIONS.map(({ value, label }) => [value, label]))

// Contract rows in template order — drives the "← modified" markers. Exported:
// workorders carry the identical contract columns, so WorkorderDetail renders
// the same rows (one display config, no drift between the two contract panels).
export const CONTRACT_FIELDS = [
  ['deliver_by', 'Delivery date', (o) => (o.deliver_by ? new Date(o.deliver_by).toLocaleString() : 'None')],
  ['fine_interval', 'Fine interval', (o) => o.fine_interval],
  ['fine_rate_type', 'Fine type', (o) => FINE_TYPE_LABELS[o.fine_rate_type]],
  ['fine_rate', 'Fine rate', (o) => (o.fine_rate_type === 'percent' ? `${o.fine_rate}%` : formatAUEC(o.fine_rate))],
  ['rate_change_condition', 'Rate change', (o) => RATE_CHANGE_LABELS[o.rate_change_condition ?? '']],
  ['rate_change_pct', 'Rate change %', (o) => `+${o.rate_change_pct}%`],
  ['termination_clause', 'Termination', (o) => o.termination_clause],
]

function SectionTitle({ children }) {
  return <h3 className="text-xs uppercase tracking-wider text-gray-500 mt-5 mb-2">{children}</h3>
}

// Notes is the ONLY optimistic mutation — the typed value stays put and the
// PUT fires in the background; money mutations remain pessimistic.
function NotesEditor({ order }) {
  const [notes, setNotes] = useState(order.notes ?? '')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  // Still optimistic (typing is never blocked) — saving only dedupes a
  // double-clicked button while the PUT is in flight.
  function save() {
    setError(null)
    setSaving(true)
    updateOrder(order.id, { notes: notes || null })
      .catch((e) => setError(e.message))
      .finally(() => setSaving(false))
  }

  return (
    <>
      <label htmlFor="order-notes" className="block text-xs uppercase tracking-wider text-gray-500 mt-5 mb-2">
        Notes
      </label>
      {error && <div role="alert" className="text-sm text-sc-danger mb-2">{error}</div>}
      <textarea
        id="order-notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        className="w-full bg-sc-darker border border-sc-border rounded px-2 py-1.5 text-sm mb-2"
      />
      <button onClick={save} disabled={saving}
        className="w-full border border-sc-border text-gray-300 rounded py-1.5 text-sm hover:bg-white/5 disabled:opacity-50">
        Save notes
      </button>
    </>
  )
}

export default function OrderDetail({ id, onClose }) {
  const { data, error, loading, refetch } = useOrder(id)
  const [fulfilling, setFulfilling] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [busy, setBusy] = useState(false)

  // Escape closes the slide-over — but not while the fulfilment modal is open
  // (that layer owns Escape first; closing the slide-over underneath it would
  // be surprising).
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && !fulfilling) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fulfilling, onClose])

  async function doCancel(orderId) {
    if (!window.confirm('Cancel this order? Any open reserve is released.')) return
    setActionError(null)
    setBusy(true)
    try {
      await cancelOrder(orderId)
    } catch (e) {
      setActionError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div data-testid="order-detail"
      className="fixed inset-y-0 right-0 w-96 bg-sc-dark border-l border-sc-border p-5 overflow-y-auto z-40 animate-fade-in">
      <div className="flex items-start justify-between">
        <h2 className="text-white font-medium">{data ? `${orderRef(data.order.id)} · ${data.order.item}` : 'Order'}</h2>
        <button onClick={onClose} aria-label="Close detail" className="text-gray-500 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>

      {loading && !data && <p className="mt-4 text-sm text-gray-400">Loading…</p>}
      {error && (
        <div className="mt-4">
          <div role="alert" className="text-sm text-sc-danger">{error.message}</div>
          <button onClick={refetch} className="mt-2 text-sm text-sc-accent">Retry</button>
        </div>
      )}

      {data && <OrderBody data={data} fulfilling={fulfilling} setFulfilling={setFulfilling}
        actionError={actionError} busy={busy} onCancel={doCancel} />}
    </div>
  )
}

function OrderBody({ data, fulfilling, setFulfilling, actionError, busy, onCancel }) {
  const { order, fulfillments, fines, reserve, computed } = data
  const active = order.status === 'open' || order.status === 'in_progress'

  return (
    <>
      <p className="text-sm text-gray-400 mt-1">
        {TYPE_LABELS[order.type]} · {CATEGORY_LABELS[order.category]} · {STATUS_LABELS[order.status]}
        {order.counterparty ? ` · ${order.counterparty}` : ''}
      </p>
      {/* Posting-time name snapshot — renames never rewrite history (design §10). */}
      <p data-testid="order-publisher" className="text-sm text-gray-400">
        Published by <span className="text-gray-300">{order.publisher ?? '—'}</span>
      </p>

      <SectionTitle>Contract</SectionTitle>
      <dl className="text-sm space-y-1">
        {CONTRACT_FIELDS.map(([key, label, value]) => (
          <div key={key} data-testid={`contract-${key}`} className="flex justify-between gap-2">
            <dt className="text-gray-500">{label}</dt>
            <dd className="text-gray-300 text-right">
              {value(order)}
              {order.modified_fields.includes(key) && (
                <span data-testid="modified-marker" className="ml-1.5 text-sc-warn">← modified</span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      <SectionTitle>Progress</SectionTitle>
      <p className="text-sm text-gray-300">
        Fulfilled: <span className="text-white tabular-nums">{computed.fulfilledQty}/{order.quantity}</span>
      </p>
      <p className="text-sm text-gray-300">
        Effective rate: <span className="text-white tabular-nums">{computed.effectiveRate.toLocaleString('en-US')}</span> / unit
      </p>

      {order.type === 'purchase' && (
        <>
          <SectionTitle>Reserve</SectionTitle>
          <p className="text-sm text-white tabular-nums">Locked: {formatAUEC(reserve.open)}</p>
          <p className="text-sm text-gray-500">
            Reserved {formatAUEC(reserve.reserved)} · released {formatAUEC(reserve.released)}
          </p>
        </>
      )}

      <SectionTitle>Fines</SectionTitle>
      {fines.length === 0 ? (
        <p className="text-sm text-gray-500">None.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {fines.map((f) => (
            <li key={f.id} className="flex justify-between">
              <span className="text-gray-400">{new Date(f.occurred_at).toLocaleDateString()}</span>
              <span className={`tabular-nums ${signClass(f.amount)}`}>{formatAUEC(f.amount)}</span>
            </li>
          ))}
        </ul>
      )}

      <SectionTitle>Fulfilments</SectionTitle>
      {fulfillments.length === 0 ? (
        <p className="text-sm text-gray-500">None yet.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {fulfillments.map((f) => (
            <li key={f.id} className="flex justify-between">
              <span className="text-gray-400">
                {new Date(f.occurred_at).toLocaleDateString()} · {f.quantity}{f.location ? ` · ${f.location}` : ''}
              </span>
              <span className={`tabular-nums ${signClass(f.amount)}`}>{formatAUEC(f.amount)}</span>
            </li>
          ))}
        </ul>
      )}

      {actionError && <div role="alert" className="mt-4 text-sm text-sc-danger">{actionError}</div>}

      {active && (
        <div className="flex gap-2 mt-5">
          <button onClick={() => setFulfilling(true)}
            className="bg-sc-accent/20 text-sc-accent border border-sc-accent/40 rounded px-3 py-1.5 text-sm hover:bg-sc-accent/30">
            Record fulfilment
          </button>
          <button onClick={() => onCancel(order.id)} disabled={busy}
            className="border border-sc-border text-gray-300 rounded px-3 py-1.5 text-sm hover:bg-white/5 disabled:opacity-50">
            Cancel order
          </button>
        </div>
      )}

      <NotesEditor key={order.id} order={order} />

      {fulfilling && (
        <FulfillmentModal
          order={{ ...order, fulfilledQty: computed.fulfilledQty, remaining: computed.remaining }}
          onClose={() => setFulfilling(false)}
          onSaved={() => setFulfilling(false)}
        />
      )}
    </>
  )
}
