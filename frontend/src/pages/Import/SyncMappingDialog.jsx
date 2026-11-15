import React from 'react'
import { User } from 'lucide-react'

const accountName = (a) => a.label || a.rsi_handle || 'Imported hangar'

function ReasonLine({ mapping, accounts }) {
  if (mapping.reason === 'unknown') {
    return (
      <p className="text-sm text-gray-400">
        This sync is from <strong className="text-white">{mapping.identity?.handle || 'an unknown handle'}</strong>, which isn&apos;t one of your RSI accounts yet.
      </p>
    )
  }
  if (mapping.reason === 'partial') {
    const candidate = accounts.find((a) => a.id === mapping.candidate_id)
    return (
      <p className="text-sm text-gray-400">
        This looks like <strong className="text-white">{candidate ? accountName(candidate) : 'one of your accounts'}</strong>, but the handle or referral code has changed.
      </p>
    )
  }
  return (
    <p className="text-sm text-gray-400">
      Account Info was not included in this sync, so SC Bridge can&apos;t tell which account it is from.
    </p>
  )
}

/**
 * Shown when the server answers 409 needs_mapping. `mapping` is that 409 body;
 * onResolve gets { mode: 'new' } or { mode: 'map', rsi_account_id }.
 */
export default function SyncMappingDialog({ mapping, onResolve, onCancel }) {
  if (!mapping) return null
  const accounts = mapping.accounts || []
  const noIdentity = mapping.reason === 'no_identity'
  // With no identity in the sync, only an account with a real identity can take it.
  const mappable = noIdentity ? accounts.filter((a) => !a.is_placeholder) : accounts
  const dead = noIdentity && mappable.length === 0
  const single = !dead && !mapping.can_add && accounts.length === 1

  const cancelBtn = (
    <button type="button" onClick={onCancel} className="btn-secondary px-3 py-2 text-xs font-display tracking-wider uppercase cursor-pointer">
      Cancel
    </button>
  )

  let title = 'Which RSI account is this?'
  let body
  if (dead) {
    body = (
      <>
        <ReasonLine mapping={mapping} accounts={accounts} />
        <p className="text-sm text-gray-400">
          Tick <strong className="text-white">Account Info</strong> in the sync options and sync again so SC Bridge can tell which account this is.
        </p>
        <div className="flex justify-end">{cancelBtn}</div>
      </>
    )
  } else if (single) {
    const only = accounts[0]
    title = 'This sync is for a different RSI account'
    body = (
      <>
        <ReasonLine mapping={mapping} accounts={accounts} />
        <div className="flex flex-wrap gap-2 justify-end">
          {cancelBtn}
          <button
            type="button"
            onClick={() => onResolve({ mode: 'map', rsi_account_id: only.id })}
            className="btn-primary px-3 py-2 text-xs font-display tracking-wider uppercase cursor-pointer"
          >
            Replace {accountName(only)}&apos;s hangar
          </button>
        </div>
      </>
    )
  } else {
    body = (
      <>
        <ReasonLine mapping={mapping} accounts={accounts} />
        <div className="space-y-2">
          {mapping.can_add && (
            <button
              type="button"
              onClick={() => onResolve({ mode: 'new' })}
              className="w-full text-left p-3 rounded border border-sc-accent/40 bg-sc-accent/5 hover:bg-sc-accent/10 text-sm text-white cursor-pointer"
            >
              Add as a new account
            </button>
          )}
          {mappable.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onResolve({ mode: 'map', rsi_account_id: a.id })}
              className="w-full text-left p-3 rounded border border-sc-border hover:border-sc-accent/40 hover:bg-white/[0.03] cursor-pointer"
            >
              <span className="block text-sm text-white">This is {accountName(a)}</span>
              <span className="block text-xs text-gray-500 mt-0.5">
                {a.overlap} of these pledges are already in this account
              </span>
            </button>
          ))}
        </div>
        <div className="flex justify-end">{cancelBtn}</div>
      </>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="sync-mapping-title" className="panel p-6 w-[440px] max-w-full space-y-4 animate-fade-in-up">
        <div className="flex items-start gap-3">
          <User className="w-5 h-5 text-sc-accent2 shrink-0 mt-0.5" aria-hidden="true" />
          <h3 id="sync-mapping-title" className="font-display font-semibold text-white text-base">{title}</h3>
        </div>
        {body}
      </div>
    </div>
  )
}
