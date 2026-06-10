import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Sorting from './index'

const QUEUE = [
  { id: 11, occurred_at: '2026-06-01T10:10:00Z', amount: -2400, description: 'Fuel purchase', location: 'New Babbage', source: 'parsed', category: null },
  { id: 12, occurred_at: '2026-06-01T11:00:00Z', amount: -80000, description: 'Module purchase', location: 'Port Olisar', source: 'parsed', category: null },
]

let badges = { sorting: 2, loansDueSoon: 0, sortingThreshold: 10 }

beforeEach(() => {
  vi.restoreAllMocks()
  badges = { sorting: 2, loansDueSoon: 0, sortingThreshold: 10 }
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => ({
    ok: true,
    status: 200,
    json: async () => {
      const u = String(url)
      if (u.includes('/sorting/bulk')) return { ok: true, updated: JSON.parse(init.body).ids.length }
      if (u.includes('/sorting')) return { entries: QUEUE, count: QUEUE.length }
      if (u.includes('/badges')) return badges
      return {}
    },
  }))
})

describe('Sorting List page', () => {
  it('renders the queue with count', async () => {
    render(<Sorting />)
    await waitFor(() => expect(screen.getByText('Fuel purchase')).toBeInTheDocument())
    expect(screen.getByText(/queue: 2/i)).toBeInTheDocument()
  })

  it('select a row + click a category button → bulk categorize call', async () => {
    render(<Sorting />)
    await waitFor(() => expect(screen.getByText('Fuel purchase')).toBeInTheDocument())
    await userEvent.click(screen.getByText('Fuel purchase'))
    await userEvent.click(screen.getByRole('button', { name: /running cost/i }))
    await waitFor(() => {
      const bulk = globalThis.fetch.mock.calls.find(([u]) => String(u).includes('/sorting/bulk'))
      expect(bulk).toBeTruthy()
      expect(JSON.parse(bulk[1].body)).toMatchObject({ ids: [11], category: 'running_cost' })
    })
  })

  it('categorizing into trading opens the tag picker first', async () => {
    render(<Sorting />)
    await waitFor(() => expect(screen.getByText('Fuel purchase')).toBeInTheDocument())
    await userEvent.click(screen.getByText('Fuel purchase'))
    await userEvent.click(screen.getByRole('button', { name: /trading/i }))
    expect(screen.getByTestId('tag-picker')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /minerals/i }))
    await waitFor(() => {
      const bulk = globalThis.fetch.mock.calls.find(([u]) => String(u).includes('/sorting/bulk'))
      expect(JSON.parse(bulk[1].body)).toMatchObject({ ids: [11], category: 'trading', tag: 'minerals' })
    })
  })

  it('keyboard 1-5 categorizes the selected row', async () => {
    render(<Sorting />)
    await waitFor(() => expect(screen.getByText('Fuel purchase')).toBeInTheDocument())
    await userEvent.click(screen.getByText('Fuel purchase'))
    await userEvent.keyboard('1')
    await waitFor(() => {
      const bulk = globalThis.fetch.mock.calls.find(([u]) => String(u).includes('/sorting/bulk'))
      expect(JSON.parse(bulk[1].body)).toMatchObject({ ids: [11], category: 'assets' })
    })
  })

  it('shows the threshold banner when the queue exceeds the threshold', async () => {
    badges = { sorting: 12, loansDueSoon: 0, sortingThreshold: 10 }
    render(<Sorting />)
    await waitFor(() => expect(screen.getByTestId('threshold-banner')).toBeInTheDocument())
  })

  it('shows the empty state when the queue is clear', async () => {
    globalThis.fetch.mockImplementation(async (url) => ({
      ok: true, status: 200,
      json: async () => String(url).includes('/badges')
        ? { sorting: 0, loansDueSoon: 0, sortingThreshold: 10 }
        : { entries: [], count: 0 },
    }))
    render(<Sorting />)
    await waitFor(() => expect(screen.getByText(/all sorted/i)).toBeInTheDocument())
  })
})
