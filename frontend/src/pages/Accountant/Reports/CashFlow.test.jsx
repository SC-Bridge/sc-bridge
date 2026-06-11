import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CashFlow from './CashFlow'

const BODY = { from: 'a', to: 'b', interval: 'daily', series: [
  { bucket: '2026-06-01', in: 100000, out: -30000, net: 70000 },
  { bucket: '2026-06-02', in: 0, out: -5000, net: -5000 },
] }

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
    ok: true, status: 200, json: async () => BODY,
  }))
})

describe('Cash Flow page', () => {
  it('renders in/out/net cards and an interval row per bucket', async () => {
    render(<MemoryRouter><CashFlow /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('2026-06-01')).toBeInTheDocument())
    expect(screen.getByText('2026-06-02')).toBeInTheDocument()
    expect(screen.getByText('70,000 aUEC')).toBeInTheDocument()
  })
})
