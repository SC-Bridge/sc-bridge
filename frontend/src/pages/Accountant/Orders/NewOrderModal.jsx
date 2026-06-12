import { useState } from 'react'
import {
  CATEGORY_LABELS, DEFAULT_TAGS, FINE_RATE_TYPES, LOAN_INTERVALS,
  ORDER_CATEGORIES, ORDER_TEMPLATE, ORDER_TYPES, RATE_CHANGE_CONDITIONS, TAG_LABELS,
} from '../constants'
import { INTERVAL_LABELS } from '../loanMath'
import { createOrder } from '../hooks'
import { formatAUEC } from '../formatAUEC'
import { localDatetimeNow } from '../datetime'
import { modifiedContractFields, orderTotal } from '../orderMath'

// Mid-edit number fields parse to NaN — fall back to the template default so the
// "← modified" marker doesn't flicker while a field is being cleared.
function num(value, fallback) {
  const n = parseFloat(value)
  return Number.isNaN(n) ? fallback : n
}

const inputClass = 'w-full bg-sc-darker border border-sc-border rounded px-2 py-1.5 text-sm'

function ModifiedMarker() {
  return <span data-testid="modified-marker" className="ml-1.5 text-xs text-sc-warn">← modified</span>
}

// UX B.5 rejection panel — keys off the fund-blocker 400 body
// { error: 'Insufficient funds', balance, lockedInPOs, required }.
function FundRejectionPanel({ details }) {
  return (
    <div data-testid="fund-rejection" role="alert"
      className="border border-sc-danger/40 bg-sc-danger/10 rounded p-3 text-sm space-y-1">
      <p className="text-sc-danger font-medium">Insufficient funds.</p>
      <div className="flex justify-between">
        <span className="text-gray-400">Order amount</span>
        <span className="text-gray-200 tabular-nums">{formatAUEC(details.required)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-400">Available balance</span>
        <span className="text-gray-200 tabular-nums">{formatAUEC(details.balance)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-400">Locked in open POs</span>
        <span className="text-gray-200 tabular-nums">{formatAUEC(details.lockedInPOs)}</span>
      </div>
      <p className="text-gray-400">Reduce quantity or cancel another open PO.</p>
    </div>
  )
}

export default function NewOrderModal({ onClose, onSaved }) {
  const [type, setType] = useState('sale')
  const [category, setCategory] = useState('')
  const [tag, setTag] = useState('')
  const [item, setItem] = useState('')
  const [quantity, setQuantity] = useState('')
  const [pricePerUnit, setPricePerUnit] = useState('')
  const [startAt, setStartAt] = useState(localDatetimeNow)
  const [deliverBy, setDeliverBy] = useState('')
  const [fineInterval, setFineInterval] = useState(ORDER_TEMPLATE.fine_interval)
  const [fineRateType, setFineRateType] = useState(ORDER_TEMPLATE.fine_rate_type)
  const [fineRate, setFineRate] = useState(String(ORDER_TEMPLATE.fine_rate))
  const [rateChangeCondition, setRateChangeCondition] = useState('')
  const [rateChangePct, setRateChangePct] = useState(String(ORDER_TEMPLATE.rate_change_pct))
  const [terminationClause, setTerminationClause] = useState(ORDER_TEMPLATE.termination_clause)
  const [error, setError] = useState(null)
  const [fundError, setFundError] = useState(null)
  const [saving, setSaving] = useState(false)

  // RATE_CHANGE_CONDITIONS "None" has value '' — map to null/omit; the backend
  // enum rejects '' and modifiedContractFields would falsely mark it as modified.
  const contract = {
    deliver_by: deliverBy ? new Date(deliverBy).toISOString() : null,
    fine_interval: fineInterval,
    fine_rate_type: fineRateType,
    fine_rate: num(fineRate, ORDER_TEMPLATE.fine_rate),
    rate_change_condition: rateChangeCondition || null,
    rate_change_pct: num(rateChangePct, ORDER_TEMPLATE.rate_change_pct),
    termination_clause: terminationClause.trim() || ORDER_TEMPLATE.termination_clause,
  }
  const modified = modifiedContractFields(contract)

  const qty = parseFloat(quantity)
  const price = parseFloat(pricePerUnit)
  const total = qty > 0 && price > 0 ? orderTotal(qty, price) : null

  const tags = category ? DEFAULT_TAGS[category] ?? [] : []

  async function submit(e) {
    e.preventDefault()
    if (!(qty > 0) || !(price > 0)) {
      setError('Quantity and price must be greater than 0')
      return
    }
    setSaving(true)
    setError(null)
    setFundError(null)
    const body = {
      type,
      category,
      ...(tag ? { tag } : {}),
      item: item.trim(),
      quantity: qty,
      price_per_unit: parseInt(pricePerUnit, 10),
      start_at: new Date(startAt).toISOString(),
      ...(contract.deliver_by ? { deliver_by: contract.deliver_by } : {}),
      fine_interval: contract.fine_interval,
      fine_rate_type: contract.fine_rate_type,
      fine_rate: contract.fine_rate,
      ...(contract.rate_change_condition ? { rate_change_condition: contract.rate_change_condition } : {}),
      rate_change_pct: contract.rate_change_pct,
      termination_clause: contract.termination_clause,
    }
    try {
      await createOrder(body)
      onSaved()
    } catch (err) {
      if (err.details?.balance !== undefined) setFundError(err.details)
      else setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div data-testid="new-order-modal"
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="bg-sc-dark border border-sc-border rounded-lg p-5 w-full max-w-md space-y-3 animate-fade-in max-h-[90vh] overflow-y-auto"
      >
        <h2 className="text-white font-medium">New Order</h2>

        {error && <div role="alert" className="text-sm text-sc-danger">{error}</div>}
        {fundError && <FundRejectionPanel details={fundError} />}

        <div className="flex gap-4 text-sm text-gray-300">
          {ORDER_TYPES.map(({ value, label }) => (
            <label key={value} className="flex items-center gap-1.5">
              <input type="radio" name="type" checked={type === value}
                onChange={() => setType(value)} aria-label={label} />
              {label}
            </label>
          ))}
        </div>

        <div>
          <label htmlFor="category" className="block text-sm text-gray-400 mb-1">Category</label>
          <select id="category" required value={category}
            onChange={(e) => { setCategory(e.target.value); setTag('') }} className={inputClass}>
            <option value="">Select…</option>
            {ORDER_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
        </div>

        {tags.length > 0 && (
          <div>
            <label htmlFor="tag" className="block text-sm text-gray-400 mb-1">Tag</label>
            <select id="tag" value={tag} onChange={(e) => setTag(e.target.value)} className={inputClass}>
              <option value="">No tag</option>
              {tags.map((t) => <option key={t} value={t}>{TAG_LABELS[t] ?? t}</option>)}
            </select>
          </div>
        )}

        <div>
          <label htmlFor="item" className="block text-sm text-gray-400 mb-1">Item</label>
          <input id="item" type="text" required value={item}
            onChange={(e) => setItem(e.target.value)} className={inputClass} />
        </div>

        <div>
          <label htmlFor="quantity" className="block text-sm text-gray-400 mb-1">Quantity (SCU/units)</label>
          <input id="quantity" type="number" min="0" step="any" required value={quantity}
            onChange={(e) => setQuantity(e.target.value)} className={inputClass} />
        </div>

        <div>
          <label htmlFor="pricePerUnit" className="block text-sm text-gray-400 mb-1">Price per unit (aUEC)</label>
          <input id="pricePerUnit" type="number" min="1" required value={pricePerUnit}
            onChange={(e) => setPricePerUnit(e.target.value)} className={inputClass} />
        </div>

        {total !== null && (
          <p className="text-sm text-gray-300">
            Total: <span className="text-white tabular-nums">{formatAUEC(total)}</span>
          </p>
        )}

        <fieldset className="border border-sc-border rounded p-3 space-y-3">
          <legend className="text-xs uppercase tracking-wider text-gray-500 px-1">Contract (template)</legend>

          <div>
            <label htmlFor="startAt" className="block text-sm text-gray-400 mb-1">Start date/time</label>
            <input id="startAt" type="datetime-local" required value={startAt}
              onChange={(e) => setStartAt(e.target.value)} className={inputClass} />
          </div>

          <div data-testid="contract-deliver_by">
            <label htmlFor="deliverBy" className="block text-sm text-gray-400 mb-1">
              Delivery date (optional){modified.includes('deliver_by') && <ModifiedMarker />}
            </label>
            <input id="deliverBy" type="datetime-local" value={deliverBy}
              onChange={(e) => setDeliverBy(e.target.value)} className={inputClass} />
          </div>

          <div data-testid="contract-fine_interval">
            <label htmlFor="fineInterval" className="block text-sm text-gray-400 mb-1">
              Fine interval{modified.includes('fine_interval') && <ModifiedMarker />}
            </label>
            <select id="fineInterval" value={fineInterval}
              onChange={(e) => setFineInterval(e.target.value)} className={inputClass}>
              {LOAN_INTERVALS.map((iv) => <option key={iv} value={iv}>{INTERVAL_LABELS[iv]}</option>)}
            </select>
          </div>

          <div data-testid="contract-fine_rate_type">
            <label htmlFor="fineRateType" className="block text-sm text-gray-400 mb-1">
              Fine type{modified.includes('fine_rate_type') && <ModifiedMarker />}
            </label>
            <select id="fineRateType" value={fineRateType}
              onChange={(e) => setFineRateType(e.target.value)} className={inputClass}>
              {FINE_RATE_TYPES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>

          <div data-testid="contract-fine_rate">
            <label htmlFor="fineRate" className="block text-sm text-gray-400 mb-1">
              Fine rate{modified.includes('fine_rate') && <ModifiedMarker />}
            </label>
            <input id="fineRate" type="number" min="0" step="any" required value={fineRate}
              onChange={(e) => setFineRate(e.target.value)} className={inputClass} />
          </div>

          <div data-testid="contract-rate_change_condition">
            <label htmlFor="rateChangeCondition" className="block text-sm text-gray-400 mb-1">
              Rate change{modified.includes('rate_change_condition') && <ModifiedMarker />}
            </label>
            <select id="rateChangeCondition" value={rateChangeCondition}
              onChange={(e) => setRateChangeCondition(e.target.value)} className={inputClass}>
              {RATE_CHANGE_CONDITIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>

          <div data-testid="contract-rate_change_pct">
            <label htmlFor="rateChangePct" className="block text-sm text-gray-400 mb-1">
              Rate change %{modified.includes('rate_change_pct') && <ModifiedMarker />}
            </label>
            <input id="rateChangePct" type="number" min="0" step="any" value={rateChangePct}
              onChange={(e) => setRateChangePct(e.target.value)} className={inputClass} />
          </div>

          <div data-testid="contract-termination_clause">
            <label htmlFor="terminationClause" className="block text-sm text-gray-400 mb-1">
              Termination{modified.includes('termination_clause') && <ModifiedMarker />}
            </label>
            <input id="terminationClause" type="text" required value={terminationClause}
              onChange={(e) => setTerminationClause(e.target.value)} className={inputClass} />
          </div>

          <p className="text-xs text-gray-500">ⓘ Modified fields are highlighted.</p>
        </fieldset>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="text-sm text-gray-400 px-3 py-1.5">Cancel</button>
          <button type="submit" disabled={saving}
            className="bg-sc-accent/20 text-sc-accent border border-sc-accent/40 rounded px-4 py-1.5 text-sm hover:bg-sc-accent/30 disabled:opacity-50">
            {saving ? 'Posting…' : 'Post order'}
          </button>
        </div>
      </form>
    </div>
  )
}
