import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import ShipDB from './ShipDB'

const SHIPS = [
  {
    slug: 'gladius', name: 'Gladius', class_name: 'AEGS_Gladius', manufacturer_name: 'Aegis', manufacturer_code: 'AEGS',
    size_label: 'Small', focus: 'Fighter', classification: 'combat', production_status: 'flight_ready',
    image_url_small: 'https://rsi.example/gladius-small.jpg',
    render: { hash: 'abc123', width: 2048, height: 1024, view: 'iso' },
    length: 21,
    side_render: { hash: 'side123', width: 2048, height: 600, view: 'side' },
  },
]

function LocationProbe() {
  const loc = useLocation()
  return <p data-testid="location">{loc.pathname + loc.search}</p>
}

vi.mock('../hooks/useAPI', () => ({
  useShips: () => ({ data: SHIPS, loading: false, error: null, refetch: vi.fn() }),
}))

describe('ShipDB ship card', () => {
  it('shows the ship render as the main image, ahead of the RSI art', () => {
    render(<MemoryRouter><ShipDB /></MemoryRouter>)
    const img = screen.getByAltText('Gladius')
    expect(img.getAttribute('src')).toBe('https://renders.scbridge.app/abc123/512.webp')
  })
})

describe('ShipDB size comparison', () => {
  const renderAt = (path) => render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/ships" element={<><ShipDB /><LocationProbe /></>} /></Routes>
    </MemoryRouter>,
  )

  it('adds a ship to the comparison from its card, keeping it in the URL', () => {
    renderAt('/ships')
    expect(screen.queryByTestId('size-compare')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Compare size: Gladius' }))
    expect(screen.getByTestId('location').textContent).toContain('cmp=gladius')
    const panel = screen.getByTestId('size-compare')
    expect(within(panel).getByAltText('Gladius').getAttribute('src')).toBe('https://renders.scbridge.app/side123/2048.webp')
  })

  it('draws the ships named in the URL, and clears them', () => {
    renderAt('/ships?cmp=gladius')
    expect(screen.getByRole('button', { name: 'Compare size: Gladius' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(within(screen.getByTestId('size-compare')).getByRole('button', { name: /clear/i }))
    expect(screen.queryByTestId('size-compare')).toBeNull()
    expect(screen.getByTestId('location').textContent).not.toContain('cmp=')
  })

  it('does not follow the card link when the compare toggle is clicked', () => {
    renderAt('/ships')
    const toggle = screen.getByRole('button', { name: 'Compare size: Gladius' })
    expect(toggle.closest('a')).toBeNull()
  })
})
