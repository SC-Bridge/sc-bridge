import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import PaintsSection from './PaintsSection'

vi.mock('../../hooks/useAPI', () => ({
  useShipPaints: () => ({
    data: [
      { id: 1, name: 'Paint On Main' },
      { id: 2, name: 'Paint On Alt' },
      { id: 3, name: 'Paint Owned Nowhere' },
    ],
    loading: false,
  }),
  useOwnedPaints: () => ({
    ownedSet: new Set([1, 2]),
    ownedPaints: [
      { paint_id: 1, rsi_account_id: 10 },
      { paint_id: 2, rsi_account_id: 20 },
    ],
    loading: false,
  }),
  equipFleetPaint: vi.fn(),
}))

describe('PaintsSection', () => {
  it("offers only the paints owned on the ship's own account", () => {
    render(<PaintsSection shipSlug="x" fleetId={1} rsiAccountId={10} equippedPaintId={null} />)
    expect(screen.getByText('Paint On Main')).toBeInTheDocument()
    expect(screen.queryByText('Paint On Alt')).toBeNull()
    expect(screen.queryByText('Paint Owned Nowhere')).toBeNull()
  })

  it('falls back to every owned paint when the ship has no account', () => {
    render(<PaintsSection shipSlug="x" fleetId={1} rsiAccountId={null} equippedPaintId={null} />)
    expect(screen.getByText('Paint On Main')).toBeInTheDocument()
    expect(screen.getByText('Paint On Alt')).toBeInTheDocument()
  })
})
