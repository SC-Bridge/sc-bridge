import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import POILootPool from './POI/POILootPool'
import { LegacyShopOrNPCDetail } from './POIDetail'

vi.mock('../hooks/useRenderVariants', () => ({
  useRenderVariants: () => ({
    variants: [{ variant: '', view: 'iso', hash: 'r1', width: 2048, height: 1400, name: null }],
    loading: false,
    error: null,
  }),
}))

const RIFLE = {
  uuid: 'loc-rifle', name: 'Render Rifle', category: 'weapon', rarity: 'Rare', per_roll: 0.05, per_container_odds: 0.14,
  render: { hash: 'r1', width: 2048, height: 1400, view: 'iso' },
  render_variants_kind: 'fps_weapon', render_item_key: 'ksar_rifle_loc', render_variant: '',
}
const PEN = { uuid: 'loc-pen', name: 'Plain Pen', category: 'consumable', rarity: 'Common', per_roll: 0.1, per_container_odds: 0.27, render: null }

vi.mock('../hooks/useAPI', () => ({
  useLootLocationDetail: () => ({ data: { items: [RIFLE, PEN] }, loading: false, error: null, refetch: vi.fn() }),
  usePOI: () => ({ data: null, loading: false, error: null }),
}))

const SRC = 'https://renders.scbridge.app/r1/512.webp'

/** Renders `ui` at /here, with a stub page at /loot/:uuid to catch link navigation. */
function atRoute(ui) {
  render(
    <MemoryRouter initialEntries={['/here']}>
      <Routes>
        <Route path="/here" element={ui} />
        <Route path="/loot/:uuid" element={<p>item page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

function expectOpensInPlace(name) {
  const img = screen.getByAltText(name)
  expect(img.getAttribute('src')).toBe(SRC)
  fireEvent.load(img)
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`Open large view of ${name}`) }))
  expect(screen.getByRole('dialog', { name: new RegExp(`${name} renders`) })).toBeInTheDocument()
  expect(screen.queryByText('item page')).not.toBeInTheDocument()
}

describe('Locations renders', () => {
  it('shows a row thumbnail per POI loot-pool item and opens the large view without leaving the page', () => {
    atRoute(<POILootPool envelope={{ count: 1, data: [{ loot_table: 'LootTable.Render', container_type: 'Crate', rolls: 3, items: [RIFLE, PEN] }] }} />)
    expect(screen.getByRole('img', { name: /Plain Pen — image unavailable/ })).toBeInTheDocument()
    expectOpensInPlace('Render Rifle')
  })

  it('shows a row thumbnail per item on a shop or NPC location and opens the large view without following the row link', () => {
    atRoute(<LegacyShopOrNPCDetail apiType="shop" decodedSlug="render-guns" />)
    expect(screen.getByRole('img', { name: /Plain Pen — image unavailable/ })).toBeInTheDocument()
    expectOpensInPlace('Render Rifle')
  })
})
