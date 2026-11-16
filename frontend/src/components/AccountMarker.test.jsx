import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import AccountMarker from './AccountMarker'

const accts = [
  { id: 1, label: 'Main', color: '#22d3ee' },
  { id: 2, rsi_handle: 'RASKYL', color: '#f97316' },
  { id: 3, label: null, rsi_handle: null, color: '#a855f7' },
]

describe('AccountMarker', () => {
  it('renders nothing with one account', () => {
    const { container } = render(<AccountMarker rsiAccountId={1} accounts={[accts[0]]} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing without a list or when the row has no account', () => {
    expect(render(<AccountMarker rsiAccountId={1} />).container.innerHTML).toBe('')
    expect(render(<AccountMarker rsiAccountId={null} accounts={accts} />).container.innerHTML).toBe('')
    expect(render(<AccountMarker rsiAccountId={99} accounts={accts} />).container.innerHTML).toBe('')
  })

  it('draws a stripe and an avatar in the account colour', () => {
    render(<AccountMarker rsiAccountId={2} accounts={accts} />)
    const avatar = screen.getByRole('img', { name: 'RASKYL' })
    expect(avatar.style.backgroundColor).toBe('rgb(249, 115, 22)')
    expect(avatar.textContent).toBe('R')
    expect(screen.getByTestId('account-stripe').style.backgroundColor).toBe('rgb(249, 115, 22)')
  })

  it('falls back when label and handle are empty', () => {
    render(<AccountMarker rsiAccountId={3} accounts={accts} />)
    const avatar = screen.getByRole('img', { name: 'Imported hangar' })
    expect(avatar.textContent).toBe('I')
  })

  it('cell variant shows an inline dot without an absolute stripe', () => {
    render(<AccountMarker rsiAccountId={1} accounts={accts} variant="cell" />)
    expect(screen.getByRole('img', { name: 'Main' })).toBeTruthy()
    expect(screen.queryByTestId('account-stripe')).toBeNull()
  })
})
