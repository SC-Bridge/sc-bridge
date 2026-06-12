import { useState } from 'react'
import { forgiveLoan } from '../hooks'
import { formatAUEC } from '../formatAUEC'

// RepaymentModal twin (design §5.6). No date field by design: the forgiveness
// entry posts at server now, and the API auto-settles the loan at exactly 0.
export default function ForgiveModal({ loan, onClose, onSaved }) {
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  async function submit(e) {
    e.preventDefault()
    const parsed = parseInt(amount, 10)
    if (!parsed || parsed < 1) {
      setError('Amount must be at least 1')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await forgiveLoan(loan.id, {
        amount: parsed,
        ...(notes ? { notes } : {}),
      })
      onSaved()
    } catch (err) {
      setError(`${err.message} — outstanding is ${formatAUEC(err.details?.outstanding ?? loan.outstanding)}`)
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
        <h2 className="text-white font-medium">Forgive loan · {loan.counterparty}</h2>
        <p className="text-sm text-gray-400">Outstanding: {formatAUEC(loan.outstanding)}</p>
        <p className="text-sm text-gray-400">
          {loan.direction === 'outgoing'
            ? 'You absorb this as a loss (P&L expense).'
            : 'Booked as debt relief (P&L income).'}
        </p>

        {error && <div role="alert" className="text-sm text-sc-danger">{error}</div>}

        <div>
          <label htmlFor="forgiveAmount" className="block text-sm text-gray-400 mb-1">Forgive amount (aUEC)</label>
          <input
            id="forgiveAmount"
            type="number"
            min="1"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-sc-darker border border-sc-border rounded px-2 py-1.5 text-sm"
          />
        </div>

        <div>
          <label htmlFor="forgiveNotes" className="block text-sm text-gray-400 mb-1">Notes (optional)</label>
          <textarea
            id="forgiveNotes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full bg-sc-darker border border-sc-border rounded px-2 py-1.5 text-sm"
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="text-sm text-gray-400 px-3 py-1.5">Cancel</button>
          <button
            type="submit"
            disabled={saving}
            className="bg-sc-accent/20 text-sc-accent border border-sc-accent/40 rounded px-4 py-1.5 text-sm hover:bg-sc-accent/30 disabled:opacity-50"
          >
            {saving ? 'Forgiving…' : 'Forgive'}
          </button>
        </div>
      </form>
    </div>
  )
}
