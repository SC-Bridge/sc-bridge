import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ShareFleetBanner from './ShareFleetBanner'

function mockApi({ verifiedHandle = 'JeanLuc', publicFleetShare = null, extensionOnly = false } = {}) {
  global.fetch = vi.fn((url, opts) => {
    if (typeof url === 'string' && url.includes('/api/account/rsi-profile')) {
      return Promise.resolve({
        ok: true,
        json: async () => extensionOnly
          ? {
              profile: { handle: verifiedHandle, verified_handle: null },
              verification: { verified: !!verifiedHandle, verified_handle: verifiedHandle, source: 'extension' },
              extensionProfile: verifiedHandle ? { rsi_handle: verifiedHandle } : null,
            }
          : {
              profile: { handle: verifiedHandle, verified_handle: verifiedHandle },
              verification: { verified: !!verifiedHandle, verified_handle: verifiedHandle, source: 'manual' },
              extensionProfile: null,
            },
      })
    }
    if (typeof url === 'string' && url.includes('/api/settings/preferences') && (!opts || !opts.method || opts.method === 'GET')) {
      return Promise.resolve({ ok: true, json: async () => (publicFleetShare ? { publicFleetShare } : {}) })
    }
    if (typeof url === 'string' && url.includes('/api/settings/preferences') && opts?.method === 'PUT') {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) })
    }
    return Promise.reject(new Error(`unmocked: ${url}`))
  })
}

describe('ShareFleetBanner', () => {
  beforeEach(() => { mockApi() })

  it('renders the collapsed banner when verified, sharing off', async () => {
    render(<MemoryRouter><ShareFleetBanner /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Share My Fleet')).toBeInTheDocument())
    expect(screen.getByText('Off')).toBeInTheDocument()
  })

  it('auto-expands and shows link when sharing is already on', async () => {
    mockApi({ publicFleetShare: 'true' })
    render(<MemoryRouter><ShareFleetBanner /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Link active')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText(/\/u\/JeanLuc\/fleet/)).toBeInTheDocument())
    expect(screen.getByText('ON')).toBeInTheDocument()
  })

  it('treats extension-verified user as verified', async () => {
    mockApi({ verifiedHandle: 'ExtUser', extensionOnly: true })
    render(<MemoryRouter><ShareFleetBanner /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Share My Fleet')).toBeInTheDocument())
    // The unverified pointer should NOT appear
    expect(screen.queryByText(/Verify your RSI handle/i)).toBeNull()
  })

  it('shows a quiet pointer to Account when no verified handle', async () => {
    mockApi({ verifiedHandle: null })
    render(<MemoryRouter><ShareFleetBanner /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText(/Verify your RSI handle/i)).toBeInTheDocument())
    expect(screen.queryByText('Share My Fleet')).toBeNull()
  })

  it('toggling on calls PUT with publicFleetShare="true"', async () => {
    render(<MemoryRouter><ShareFleetBanner /></MemoryRouter>)
    // Expand first
    await waitFor(() => expect(screen.getByText('Share My Fleet')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Share My Fleet'))
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('checkbox'))
    await waitFor(() => {
      const putCall = global.fetch.mock.calls.find(
        ([url, opts]) => typeof url === 'string' && url.includes('/api/settings/preferences') && opts?.method === 'PUT',
      )
      expect(putCall).toBeTruthy()
      expect(JSON.parse(putCall[1].body)).toEqual({ publicFleetShare: 'true' })
    })
  })

  it('clipboard rejection shows Failed', async () => {
    mockApi({ publicFleetShare: 'true' })
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('blocked')) },
    })
    render(<MemoryRouter><ShareFleetBanner /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Copy')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Copy'))
    await waitFor(() => expect(screen.getByText('Failed')).toBeInTheDocument())
  })
})
