import React, { useState } from 'react'
import { Users, Star, Pencil, Trash2, AlertCircle, Check } from 'lucide-react'
import PanelSection from '../../components/PanelSection'
import ConfirmDialog from '../../components/ConfirmDialog'
import { useRsiAccounts, updateRsiAccount, deleteRsiAccount } from '../../hooks/useAPI'
import { Pill } from '../HangarCleanup/ui'

const accountName = (a) => a.label || a.rsi_handle || 'Imported hangar'

export default function RsiAccountsSection() {
  const { data, loading, error: loadError, refetch } = useRsiAccounts()
  const [editingId, setEditingId] = useState(null)
  const [labelDraft, setLabelDraft] = useState('')
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const accounts = data?.accounts || []

  const run = async (fn) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      refetch()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const saveLabel = (a) => run(async () => {
    await updateRsiAccount(a.id, { label: labelDraft.trim() })
    setEditingId(null)
  })

  const confirmDelete = () => {
    const target = deleting
    setDeleting(null)
    return run(() => deleteRsiAccount(target.id))
  }

  return (
    <div id="section-rsi-accounts" className="scroll-mt-16">
      <PanelSection title="RSI accounts" icon={Users}>
        <div className="p-5 space-y-3 max-w-2xl">
          {(error || loadError) && (
            <div className="flex items-center gap-2 p-3 bg-sc-danger/10 border border-sc-danger/30 rounded text-sc-danger text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error || loadError}</span>
            </div>
          )}
          {!loading && accounts.length === 0 && !loadError && (
            <p className="text-sm text-gray-400">No RSI accounts yet. Sync your hangar with the extension to add one.</p>
          )}
          <ul className="space-y-2">
            {accounts.map((a) => (
              <li key={a.id} className="p-3 bg-sc-darker border border-sc-border rounded-lg space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {editingId === a.id ? (
                    <>
                      <input
                        aria-label="Account label"
                        value={labelDraft}
                        maxLength={40}
                        onChange={(e) => setLabelDraft(e.target.value)}
                        className="px-2 py-1 bg-sc-dark border border-sc-border rounded text-sm text-white focus:border-sc-accent focus:outline-none"
                      />
                      <button type="button" disabled={busy} onClick={() => saveLabel(a)} className="btn-primary px-2 py-1 text-xs flex items-center gap-1 cursor-pointer disabled:opacity-50">
                        <Check className="w-3 h-3" /> Save
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} className="text-xs text-gray-400 hover:text-white cursor-pointer">Cancel</button>
                    </>
                  ) : (
                    <>
                      <span className="font-display text-sm text-white">{accountName(a)}</span>
                      {a.is_primary && <Pill tone="good"><Star className="w-3 h-3 mr-1" aria-hidden="true" />Primary</Pill>}
                      {a.is_placeholder && <Pill tone="warn" title="Synced without Account Info">Imported</Pill>}
                      {!a.is_placeholder && !a.verified && <Pill tone="mute">Unverified</Pill>}
                    </>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  {a.rsi_handle ? `@${a.rsi_handle} · ` : ''}{a.ship_count} ships · {a.pledge_count} pledges
                </p>
                {editingId !== a.id && (
                  <div className="flex flex-wrap gap-3 text-xs">
                    {!a.is_primary && (
                      <button type="button" disabled={busy} onClick={() => run(() => updateRsiAccount(a.id, { is_primary: true }))} className="text-sc-accent hover:underline cursor-pointer disabled:opacity-50">
                        Set as primary
                      </button>
                    )}
                    <button type="button" onClick={() => { setEditingId(a.id); setLabelDraft(a.label || '') }} className="text-gray-400 hover:text-white inline-flex items-center gap-1 cursor-pointer">
                      <Pencil className="w-3 h-3" /> Rename
                    </button>
                    <button type="button" onClick={() => setDeleting(a)} className="text-sc-danger hover:underline inline-flex items-center gap-1 cursor-pointer">
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </PanelSection>
      <ConfirmDialog
        open={!!deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
        title="Delete RSI account"
        message={deleting
          ? `Delete ${accountName(deleting)} and its ${deleting.ship_count} ship${deleting.ship_count === 1 ? '' : 's'}? This account's ships, pledges, buy-backs and paints will be removed. This cannot be undone.`
          : ''}
        confirmLabel="Delete account"
        variant="danger"
      />
    </div>
  )
}
