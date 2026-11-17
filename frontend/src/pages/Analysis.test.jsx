import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Analysis from './Analysis'
import AnalysisHistory from './AnalysisHistory'

const api = vi.hoisted(() => ({
  accounts: [],
  multiAccount: true,
  latest: null,
  history: [],
  generate: vi.fn(),
}))

vi.mock('../hooks/useAPI', () => ({
  useLLMConfig: () => ({ data: { providers: { anthropic: { api_key_set: true, model: 'm' } } }, loading: false, refetch: vi.fn() }),
  useLatestAIAnalysis: () => ({ data: api.latest, loading: false }),
  useLLMModels: () => ({ models: [{ id: 'm', name: 'M' }], loading: false, refresh: vi.fn() }),
  useStatus: () => ({ data: { features: { multiAccount: api.multiAccount } }, loading: false }),
  useRsiAccounts: () => ({ data: { accounts: api.accounts }, error: null }),
  useAIAnalysisHistory: () => ({ data: { history: api.history }, loading: false, error: null, refetch: vi.fn() }),
  deleteAIAnalysis: vi.fn(),
  generateAIAnalysis: (...args) => api.generate(...args),
  setLLMConfig: vi.fn(),
}))
vi.mock('./FleetChat', () => ({ default: () => null }))

const renderAt = (ui, search = '') =>
  render(<MemoryRouter initialEntries={[`/p${search}`]}>{ui}</MemoryRouter>)

describe('AI analysis follows the account filter', () => {
  beforeEach(() => {
    localStorage.clear()
    api.multiAccount = true
    api.generate = vi.fn().mockResolvedValue({ analysis: 'fresh', model: 'm', vehicle_count: 1, accounts: ['Alt'] })
    api.accounts = [
      { id: 1, label: 'Main', color: '#22d3ee', is_primary: 1 },
      { id: 2, label: 'Alt', color: '#f97316', is_primary: 0 },
    ]
    api.latest = { analysis: 'old text', created_at: '2026-11-01T00:00:00Z', provider: 'anthropic', model: 'm', vehicle_count: 3, accounts: ['Main'] }
    api.history = [
      { id: 1, created_at: '2026-11-01T00:00:00Z', provider: 'anthropic', model: 'm', vehicle_count: 3, analysis: 'a', accounts: ['Main', 'Alt'] },
      { id: 2, created_at: '2026-11-02T00:00:00Z', provider: 'anthropic', model: 'm', vehicle_count: 5, analysis: 'b', accounts: null },
    ]
  })

  it("shows which accounts the latest analysis covered, from its row not the selection", () => {
    renderAt(<Analysis />, '?accts=2')
    expect(screen.getByText(/Analysing: Main/)).toBeInTheDocument()
    expect(screen.queryByText(/Analysing: Alt/)).not.toBeInTheDocument()
  })

  it('sends the chosen accounts when generating', async () => {
    renderAt(<Analysis />, '?accts=2')
    fireEvent.click(screen.getByRole('button', { name: /generate analysis/i }))
    await waitFor(() => expect(api.generate).toHaveBeenCalled())
    expect(api.generate.mock.calls[0][0].accounts).toEqual([2])
    await waitFor(() => expect(screen.getByText(/Analysing: Alt/)).toBeInTheDocument())
  })

  it("sends 'all' when every account is selected", async () => {
    renderAt(<Analysis />, '?accts=all')
    fireEvent.click(screen.getByRole('button', { name: /generate analysis/i }))
    await waitFor(() => expect(api.generate).toHaveBeenCalled())
    expect(api.generate.mock.calls[0][0].accounts).toBe('all')
  })

  it('labels an all-accounts analysis', () => {
    api.latest.accounts = null
    renderAt(<Analysis />)
    expect(screen.getByText(/Analysing: all accounts/)).toBeInTheDocument()
  })

  it('shows no account UI and sends no accounts with a single account', async () => {
    api.accounts = [{ id: 1, label: 'Main', color: '#22d3ee', is_primary: 1 }]
    renderAt(<Analysis />)
    expect(screen.queryByText(/Analysing:/)).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /filter by rsi account/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /generate analysis/i }))
    await waitFor(() => expect(api.generate).toHaveBeenCalled())
    expect(api.generate.mock.calls[0][0].accounts).toBeUndefined()
  })

  it('shows no account UI when multi-account is off', () => {
    api.multiAccount = false
    renderAt(<Analysis />)
    expect(screen.queryByText(/Analysing:/)).not.toBeInTheDocument()
  })

  it('history rows show their accounts', () => {
    renderAt(<AnalysisHistory />)
    expect(screen.getByText(/Analysing: Main, Alt/)).toBeInTheDocument()
    expect(screen.getByText(/Analysing: all accounts/)).toBeInTheDocument()
  })

  it('history shows no account label with a single account', () => {
    api.accounts = [{ id: 1, label: 'Main', color: '#22d3ee', is_primary: 1 }]
    renderAt(<AnalysisHistory />)
    expect(screen.queryByText(/Analysing:/)).not.toBeInTheDocument()
  })
})
