import { useState } from 'react'
import { createOrder } from '../hooks'
import { formatAUEC, parseAUEC } from '../formatAUEC'
import { localDatetimeNow } from '../datetime'
import { modifiedContractFields, orderTotal } from '../orderMath'
import {
  CONTRACT_FORM_INITIAL, ContractFields, FundRejectionPanel, ORDER_CORE_INITIAL,
  OrderCoreFields, contractBody, contractFromForm, inputClass, orderCoreBody,
} from './OrderFields'

export default function NewOrderModal({ onClose, onSaved }) {
  const [core, setCore] = useState(ORDER_CORE_INITIAL)
  const [startAt, setStartAt] = useState(localDatetimeNow)
  const [contractForm, setContractForm] = useState(CONTRACT_FORM_INITIAL)
  const [error, setError] = useState(null)
  const [fundError, setFundError] = useState(null)
  const [saving, setSaving] = useState(false)

  const contract = contractFromForm(contractForm)
  const modified = modifiedContractFields(contract)

  const qty = parseFloat(core.quantity)
  // Strict money parse: the preview and the posted body share one value, so
  // '1e5' (which parseInt would truncate to 1) is rejected, never booked.
  const price = parseAUEC(core.pricePerUnit)
  const total = qty > 0 && price > 0 ? orderTotal(qty, price) : null

  async function submit(e) {
    e.preventDefault()
    if (!(qty > 0) || !(price > 0)) {
      setError(price === null && core.pricePerUnit.trim() !== ''
        ? 'Price must be a whole number of aUEC (digits only)'
        : 'Quantity and price must be greater than 0')
      return
    }
    setSaving(true)
    setError(null)
    setFundError(null)
    const body = {
      ...orderCoreBody(core),
      start_at: new Date(startAt).toISOString(),
      ...contractBody(contract),
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

        <OrderCoreFields form={core} onChange={setCore} />

        {total !== null && (
          <p className="text-sm text-gray-300">
            Total: <span className="text-white tabular-nums">{formatAUEC(total)}</span>
          </p>
        )}

        <ContractFields form={contractForm} onChange={setContractForm} modified={modified}>
          <div>
            <label htmlFor="startAt" className="block text-sm text-gray-400 mb-1">Start date/time</label>
            <input id="startAt" type="datetime-local" required value={startAt}
              onChange={(e) => setStartAt(e.target.value)} className={inputClass} />
          </div>
        </ContractFields>

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
