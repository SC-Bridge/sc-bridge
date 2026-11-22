import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import RenderViewer from './RenderViewer'

const VARIANTS = [
  { variant: '', view: 'front', hash: 'h0', width: 2048, height: 1024, name: null },
  { variant: 'paint_x', view: 'front', hash: 'h1', width: 2048, height: 1024, name: 'Paint X' },
  { variant: 'paint_y', view: 'front', hash: 'h1', width: 2048, height: 1024, name: 'Paint Y' },
]

vi.mock('../hooks/useRenderVariants', () => ({
  useRenderVariants: () => ({ variants: VARIANTS, loading: false, error: null }),
}))

function Search() {
  return <div data-testid="search">{useLocation().search}</div>
}

function setup(entry = '/ships/x', onClose = vi.fn()) {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <RenderViewer kind="vehicle" itemKey="x" title="Ship X" onClose={onClose} />
      <Search />
    </MemoryRouter>,
  )
  return onClose
}

describe('RenderViewer', () => {
  it('renders one thumbnail per distinct hash inside an aria-modal dialog', () => {
    setup()
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(screen.getAllByRole('button', { name: /^Show / })).toHaveLength(2)
  })

  it('ArrowRight selects the next variant and syncs ?view=', () => {
    setup()
    expect(screen.getByTestId('caption').textContent).toBe('Ship X')
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(screen.getByTestId('caption').textContent).toBe('Paint X')
    expect(screen.getByTestId('search').textContent).toBe('?view=paint_x')
  })

  it('Escape calls onClose', () => {
    const onClose = setup()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('opens on the variant named in ?view=', () => {
    setup('/ships/x?view=paint_x')
    expect(screen.getByTestId('caption').textContent).toBe('Paint X')
    expect(screen.getByRole('dialog').querySelector('img').getAttribute('src')).toBe(
      'https://renders.scbridge.app/h1/2048.webp',
    )
  })

  it('closes on backdrop click but not on dialog content click', () => {
    const onClose = setup()
    fireEvent.click(screen.getByTestId('caption'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('render-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('selects the shown image for a ?view= variant that was deduped by hash', () => {
    setup('/ships/x?view=paint_y')
    const src = screen.getByRole('dialog').querySelector('img').getAttribute('src')
    expect(src).toBe('https://renders.scbridge.app/h1/2048.webp')
  })

  it('falls back to the first variant for an unknown ?view=', () => {
    setup('/ships/x?view=nope')
    expect(screen.getByTestId('caption').textContent).toBe('Ship X')
    expect(screen.getByRole('dialog').querySelector('img').getAttribute('src')).toBe(
      'https://renders.scbridge.app/h0/2048.webp',
    )
  })

  it('falls back to the 512 render, then a placeholder, when the main image fails', () => {
    setup()
    const main = () => screen.getByRole('dialog').querySelector('img[width]')
    fireEvent.error(main())
    expect(main().getAttribute('src')).toBe('https://renders.scbridge.app/h0/512.webp')
    fireEvent.error(main())
    expect(main()).toBeNull()
    expect(screen.getByText('Image unavailable')).toBeInTheDocument()
    // Changing variant resets the failure state
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(main().getAttribute('src')).toBe('https://renders.scbridge.app/h1/2048.webp')
  })

  it('only sets aria-current on the selected thumbnail', () => {
    setup()
    const thumbs = screen.getAllByRole('button', { name: /^Show / })
    expect(thumbs[0].getAttribute('aria-current')).toBe('true')
    expect(thumbs[1].hasAttribute('aria-current')).toBe(false)
  })
})
