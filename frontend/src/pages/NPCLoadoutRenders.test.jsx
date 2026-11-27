import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LoadoutTree } from './NPCLoadouts'

vi.mock('../hooks/useRenderVariants', () => ({
  useRenderVariants: () => ({
    variants: [{ variant: '', view: 'iso', hash: 'r1', width: 1024, height: 1024, name: null }],
    loading: false,
    error: null,
  }),
}))

const ITEMS = [
  {
    port_name: 'Armor_Helmet', item_name: 'cds_helmet_render', resolved_name: 'Render Helmet', loot_uuid: 'npc-helm',
    render: { hash: 'r1', width: 1024, height: 1024, view: 'iso' },
    render_variants_kind: 'fps_armour', render_item_key: 'cds_helmet_render', render_variant: '',
  },
  { port_name: 'Armor_Backpack', item_name: 'unlinked_backpack', resolved_name: 'Unlinked Pack', render: null },
  { port_name: 'Body', item_name: 'm_body_01', tag: 'Char_Body', resolved_name: 'Body' },
]

describe('NPC Loadouts renders', () => {
  it('shows a thumbnail per gear item, opens the large view without selecting the item, and still hides body parts', () => {
    const onSelectItem = vi.fn()
    render(<MemoryRouter><LoadoutTree items={ITEMS} onSelectItem={onSelectItem} /></MemoryRouter>)

    const img = screen.getByAltText('Render Helmet')
    expect(img.getAttribute('src')).toBe('https://renders.scbridge.app/r1/512.webp')
    expect(screen.getByRole('img', { name: /Unlinked Pack — image unavailable/ })).toBeInTheDocument()
    expect(screen.queryByText('Body')).not.toBeInTheDocument()

    fireEvent.load(img)
    fireEvent.click(screen.getByRole('button', { name: /Open large view of Render Helmet/ }))
    expect(screen.getByRole('dialog', { name: /Render Helmet renders/ })).toBeInTheDocument()
    expect(onSelectItem).not.toHaveBeenCalled()
  })
})
