import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Insurance from './Insurance'
import Insights from './Insights'
import Dashboard from './Dashboard'

const api = vi.hoisted(() => ({ analysisCalls: [], accounts: [], multiAccount: true, analysis: null }))

vi.mock('../hooks/useAPI', () => ({
  useAnalysis: (opts) => {
    api.analysisCalls.push(opts)
    return { data: api.analysis, loading: false, error: null, refetch: vi.fn() }
  },
  useStatus: () => ({ data: { ships: 10, features: { multiAccount: api.multiAccount } }, loading: false, error: null }),
  useRsiAccounts: () => ({ data: { accounts: api.accounts } }),
}))
vi.mock('../lib/auth-client', () => ({
  useSession: () => ({ data: { user: { id: 'u1' } }, isPending: false }),
}))
vi.mock('recharts', () => ({
  PieChart: () => null, Pie: () => null, Cell: () => null, Tooltip: () => null,
  BarChart: () => null, Bar: () => null, XAxis: () => null, YAxis: () => null, LabelList: () => null,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
}))
vi.mock('../components/FleetOverviewGrid', () => ({ default: () => null }))
vi.mock('../components/SectionBoundary', () => ({ default: ({ children }) => <>{children}</> }))

const ship = (name, acct, extra = {}) => ({
  ship_name: name,
  is_lifetime: true,
  insurance_label: 'LTI',
  warbond: false,
  rsi_account_id: acct,
  ...extra,
})

const renderAt = (Page, search) =>
  render(
    <MemoryRouter initialEntries={[`/p${search}`]}>
      <Page />
    </MemoryRouter>,
  )

const lastParam = () => api.analysisCalls.at(-1)?.accounts

describe('Analysis pages follow the account filter', () => {
  beforeEach(() => {
    localStorage.clear()
    api.analysisCalls = []
    api.multiAccount = true
    api.accounts = [
      { id: 1, label: 'Main', color: '#22d3ee', is_primary: 1 },
      { id: 2, label: 'Alt', color: '#f97316', is_primary: 0 },
    ]
    api.analysis = {
      overview: { total_vehicles: 2, lti_count: 2, non_lti_count: 0, flight_ready: 2 },
      size_distribution: {},
      role_categories: {},
      gap_analysis: [],
      redundancies: [],
      insurance_summary: {
        lti_ships: [ship('Alpha Ship', 1), ship('Bravo Ship', 2)],
        non_lti_ships: [],
        unknown_ships: [],
      },
    }
  })

  it('Insurance requests the selected accounts, shows the filter and a marker per row', () => {
    renderAt(Insurance, '?accts=1')
    expect(lastParam()).toBe('1')
    expect(screen.getByRole('group', { name: /filter by rsi account/i })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Main' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Alt' })).toBeInTheDocument()
  })

  it('Insights and Dashboard request the selected accounts', () => {
    renderAt(Insights, '?accts=1,2')
    expect(lastParam()).toBe('all')
    expect(screen.getByRole('group', { name: /filter by rsi account/i })).toBeInTheDocument()
    api.analysisCalls = []
    renderAt(Dashboard, '?accts=2')
    expect(lastParam()).toBe('2')
    expect(screen.getAllByRole('group', { name: /filter by rsi account/i }).length).toBeGreaterThan(0)
  })

  it('sends no accounts param and no filter with a single account', () => {
    api.accounts = [{ id: 1, label: 'Main', color: '#22d3ee', is_primary: 1 }]
    for (const Page of [Insurance, Insights, Dashboard]) {
      api.analysisCalls = []
      const { unmount } = renderAt(Page, '')
      expect(lastParam()).toBeNull()
      expect(screen.queryByRole('group', { name: /filter by rsi account/i })).not.toBeInTheDocument()
      unmount()
    }
  })
})
