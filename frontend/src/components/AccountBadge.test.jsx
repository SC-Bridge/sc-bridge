import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import AccountBadge from './AccountBadge'

const two = [
  { id: 1, label: 'Main', rsi_handle: 'Jean' },
  { id: 2, label: null, rsi_handle: 'Alt' },
  { id: 3, label: null, rsi_handle: null },
]

describe('AccountBadge', () => {
  it('renders nothing without an accounts list', () => {
    const { container } = render(<AccountBadge rsiAccountId={1} />)
    expect(container.textContent).toBe('')
  })

  it('renders nothing with 0 or 1 accounts', () => {
    expect(render(<AccountBadge rsiAccountId={1} accounts={[]} />).container.textContent).toBe('')
    expect(render(<AccountBadge rsiAccountId={1} accounts={[two[0]]} />).container.textContent).toBe('')
  })

  it('renders nothing for an unknown or missing account id', () => {
    expect(render(<AccountBadge rsiAccountId={99} accounts={two} />).container.textContent).toBe('')
    expect(render(<AccountBadge rsiAccountId={null} accounts={two} />).container.textContent).toBe('')
  })

  it('shows the label, then the RSI handle, then "Imported hangar"', () => {
    expect(render(<AccountBadge rsiAccountId={1} accounts={two} />).container.textContent).toBe('Main')
    expect(render(<AccountBadge rsiAccountId={2} accounts={two} />).container.textContent).toBe('Alt')
    expect(render(<AccountBadge rsiAccountId={3} accounts={two} />).container.textContent).toBe('Imported hangar')
  })
})
