import { useState } from 'react'
import { recordFulfillment } from '../hooks'
import { formatAUEC } from '../formatAUEC'
import { localDatetimeNow } from '../datetime'
import { effectiveRate, fulfillmentPreview, orderRef } from '../orderMath'

const inputClass = 'w-full bg-sc-darker border border-sc-border rounded px-2 py-1.5 text-sm'

// order carries fulfilledQty/remaining merged in from the detail's computed
// block — effectiveRate needs fulfilledQty for the 'partial' trigger.
export default function FulfillmentModal({ order, onClose, onSaved }) {
  const [quantity, setQuantity] = useState('')
  const [occurredAt, setOccurredAt] = useState(localDatetimeNow)
  const [location, setLocation] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const remaining = order.remaining ?? order.quantity - order.fulfilledQty
  const rate = effectiveRate(order, {
    occurredAtMs: Date.parse(occurredAt),
    fulfilledQty: order.fulfilledQty,
  })
  const qty = parseFloat(quantity)

  async function submit(e) {
    e.preventDefault()
    if (!(qty > 0)) {
      setError('Quantity must be greater than 0')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await recordFulfillment(order.id, {
        quantity: qty,
        occurred_at: new Date(occurredAt).toISOString(),
        ...(location ? { location } : {}),
        ...(amount ? { amount: parseInt(amount, 10) } : {}),
      })
      onSaved()
    } catch (err) {
      // Server-echoed details (remaining gate) surface verbatim, never swallowed.
      setError(err.details?.remaining !== undefined
        ? `${err.message} — remaining is ${err.details.remaining}`
        : err.message)
      setSaving(false)
    }
  }

  return (
    <div data-testid="fulfillment-modal"
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="bg-sc-dark border border-sc-border rounded-lg p-5 w-full max-w-md space-y-3 animate-fade-in max-h-[90vh] overflow-y-auto"
      >
        <h2 className="text-white font-medium">Record fulfilment · {orderRef(order.id)} · {order.item}</h2>
        <p className="text-sm text-gray-400">Remaining: {remaining} of {order.quantity}</p>

        {error && <div role="alert" className="text-sm text-sc-danger">{error}</div>}

        <div>
          <label htmlFor="quantity" className="block text-sm text-gray-400 mb-1">Quantity</label>
          <input id="quantity" type="number" min="0" max={remaining} step="any" required value={quantity}
            onChange={(e) => setQuantity(e.target.value)} className={inputClass} />
        </div>

        {qty > 0 && (
          <div className="text-sm text-gray-300">
            <p>
              Preview: <span className="text-white tabular-nums">{formatAUEC(fulfillmentPreview(qty, rate))}</span>
            </p>
            {rate !== order.price_per_unit && (
              <p className="text-xs text-sc-warn">
                effective rate {rate.toLocaleString('en-US')} ({order.rate_change_condition} +{order.rate_change_pct}%)
              </p>
            )}
          </div>
        )}

        <div>
          <label htmlFor="occurredAt" className="block text-sm text-gray-400 mb-1">Date/time</label>
          <input id="occurredAt" type="datetime-local" required value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)} className={inputClass} />
        </div>

        <div>
          <label htmlFor="location" className="block text-sm text-gray-400 mb-1">Location (optional)</label>
          <input id="location" type="text" value={location}
            onChange={(e) => setLocation(e.target.value)} className={inputClass} />
        </div>

        <div>
          <label htmlFor="amount" className="block text-sm text-gray-400 mb-1">Amount override (optional, aUEC)</label>
          <input id="amount" type="number" min="1" value={amount}
            onChange={(e) => setAmount(e.target.value)} className={inputClass} />
          <p className="text-xs text-gray-500 mt-1">Leave blank to book the effective-rate amount.</p>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="text-sm text-gray-400 px-3 py-1.5">Cancel</button>
          <button type="submit" disabled={saving}
            className="bg-sc-accent/20 text-sc-accent border border-sc-accent/40 rounded px-4 py-1.5 text-sm hover:bg-sc-accent/30 disabled:opacity-50">
            {saving ? 'Recording…' : 'Record fulfilment'}
          </button>
        </div>
      </form>
    </div>
  )
}
