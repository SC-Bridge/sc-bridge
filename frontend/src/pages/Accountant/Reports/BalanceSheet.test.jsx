import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import BalanceSheet from './BalanceSheet'

const BODY = {
  at: '2026-06-11T00:00:00.000Z',
  assets: 5000000,
  liabilities: 1200000,
  equity: 3800000,
  netWorth: 3800000,
}

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
    ok: true, status: 200, json: async () => BODY,
  }))
})

describe('Balance Sheet page', () => {
  it('renders net worth, assets, and liabilities cards', async () => {
    render(<MemoryRouter><BalanceSheet /></MemoryRouter>)
    await waitFor(() => expect(screen.getAllByText('3,800,000 aUEC').length).toBeGreaterThan(0))
    expect(screen.getAllByText('5,000,000 aUEC').length).toBeGreaterThan(0)
    expect(screen.getAllByText('1,200,000 aUEC').length).toBeGreaterThan(0)
  })
})
