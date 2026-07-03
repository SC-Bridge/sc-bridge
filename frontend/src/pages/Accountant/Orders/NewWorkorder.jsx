// Workorder composition is a ROUTE, not a modal — the inline-order sub-form,
// attach picker and contract section don't fit a dialog (design §7, UX B.5).
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import PageHeader from '../../../components/PageHeader'
import { CATEGORY_LABELS, STATUS_LABELS } from '../constants'
import { createWorkorder, useOrders } from '../hooks'
import { formatAUEC, parseAUEC } from '../formatAUEC'
import { localDatetimeNow } from '../datetime'
import { modifiedContractFields, orderRef, orderTotal } from '../orderMath'
import {
  CONTRACT_FORM_INITIAL, ContractFields, FundRejectionPanel, ORDER_CORE_INITIAL,
  OrderCoreFields, contractBody, contractFromForm, inputClass, orderCoreBody,
} from './OrderFields'

const TYPE_LABELS = { sale: 'Sales', purchase: 'Purchase' }

// Checkbox list of existing standalone OPEN orders. The list endpoint has no
// standalone filter — workorder_id === null is filtered client-side.
function AttachPicker({ checked, onToggle }) {
  const { data, error, loading } = useOrders('status=open')

  if (loading && !data) return <p className="text-sm text-gray-500">Loading open orders…</p>
  if (error) return <p className="text-sm text-sc-danger">{error.message}</p>

  const standalone = (data.orders ?? []).filter((o) => o.workorder_id === null)
  if (standalone.length === 0) {
    return <p className="text-sm text-gray-500">No standalone open orders to attach.</p>
  }

  // The list endpoint pages at 50; this picker isn't paged, so warn honestly
  // when open orders beyond the first page can't be reached from here.
  const capped = (data.total ?? 0) > (data.orders?.length ?? 0)

  return (
    <div className="space-y-1" data-testid="attach-picker">
      {standalone.map((o) => (
        <label key={o.id} className="flex items-center gap-2 text-sm text-gray-300 py-0.5">
          <input type="checkbox" checked={checked.includes(o.id)} onChange={() => onToggle(o.id)} />
          <span className="text-gray-400">{orderRef(o.id)}</span>
          <span className="text-white">{o.item}</span>
          <span className="text-gray-500">{TYPE_LABELS[o.type]} · {CATEGORY_LABELS[o.category]}</span>
          <span className="ml-auto tabular-nums">{formatAUEC(o.total)}</span>
        </label>
      ))}
      {capped && (
        <p className="text-xs text-gray-500 pt-1">
          Showing the first {data.orders.length} of {data.total} open orders — refine or complete orders to see more.
        </p>
      )}
    </div>
  )
}

// Trimmed NewOrderModal field set: core fields only — inline component orders
// take the contract template defaults and start now (CreateOrderSchema fills
// the rest server-side).
function InlineOrderForm({ onAdd }) {
  const [form, setForm] = useState(ORDER_CORE_INITIAL)
  const [error, setError] = useState(null)

  const qty = parseFloat(form.quantity)
  // Strict money parse — preview and orderCoreBody share one value.
  const price = parseAUEC(form.pricePerUnit)

  function add() {
    if (!form.category || !form.item.trim() || !(qty > 0) || !(price > 0)) {
      setError('Category, item, quantity and price are required')
      return
    }
    setError(null)
    onAdd({ ...orderCoreBody(form), start_at: new Date().toISOString() })
    setForm(ORDER_CORE_INITIAL)
  }

  // This sub-form sits INSIDE the page <form>: HTML implicit submission would
  // route Enter in any of these inputs to "Create draft", discarding the
  // half-composed component order. Enter here means "Add order".
  function trapEnter(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      add()
    }
  }

  return (
    <div className="space-y-3" data-testid="inline-order-form" onKeyDown={trapEnter}>
      {error && <p role="alert" className="text-sm text-sc-danger">{error}</p>}
      <OrderCoreFields form={form} onChange={setForm} required={false} />
      {qty > 0 && price > 0 && (
        <p className="text-sm text-gray-300">
          Total: <span className="text-white tabular-nums">{formatAUEC(orderTotal(qty, price))}</span>
        </p>
      )}
      <button type="button" onClick={add}
        className="bg-sc-accent/20 text-sc-accent border border-sc-accent/40 rounded px-3 py-1.5 text-sm hover:bg-sc-accent/30">
        Add order
      </button>
    </div>
  )
}

function ComponentList({ inlineOrders, onRemove }) {
  if (inlineOrders.length === 0) return null
  return (
    <ul className="space-y-1" data-testid="component-list">
      {inlineOrders.map((o, i) => (
        <li key={i} className="flex items-center gap-2 text-sm text-gray-300">
          <span className="text-gray-500">{TYPE_LABELS[o.type]}</span>
          <span className="text-white">{o.item}</span>
          <span className="tabular-nums">{formatAUEC(orderTotal(o.quantity, o.price_per_unit))}</span>
          <button type="button" onClick={() => onRemove(i)} className="ml-auto text-xs text-gray-500 hover:text-sc-danger">
            Remove
          </button>
        </li>
      ))}
    </ul>
  )
}

