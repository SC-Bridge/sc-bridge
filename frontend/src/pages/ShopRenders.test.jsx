import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { InventoryPanel } from './Shops'
import { ShopInventoryPanel } from './POI'

vi.mock('../hooks/useRenderVariants', () => ({
  useRenderVariants: () => ({
    variants: [{ variant: 'ksar_rifle_red', view: 'iso', hash: 'r2', width: 2048, height: 1400, name: 'Red' }],
    loading: false,
    error: null,
  }),
}))

const INVENTORY = [
  {
    item_uuid: 'a', resolved_name: 'Render Rifle Red', buy_price: 1000,
    render: { hash: 'r2', width: 2048, height: 1400, view: 'iso' },
    render_variants_kind: 'fps_weapon', render_item_key: 'ksar_rifle', render_variant: 'ksar_rifle_red',
  },
  { item_uuid: 'b', resolved_name: 'Mystery Crate', buy_price: 500, render: null },
]

vi.mock('../hooks/useAPI', () => ({
  useAPI: () => ({ data: INVENTORY, loading: false }),
  useLootLocations: () => ({ data: null, loading: false }),
}))

const SHOP = { slug: 'render-shop', display_name: 'Render Shop', shop_type: 'weapons', item_count: 2 }
const SRC = 'https://renders.scbridge.app/r2/512.webp'

describe.each([
  ['Shops', InventoryPanel],
  ['Locations', ShopInventoryPanel],
])('%s shop inventory renders', (_page, Panel) => {
  it('shows a row thumbnail per item, a placeholder when there is none, and opens the large view', () => {
    const onClose = vi.fn()
    render(<MemoryRouter><Panel shop={SHOP} onClose={onClose} /></MemoryRouter>)
    const img = screen.getByAltText('Render Rifle Red')
    expect(img.getAttribute('src')).toBe(SRC)
    expect(screen.getByRole('img', { name: /Mystery Crate — image unavailable/ })).toBeInTheDocument()

    fireEvent.load(img)
    fireEvent.click(screen.getByRole('button', { name: /Open large view of Render Rifle Red/ }))
    expect(screen.getByRole('dialog', { name: /Render Rifle Red renders/ })).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes only the large view on Escape, leaving the panel open', () => {
    const onClose = vi.fn()
    render(<MemoryRouter><Panel shop={SHOP} onClose={onClose} /></MemoryRouter>)
    fireEvent.load(screen.getByAltText('Render Rifle Red'))
    fireEvent.click(screen.getByRole('button', { name: /Open large view of Render Rifle Red/ }))

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: /Render Rifle Red renders/ })).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
