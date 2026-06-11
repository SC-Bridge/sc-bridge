import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import NetWorth from './NetWorth'

const BODY = {
  from: '2026-06-01', to: '2026-07-01', interval: 'daily',
  opening: 1000000,
  series: [
    { bucket: '2026-06-01', netWorth: 1050000 },
    { bucket: '2026-06-02', netWorth: 1100000 },
  ],
}

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
    ok: true, status: 200, json: async () => BODY,
  }))
})

describe('Net Worth page', () => {
  it('renders the current equity card and an interval row per bucket', async () => {
    render(<MemoryRouter><NetWorth /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('2026-06-01')).toBeInTheDocument())
    expect(screen.getByText('2026-06-02')).toBeInTheDocument()
    expect(screen.getAllByText('1,100,000 aUEC').length).toBeGreaterThan(0)
  })

  it('shows empty state when series is empty', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
      ok: true, status: 200, json: async () => ({ ...BODY, series: [] }),
    }))
    render(<MemoryRouter><NetWorth /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText(/no net worth data for this period/i)).toBeInTheDocument())
  })

  it('shows retry button and error message on fetch failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
      ok: false, status: 500, json: async () => ({ error: 'server error' }),
    }))
    render(<MemoryRouter><NetWorth /></MemoryRouter>)
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })
})
