import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ShipDB from './ShipDB'

const SHIPS = [
  {
    slug: 'gladius', name: 'Gladius', class_name: 'AEGS_Gladius', manufacturer_name: 'Aegis', manufacturer_code: 'AEGS',
    size_label: 'Small', focus: 'Fighter', classification: 'combat', production_status: 'flight_ready',
    image_url_small: 'https://rsi.example/gladius-small.jpg',
    render: { hash: 'abc123', width: 2048, height: 1024, view: 'iso' },
  },
]

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
