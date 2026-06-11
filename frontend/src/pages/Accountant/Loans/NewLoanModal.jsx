import { useState } from 'react'
import { LOAN_INTERVALS, LOAN_DIRECTIONS } from '../constants'
import { INTERVAL_LABELS } from '../loanMath'
import { createLoan } from '../hooks'

// Loan terms (direction, counterparty, principal, rate, interval, fee, started_at) are
// locked at creation — only notes and due_at are editable afterwards (design §4.2).
export default function NewLoanModal({ onClose, onSaved }) {
  const [direction, setDirection] = useState('outgoing')
  const [counterparty, setCounterparty] = useState('')
  const [principal, setPrincipal] = useState('')
  const [interestRate, setInterestRate] = useState('')
  const [interestInterval, setInterestInterval] = useState('monthly')
  const [feeMultiplier, setFeeMultiplier] = useState('0')
  const [startedAt, setStartedAt] = useState(() => {
    const now = new Date()
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
    return now.toISOString().slice(0, 16)
  })
  const [dueAt, setDueAt] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const body = {
      direction,
      counterparty,
      principal: parseInt(principal, 10),
      interest_rate: parseFloat(interestRate),
      interest_interval: interestInterval,
      fee_multiplier: parseFloat(feeMultiplier) || 0,
      started_at: new Date(startedAt).toISOString(),
      ...(dueAt ? { due_at: new Date(dueAt).toISOString() } : {}),
      ...(notes ? { notes } : {}),
    }
    try {
      await createLoan(body)
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
        <h2 className="text-white font-medium">New Loan</h2>

        {error && <div role="alert" className="text-sm text-sc-danger">{error}</div>}

        <div>
          <label htmlFor="direction" className="block text-sm text-gray-400 mb-1">Direction</label>
          <select id="direction" value={direction} onChange={(e) => setDirection(e.target.value)}
            className="w-full bg-sc-darker border border-sc-border rounded px-2 py-1.5 text-sm">
            {LOAN_DIRECTIONS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="counterparty" className="block text-sm text-gray-400 mb-1">Counterparty</label>
          <input id="counterparty" type="text" required value={counterparty}
            onChange={(e) => setCounterparty(e.target.value)}
            className="w-full bg-sc-darker border border-sc-border rounded px-2 py-1.5 text-sm" />
        </div>

        <div>
          <label htmlFor="principal" className="block text-sm text-gray-400 mb-1">Principal (aUEC)</label>
          <input id="principal" type="number" min="1" required value={principal}
            onChange={(e) => setPrincipal(e.target.value)}
            className="w-full bg-sc-darker border border-sc-border rounded px-2 py-1.5 text-sm" />
        </div>

        <div>
          <label htmlFor="interestRate" className="block text-sm text-gray-400 mb-1">Interest rate (%)</label>
          <input id="interestRate" type="number" min="0" step="0.01" required value={interestRate}
            onChange={(e) => setInterestRate(e.target.value)}
            className="w-full bg-sc-darker border border-sc-border rounded px-2 py-1.5 text-sm" />
        </div>

        <div>
          <label htmlFor="interestInterval" className="block text-sm text-gray-400 mb-1">Interval</label>
          <select id="interestInterval" value={interestInterval}
            onChange={(e) => setInterestInterval(e.target.value)}
            className="w-full bg-sc-darker border border-sc-border rounded px-2 py-1.5 text-sm">
            {LOAN_INTERVALS.map((iv) => (
              <option key={iv} value={iv}>{INTERVAL_LABELS[iv]}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="feeMultiplier" className="block text-sm text-gray-400 mb-1">Fee multiplier</label>
          <input id="feeMultiplier" type="number" min="0" step="0.01" value={feeMultiplier}
            onChange={(e) => setFeeMultiplier(e.target.value)}
            className="w-full bg-sc-darker border border-sc-border rounded px-2 py-1.5 text-sm" />
        </div>

        <div>
          <label htmlFor="startedAt" className="block text-sm text-gray-400 mb-1">Start date/time</label>
          <input id="startedAt" type="datetime-local" required value={startedAt}
            onChange={(e) => setStartedAt(e.target.value)}
            className="w-full bg-sc-darker border border-sc-border rounded px-2 py-1.5 text-sm" />
        </div>

        <div>
          <label htmlFor="dueAt" className="block text-sm text-gray-400 mb-1">Due date/time (optional)</label>
          <input id="dueAt" type="datetime-local" value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className="w-full bg-sc-darker border border-sc-border rounded px-2 py-1.5 text-sm" />
        </div>

        <div>
          <label htmlFor="notes" className="block text-sm text-gray-400 mb-1">Notes (optional)</label>
          <textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
            className="w-full bg-sc-darker border border-sc-border rounded px-2 py-1.5 text-sm" />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="text-sm text-gray-400 px-3 py-1.5">Cancel</button>
          <button type="submit" disabled={saving}
            className="bg-sc-accent/20 text-sc-accent border border-sc-accent/40 rounded px-4 py-1.5 text-sm hover:bg-sc-accent/30 disabled:opacity-50">
            {saving ? 'Creating…' : 'Create loan'}
          </button>
        </div>
      </form>
    </div>
  )
}
