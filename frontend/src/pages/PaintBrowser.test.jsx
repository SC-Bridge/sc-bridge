import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PaintBrowser from './PaintBrowser'

const PAINTS = [
  {
    id: 1, name: 'Valiant', slug: 'valiant', class_name: 'paint_gladius_valiant',
    image_url: 'https://rsi.example/valiant.jpg',
    vehicles: [{ id: 5, name: 'Gladius', slug: 'gladius' }],
    render: { hash: 'p1hash', width: 2048, height: 1024, view: 'iso' },
    render_item_key: 'aegs_gladius',
  },
]

vi.mock('../hooks/useAPI', () => ({
  usePaints: () => ({ data: PAINTS, loading: false, error: null, refetch: vi.fn() }),
}))

vi.mock('../hooks/useRenderVariants', () => ({
  useRenderVariants: () => ({
    variants: [{ variant: 'paint_gladius_valiant', view: 'iso', hash: 'p1hash', width: 2048, height: 1024, name: 'Valiant' }],
    loading: false,
    error: null,
  }),
}))

describe('PaintBrowser paint card', () => {
  it('opens the large view when the render is clicked', () => {
    render(<MemoryRouter><PaintBrowser /></MemoryRouter>)
    const img = screen.getByAltText('Valiant')
    expect(img.getAttribute('src')).toBe('https://renders.scbridge.app/p1hash/512.webp')
    fireEvent.load(img)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Open large view of Valiant/ }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
