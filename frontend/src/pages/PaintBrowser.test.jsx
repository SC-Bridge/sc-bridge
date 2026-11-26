import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
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
    variants: [
      { variant: '', view: 'iso', hash: 'p0hash', width: 2048, height: 1024, name: null },
      { variant: 'paint_gladius_valiant', view: 'iso', hash: 'p1hash', width: 2048, height: 1024, name: 'Valiant' },
    ],
    loading: false,
    error: null,
  }),
}))

function Search() {
  return <div data-testid="search">{useLocation().search}</div>
}

function openViewer(entry) {
  render(<MemoryRouter initialEntries={[entry]}><PaintBrowser /><Search /></MemoryRouter>)
  fireEvent.load(screen.getByAltText('Valiant'))
  fireEvent.click(screen.getByRole('button', { name: /Open large view of Valiant/ }))
}

function mainImageSrc() {
  return screen.getByRole('dialog').querySelector('img[src$="/2048.webp"]')?.getAttribute('src')
}

describe('PaintBrowser paint card', () => {
  it('keeps the dialog open and the grid layout when another thumbnail is selected', () => {
    openViewer('/paints')
    const [stock, painted] = screen.getAllByRole('button', { name: /^Show / })
    fireEvent.click(stock)
    fireEvent.click(painted)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    // only the grid card has an open-viewer button; the list layout has none
    expect(screen.getByRole('button', { name: /Open large view of Valiant/ })).toBeInTheDocument()
    expect(screen.getByTestId('search').textContent).not.toContain('view=')
  })

  it('starts on the paint variant even with ?view=grid on the page', () => {
    openViewer('/paints?view=grid')
    expect(mainImageSrc()).toBe('https://renders.scbridge.app/p1hash/2048.webp')
  })

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
