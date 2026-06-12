// Shared order-form building blocks: NewOrderModal (standalone orders) and
// NewWorkorder (workorder-level contract + inline component orders) render the
// same field set so the template + change-marking behavior stays identical.
import {
  CATEGORY_LABELS, DEFAULT_TAGS, FINE_RATE_TYPES, LOAN_INTERVALS,
  ORDER_CATEGORIES, ORDER_TEMPLATE, ORDER_TYPES, RATE_CHANGE_CONDITIONS, TAG_LABELS,
} from '../constants'
import { INTERVAL_LABELS } from '../loanMath'
import { formatAUEC } from '../formatAUEC'

export const inputClass = 'w-full bg-sc-darker border border-sc-border rounded px-2 py-1.5 text-sm'

// Mid-edit number fields parse to NaN — fall back to the template default so the
// "← modified" marker doesn't flicker while a field is being cleared.
export function num(value, fallback) {
  const n = parseFloat(value)
  return Number.isNaN(n) ? fallback : n
}

export function ModifiedMarker() {
  return <span data-testid="modified-marker" className="ml-1.5 text-xs text-sc-warn">← modified</span>
}

// UX B.5 rejection panel — keys off the fund-blocker 400 body
// { error: 'Insufficient funds', balance, lockedInPOs, required }.
export function FundRejectionPanel({ details }) {
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

// --- core order fields (type/category/tag/item/quantity/price) ---

export const ORDER_CORE_INITIAL = {
  type: 'sale', category: '', tag: '', item: '', quantity: '', pricePerUnit: '',
}

// POST-body fragment for the core fields (CreateOrderSchema shape).
export function orderCoreBody(form) {
  return {
    type: form.type,
    category: form.category,
    ...(form.tag ? { tag: form.tag } : {}),
    item: form.item.trim(),
    quantity: parseFloat(form.quantity),
    price_per_unit: parseInt(form.pricePerUnit, 10),
  }
}

// `required` is opt-out: NewWorkorder's inline sub-form sits INSIDE the page
// <form> and validates itself on "Add order" — native required attributes
// there would block the page-level submit while the sub-form sits empty.
export function OrderCoreFields({ form, onChange, required = true }) {
  const set = (patch) => onChange({ ...form, ...patch })
  const tags = form.category ? DEFAULT_TAGS[form.category] ?? [] : []

  return (
    <>
      <div className="flex gap-4 text-sm text-gray-300">
        {ORDER_TYPES.map(({ value, label }) => (
          <label key={value} className="flex items-center gap-1.5">
            <input type="radio" name="type" checked={form.type === value}
              onChange={() => set({ type: value })} aria-label={label} />
            {label}
          </label>
        ))}
      </div>

      <div>
        <label htmlFor="category" className="block text-sm text-gray-400 mb-1">Category</label>
        <select id="category" required={required} value={form.category}
          onChange={(e) => set({ category: e.target.value, tag: '' })} className={inputClass}>
          <option value="">Select…</option>
          {ORDER_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </select>
      </div>

      {tags.length > 0 && (
        <div>
          <label htmlFor="tag" className="block text-sm text-gray-400 mb-1">Tag</label>
          <select id="tag" value={form.tag} onChange={(e) => set({ tag: e.target.value })} className={inputClass}>
            <option value="">No tag</option>
            {tags.map((t) => <option key={t} value={t}>{TAG_LABELS[t] ?? t}</option>)}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="item" className="block text-sm text-gray-400 mb-1">Item</label>
        <input id="item" type="text" required={required} value={form.item}
          onChange={(e) => set({ item: e.target.value })} className={inputClass} />
      </div>

      <div>
        <label htmlFor="quantity" className="block text-sm text-gray-400 mb-1">Quantity (SCU/units)</label>
        <input id="quantity" type="number" min="0" step="any" required={required} value={form.quantity}
          onChange={(e) => set({ quantity: e.target.value })} className={inputClass} />
      </div>

      <div>
        <label htmlFor="pricePerUnit" className="block text-sm text-gray-400 mb-1">Price per unit (aUEC)</label>
        <input id="pricePerUnit" type="number" min="1" required={required} value={form.pricePerUnit}
          onChange={(e) => set({ pricePerUnit: e.target.value })} className={inputClass} />
      </div>
    </>
  )
}

// --- contract template fields (deliver_by … termination_clause) ---

export const CONTRACT_FORM_INITIAL = {
  deliverBy: '',
  fineInterval: ORDER_TEMPLATE.fine_interval,
  fineRateType: ORDER_TEMPLATE.fine_rate_type,
  fineRate: String(ORDER_TEMPLATE.fine_rate),
  rateChangeCondition: '',
  rateChangePct: String(ORDER_TEMPLATE.rate_change_pct),
  terminationClause: ORDER_TEMPLATE.termination_clause,
}

// RATE_CHANGE_CONDITIONS "None" has value '' — map to null/omit; the backend
// enum rejects '' and modifiedContractFields would falsely mark it as modified.
export function contractFromForm(form) {
  return {
    deliver_by: form.deliverBy ? new Date(form.deliverBy).toISOString() : null,
    fine_interval: form.fineInterval,
    fine_rate_type: form.fineRateType,
    fine_rate: num(form.fineRate, ORDER_TEMPLATE.fine_rate),
    rate_change_condition: form.rateChangeCondition || null,
    rate_change_pct: num(form.rateChangePct, ORDER_TEMPLATE.rate_change_pct),
    termination_clause: form.terminationClause.trim() || ORDER_TEMPLATE.termination_clause,
  }
}

// POST-body fragment for the contract: null deliver_by / rate_change_condition
// are omitted entirely (schema treats absence as the template default).
export function contractBody(contract) {
  return {
    ...(contract.deliver_by ? { deliver_by: contract.deliver_by } : {}),
    fine_interval: contract.fine_interval,
    fine_rate_type: contract.fine_rate_type,
    fine_rate: contract.fine_rate,
    ...(contract.rate_change_condition ? { rate_change_condition: contract.rate_change_condition } : {}),
    rate_change_pct: contract.rate_change_pct,
    termination_clause: contract.termination_clause,
  }
}

// `children` renders ahead of the template fields (NewOrderModal slots the
// order's start_at inside the same fieldset).
export function ContractFields({ form, onChange, modified, children }) {
  const set = (patch) => onChange({ ...form, ...patch })

  return (
    <fieldset className="border border-sc-border rounded p-3 space-y-3">
      <legend className="text-xs uppercase tracking-wider text-gray-500 px-1">Contract (template)</legend>

      {children}

      <div data-testid="contract-deliver_by">
        <label htmlFor="deliverBy" className="block text-sm text-gray-400 mb-1">
          Delivery date (optional){modified.includes('deliver_by') && <ModifiedMarker />}
        </label>
        <input id="deliverBy" type="datetime-local" value={form.deliverBy}
          onChange={(e) => set({ deliverBy: e.target.value })} className={inputClass} />
      </div>

      <div data-testid="contract-fine_interval">
        <label htmlFor="fineInterval" className="block text-sm text-gray-400 mb-1">
          Fine interval{modified.includes('fine_interval') && <ModifiedMarker />}
        </label>
        <select id="fineInterval" value={form.fineInterval}
          onChange={(e) => set({ fineInterval: e.target.value })} className={inputClass}>
          {LOAN_INTERVALS.map((iv) => <option key={iv} value={iv}>{INTERVAL_LABELS[iv]}</option>)}
        </select>
      </div>

      <div data-testid="contract-fine_rate_type">
        <label htmlFor="fineRateType" className="block text-sm text-gray-400 mb-1">
          Fine type{modified.includes('fine_rate_type') && <ModifiedMarker />}
        </label>
        <select id="fineRateType" value={form.fineRateType}
          onChange={(e) => set({ fineRateType: e.target.value })} className={inputClass}>
          {FINE_RATE_TYPES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      <div data-testid="contract-fine_rate">
        <label htmlFor="fineRate" className="block text-sm text-gray-400 mb-1">
          Fine rate{modified.includes('fine_rate') && <ModifiedMarker />}
        </label>
        <input id="fineRate" type="number" min="0" step="any" required value={form.fineRate}
          onChange={(e) => set({ fineRate: e.target.value })} className={inputClass} />
      </div>

      <div data-testid="contract-rate_change_condition">
        <label htmlFor="rateChangeCondition" className="block text-sm text-gray-400 mb-1">
          Rate change{modified.includes('rate_change_condition') && <ModifiedMarker />}
        </label>
        <select id="rateChangeCondition" value={form.rateChangeCondition}
          onChange={(e) => set({ rateChangeCondition: e.target.value })} className={inputClass}>
          {RATE_CHANGE_CONDITIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      <div data-testid="contract-rate_change_pct">
        <label htmlFor="rateChangePct" className="block text-sm text-gray-400 mb-1">
          Rate change %{modified.includes('rate_change_pct') && <ModifiedMarker />}
        </label>
        <input id="rateChangePct" type="number" min="0" step="any" value={form.rateChangePct}
          onChange={(e) => set({ rateChangePct: e.target.value })} className={inputClass} />
      </div>

      <div data-testid="contract-termination_clause">
        <label htmlFor="terminationClause" className="block text-sm text-gray-400 mb-1">
          Termination{modified.includes('termination_clause') && <ModifiedMarker />}
        </label>
        <input id="terminationClause" type="text" required value={form.terminationClause}
          onChange={(e) => set({ terminationClause: e.target.value })} className={inputClass} />
      </div>

      <p className="text-xs text-gray-500">ⓘ Modified fields are highlighted.</p>
    </fieldset>
  )
}
