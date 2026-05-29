import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import PublicFleet from './PublicFleet'

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/u/:handle/fleet" element={<PublicFleet />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PublicFleet', () => {
  beforeEach(() => {
    global.fetch = vi.fn()
  })

  it('renders handle + ship list', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        handle: 'JeanLuc',
        ships: [
          {
            id: 1,
            vehicle_name: 'Carrack',
            vehicle_slug: 'carrack',
            manufacturer_name: 'Anvil',
            insurance_label: 'Lifetime Insurance',
            is_lifetime: 1,
            custom_name: 'Jean-Luc',
          },
        ],
      }),
    })

    renderAt('/u/JeanLuc/fleet')
    await waitFor(() => expect(screen.getByText(/JeanLuc/)).toBeInTheDocument())
    expect(screen.getByText('Carrack')).toBeInTheDocument()
    expect(screen.getByText(/Jean-Luc/)).toBeInTheDocument()
  })

  it('shows 404 message when API returns 404', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: 'Not found' }) })
    renderAt('/u/nobody/fleet')
    await waitFor(() => expect(screen.getAllByText(/not found|no public fleet|private/i).length).toBeGreaterThan(0))
  })

  it('shows sign-up CTA', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ handle: 'X', ships: [] }),
    })
    renderAt('/u/X/fleet')
    await waitFor(() => expect(screen.getAllByText(/sign in|sign up|create/i).length).toBeGreaterThan(0))
  })

  it('does NOT render any pledge cost / MSRP text', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        handle: 'X',
        ships: [{ id: 1, vehicle_name: 'Idris', vehicle_slug: 'idris', insurance_label: 'LTI' }],
      }),
    })
    renderAt('/u/X/fleet')
    await waitFor(() => expect(screen.getByText('Idris')).toBeInTheDocument())
    expect(screen.queryByText(/\$\d/)).toBeNull()
    expect(screen.queryByText(/MSRP/i)).toBeNull()
    expect(screen.queryByText(/Pledge cost/i)).toBeNull()
  })
})
