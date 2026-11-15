import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SyncMappingDialog from './SyncMappingDialog'

const accounts = [
  { id: 1, label: 'Main', rsi_handle: 'Jean', is_placeholder: false, overlap: 12 },
  { id: 2, label: null, rsi_handle: null, is_placeholder: true, overlap: 3 },
]
const base = { error: 'needs_mapping', identity: { handle: 'Newbie', referral_code: 'STAR-1' }, candidate_id: 1, accounts, can_add: true }

function setup(over = {}) {
  const onResolve = vi.fn()
  const onCancel = vi.fn()
  render(<SyncMappingDialog mapping={{ ...base, reason: 'unknown', ...over }} onResolve={onResolve} onCancel={onCancel} />)
  return { onResolve, onCancel }
}

describe('SyncMappingDialog', () => {
  it('renders the unknown reason line', () => {
    setup()
    expect(screen.getByText('Which RSI account is this?')).toBeTruthy()
    expect(screen.getByText('Newbie').tagName).toBe('STRONG')
    expect(screen.getByText(/isn't one of your RSI accounts yet/)).toBeTruthy()
  })

  it('renders the partial reason line with the candidate label', () => {
    setup({ reason: 'partial' })
    expect(screen.getByText(/but the handle or referral code has changed/)).toBeTruthy()
    expect(screen.getByText('Main', { selector: 'strong' })).toBeTruthy()
  })

  it('renders the no_identity reason line', () => {
    setup({ reason: 'no_identity' })
    expect(screen.getByText(/Account Info was not included in this sync/)).toBeTruthy()
  })

  it('hides "Add as a new account" when can_add is false', () => {
    setup({ can_add: false })
    expect(screen.queryByText('Add as a new account')).toBeNull()
  })

  it('resolves a click on an account as a map', () => {
    const { onResolve } = setup()
    expect(screen.getByText('12 of these pledges are already in this account')).toBeTruthy()
    fireEvent.click(screen.getByText('This is Main'))
    expect(onResolve).toHaveBeenCalledWith({ mode: 'map', rsi_account_id: 1 })
  })

  it('resolves add-new', () => {
    const { onResolve } = setup()
    fireEvent.click(screen.getByText('Add as a new account'))
    expect(onResolve).toHaveBeenCalledWith({ mode: 'new' })
  })

  it('offers no dead buttons when no_identity and every account is a placeholder', () => {
    const { onCancel } = setup({ reason: 'no_identity', accounts: [accounts[1]] })
    expect(screen.queryByText(/^This is /)).toBeNull()
    expect(screen.queryByText('Add as a new account')).toBeNull()
    expect(screen.getByText(/in the sync options and sync again/)).toBeTruthy()
    fireEvent.click(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalled()
  })

  it('shows the single-account variant when can_add is false with one account', () => {
    const { onResolve } = setup({ can_add: false, accounts: [accounts[0]] })
    expect(screen.getByText('This sync is for a different RSI account')).toBeTruthy()
    fireEvent.click(screen.getByText(/Replace Main.s hangar/))
    expect(onResolve).toHaveBeenCalledWith({ mode: 'map', rsi_account_id: 1 })
  })
})
