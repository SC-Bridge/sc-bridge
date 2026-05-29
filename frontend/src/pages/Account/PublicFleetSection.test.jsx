import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PublicFleetSection from './PublicFleetSection'

function setup({ verifiedHandle = 'JeanLuc', publicFleetShare = null } = {}) {
  global.fetch = vi.fn((url, opts) => {
    const u = typeof url === 'string' ? url : url.toString()
    if (u.includes('/api/account/rsi-profile')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          profile: verifiedHandle ? { handle: verifiedHandle, verified_handle: verifiedHandle } : null,
          verification: verifiedHandle ? { verified: true } : { verified: false },
          extensionProfile: null,
        }),
      })
    }
    if (u.includes('/api/settings/preferences')) {
      if (!opts || !opts.method || opts.method === 'GET') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => (publicFleetShare ? { publicFleetShare } : {}),
        })
      }
      if (opts.method === 'PUT') {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) })
      }
    }
    return Promise.reject(new Error(`unmocked: ${u}`))
  })
}

describe('PublicFleetSection', () => {
  beforeEach(() => {
    setup()
    // jsdom clipboard stub
    if (!navigator.clipboard) {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: vi.fn(() => Promise.resolve()) },
        configurable: true,
      })
    } else {
      navigator.clipboard.writeText = vi.fn(() => Promise.resolve())
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the toggle and copy-link button when verified', async () => {
    render(<MemoryRouter><PublicFleetSection /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText(/share my fleet/i)).toBeInTheDocument())
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
  })

  it('shows verification prompt when handle is not verified', async () => {
    setup({ verifiedHandle: null })
    render(<MemoryRouter><PublicFleetSection /></MemoryRouter>)
    await waitFor(() =>
      expect(screen.getByText(/verify your rsi handle/i)).toBeInTheDocument(),
    )
  })

  it('toggling on calls PUT with publicFleetShare="true"', async () => {
    render(<MemoryRouter><PublicFleetSection /></MemoryRouter>)
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('checkbox'))
    await waitFor(() => {
      const putCall = global.fetch.mock.calls.find(
        ([url, opts]) =>
          typeof url === 'string' &&
          url.includes('/api/settings/preferences') &&
          opts?.method === 'PUT',
      )
      expect(putCall).toBeTruthy()
      expect(JSON.parse(putCall[1].body)).toEqual({ publicFleetShare: 'true' })
    })
  })

  it('toggling off calls PUT with publicFleetShare=null', async () => {
    setup({ publicFleetShare: 'true' })
    render(<MemoryRouter><PublicFleetSection /></MemoryRouter>)
    await waitFor(() => {
      const cb = screen.getByRole('checkbox')
      expect(cb.checked).toBe(true)
    })
    fireEvent.click(screen.getByRole('checkbox'))
    await waitFor(() => {
      const putCall = global.fetch.mock.calls.find(
        ([url, opts]) =>
          typeof url === 'string' &&
          url.includes('/api/settings/preferences') &&
          opts?.method === 'PUT',
      )
      expect(putCall).toBeTruthy()
      expect(JSON.parse(putCall[1].body)).toEqual({ publicFleetShare: null })
    })
  })
})
