import { describe, it, expect } from 'vitest'
import { accountName, accountInitial, accountColor, ACCOUNT_COLORS } from './accounts'

describe('accounts helpers', () => {
  it('names by label, then handle, then fallback', () => {
    expect(accountName({ label: 'Main', rsi_handle: 'J' })).toBe('Main')
    expect(accountName({ label: null, rsi_handle: 'Alt' })).toBe('Alt')
    expect(accountName({})).toBe('Imported hangar')
  })
  it('upper-cases the first character as initial', () => {
    expect(accountInitial({ rsi_handle: 'raskyl' })).toBe('R')
  })
  it('uses the stored colour, else the palette by index', () => {
    expect(accountColor({ color: '#123456' }, 3)).toBe('#123456')
    expect(accountColor({ color: null }, 12)).toBe(ACCOUNT_COLORS[2])
  })
})