export default function NewWorkorder() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [counterparty, setCounterparty] = useState('')
  const [startAt, setStartAt] = useState(localDatetimeNow)
  const [contractForm, setContractForm] = useState(CONTRACT_FORM_INITIAL)
  const [inlineOrders, setInlineOrders] = useState([])
  const [attachedIds, setAttachedIds] = useState([])
  const [error, setError] = useState(null)
  const [fundError, setFundError] = useState(null)
  const [saving, setSaving] = useState(false)

  const contract = contractFromForm(contractForm)
  const modified = modifiedContractFields(contract)
  const componentCount = inlineOrders.length + attachedIds.length

  function toggleAttached(id) {
    setAttachedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  }

  async function submit(e) {
    e.preventDefault()
    // No component minimum here — the server allows drafts with 0–1 components
    // (more get attached later from the detail page). The ≥2-OPEN rule gates
    // PUBLISH, where WorkorderDetail surfaces it.
    setSaving(true)
    setError(null)
    setFundError(null)
    const body = {
      title: title.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(counterparty.trim() ? { counterparty: counterparty.trim() } : {}),
      start_at: new Date(startAt).toISOString(),
      ...contractBody(contract),
      ...(inlineOrders.length > 0 ? { orders: inlineOrders } : {}),
      ...(attachedIds.length > 0 ? { order_ids: attachedIds } : {}),
    }
    try {
      const res = await createWorkorder(body)
      navigate(`/accountant/orders/workorders/${res.id}`)
    } catch (err) {
      if (err.details?.balance !== undefined) setFundError(err.details)
      else setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        title="NEW WORKORDER"
        subtitle={`Compose component orders under one contract — created as ${STATUS_LABELS.draft.toLowerCase()}, published when ready`}
      />

      <form onSubmit={submit} className="max-w-2xl space-y-6">
        {error && <div role="alert" className="text-sm text-sc-danger">{error}</div>}
        {fundError && <FundRejectionPanel details={fundError} />}

        <section className="panel p-4 space-y-3">
          <h3 className="text-xs uppercase tracking-wider text-gray-500">Details</h3>
          <div>
            <label htmlFor="title" className="block text-sm text-gray-400 mb-1">Title</label>
            <input id="title" type="text" required maxLength={200} value={title}
              onChange={(e) => setTitle(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="description" className="block text-sm text-gray-400 mb-1">Description (optional)</label>
            <textarea id="description" rows={2} maxLength={2000} value={description}
              onChange={(e) => setDescription(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="counterparty" className="block text-sm text-gray-400 mb-1">Counterparty (optional)</label>
            <input id="counterparty" type="text" maxLength={100} value={counterparty}
              onChange={(e) => setCounterparty(e.target.value)} className={inputClass} />
          </div>
        </section>

        <section className="panel p-4 space-y-3">
          <ContractFields form={contractForm} onChange={setContractForm} modified={modified}>
            <div>
              <label htmlFor="startAt" className="block text-sm text-gray-400 mb-1">Start date/time</label>
              <input id="startAt" type="datetime-local" required value={startAt}
                onChange={(e) => setStartAt(e.target.value)} className={inputClass} />
            </div>
          </ContractFields>
        </section>

        <section className="panel p-4 space-y-4">
          <h3 className="text-xs uppercase tracking-wider text-gray-500">
            Component orders ({componentCount})
          </h3>
          <ComponentList inlineOrders={inlineOrders}
            onRemove={(i) => setInlineOrders((list) => list.filter((_, idx) => idx !== i))} />

          <fieldset className="border border-sc-border rounded p-3 space-y-3">
            <legend className="text-xs uppercase tracking-wider text-gray-500 px-1">Add a new order</legend>
            <InlineOrderForm onAdd={(o) => setInlineOrders((list) => [...list, o])} />
          </fieldset>

          <fieldset className="border border-sc-border rounded p-3 space-y-2">
            <legend className="text-xs uppercase tracking-wider text-gray-500 px-1">Attach existing open orders</legend>
            <AttachPicker checked={attachedIds} onToggle={toggleAttached} />
          </fieldset>
        </section>

        <div className="flex justify-end gap-2">
          <Link to="/accountant/orders/workorders" className="text-sm text-gray-400 px-3 py-1.5">Cancel</Link>
          <button type="submit" disabled={saving}
            className="bg-sc-accent/20 text-sc-accent border border-sc-accent/40 rounded px-4 py-1.5 text-sm hover:bg-sc-accent/30 disabled:opacity-50">
            {saving ? 'Creating…' : 'Create draft'}
          </button>
        </div>
      </form>
    </div>
  )
}
