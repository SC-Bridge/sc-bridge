import { useState } from 'react'
import { formatAUEC } from '../formatAUEC'
import { terminateWorkorder } from '../hooks'
import { orderRef, woRef } from '../orderMath'

// Termination settles an in-progress workorder (§5.4). Every still-open
// component starts selected — that is a FULL termination and the body carries
// no order_ids; deselecting any component switches to PARTIAL and sends the
// selected subset. The server owns the rules (partial keeps the workorder
// in progress, last-component partial completes it normally) — this modal
// only surfaces them.
export default function TerminateModal({ workorder, orders, suggestion, onClose, onSaved }) {
  // Closed components can't be terminated again — the server 400s on them.
  const openComponents = orders.filter((o) => o.status === 'open' || o.status === 'in_progress')
  const [selected, setSelected] = useState(() => openComponents.map((o) => o.id))
  const [terminatedBy, setTerminatedBy] = useState('counterparty')
  // null = no manual override → counterparty shows the server prefill (if any).
  const [override, setOverride] = useState(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const full = selected.length === openComponents.length
  // Full termination + counterparty prefills the SERVER's settlementPreview
  // suggestion verbatim — its §5.4 full scope spans ALL components (completed
  // ones included), which the open-components list can't see, so the client
  // never recomputes it. A partial subset has no client value either: blank
  // defers to the server, which defaults an omitted settlement_amount to
  // Σ-incurred over the terminated scope.
  const amountValue = override ?? (terminatedBy === 'counterparty' && full ? String(suggestion) : '')
  const amountOptional = terminatedBy === 'counterparty' && !full

  function toggle(id) {
    setSelected((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  }

  function setBy(value) {
    setTerminatedBy(value)
    // Field semantics flip with the terminator — drop any stale override.
    setOverride(null)
  }

  async function submit(e) {
    e.preventDefault()
    const trimmed = note.trim()
    if (!trimmed) {
      setError('A termination note is required — it becomes the dispute history')
      return
    }
    if (selected.length === 0) {
      setError('Select at least one component to terminate')
      return
    }
    const blank = String(amountValue).trim() === ''
    const amount = blank && amountOptional ? undefined : parseInt(amountValue, 10)
    if (amount !== undefined && (!Number.isInteger(amount) || amount < 0)) {
      setError(terminatedBy === 'you'
        ? 'Settlement amount is required when you terminate'
        : 'Settlement amount must be 0 or more')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await terminateWorkorder(workorder.id, {
        note: trimmed,
        terminated_by: terminatedBy,
        ...(amount === undefined ? {} : { settlement_amount: amount }),
        ...(full ? {} : { order_ids: selected }),
      })
      onSaved()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="bg-sc-dark border border-sc-border rounded-lg p-5 w-full max-w-md space-y-3 animate-fade-in max-h-[90vh] overflow-y-auto"
      >
        <h2 className="text-white font-medium">Terminate · {woRef(workorder.id)}</h2>
        <p className="text-sm text-gray-400">{workorder.title}</p>

        {error && <div role="alert" className="text-sm text-sc-danger">{error}</div>}

        <fieldset className="border border-sc-border rounded p-3 space-y-1">
          <legend className="text-xs uppercase tracking-wider text-gray-500 px-1">Components to terminate</legend>
          {openComponents.map((o) => (
            <label key={o.id} className="flex items-center gap-2 text-sm text-gray-300 py-0.5">
              <input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} />
              <span className="text-gray-400">{orderRef(o.id)}</span>
              <span className="text-white">{o.item}</span>
              <span className="ml-auto tabular-nums text-gray-500">incurred {formatAUEC(o.incurred)}</span>
            </label>
          ))}
          {!full && (
            <p className="text-xs text-sc-warn pt-1">
              Partial termination — only the selected components close; the workorder
              stays in progress unless this closes the last open component.
            </p>
          )}
        </fieldset>

        <fieldset className="space-y-1">
          <legend className="block text-sm text-gray-400 mb-1">Terminated by</legend>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="radio" name="terminated-by" value="counterparty"
              checked={terminatedBy === 'counterparty'} onChange={() => setBy('counterparty')} />
            Counterparty
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="radio" name="terminated-by" value="you"
              checked={terminatedBy === 'you'} onChange={() => setBy('you')} />
            You
          </label>
        </fieldset>

        <div>
          <label htmlFor="settlement" className="block text-sm text-gray-400 mb-1">Settlement amount (aUEC)</label>
          <input
            id="settlement"
            type="number"
            min="0"
            required={!amountOptional}
            value={amountValue}
            onChange={(e) => setOverride(e.target.value)}
            className="w-full bg-sc-darker border border-sc-border rounded px-2 py-1.5 text-sm"
          />
          {terminatedBy !== 'counterparty' ? (
            <p className="text-xs text-gray-500 mt-1">
              Counterparty costs aren&apos;t on your books — enter the agreed amount (0 is legal).
            </p>
          ) : full ? (
            <p className="text-xs text-gray-500 mt-1">
              Suggestion — the server&apos;s incurred costs across the workorder: {formatAUEC(suggestion)}. Override freely; 0 is legal.
            </p>
          ) : (
            <p className="text-xs text-gray-500 mt-1">
              Leave blank to accept the server&apos;s incurred-costs suggestion for the selected components, or enter an agreed amount (0 is legal).
            </p>
          )}
        </div>

        <div>
          <label htmlFor="termination-note" className="block text-sm text-gray-400 mb-1">Termination note</label>
          <textarea
            id="termination-note"
            rows={3}
            required
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full bg-sc-darker border border-sc-border rounded px-2 py-1.5 text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">Mandatory — recorded on the settlement entry as dispute history.</p>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="text-sm text-gray-400 px-3 py-1.5">Cancel</button>
          <button
            type="submit"
            disabled={saving}
            className="bg-sc-danger/20 text-sc-danger border border-sc-danger/40 rounded px-4 py-1.5 text-sm hover:bg-sc-danger/30 disabled:opacity-50"
          >
            {saving ? 'Terminating…' : 'Terminate workorder'}
          </button>
        </div>
      </form>
    </div>
  )
}
