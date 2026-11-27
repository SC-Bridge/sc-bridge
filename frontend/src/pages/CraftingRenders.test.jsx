import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import BlueprintListRow from './Crafting/v2/BlueprintListRow'
import BlueprintCard from './Crafting/v2/BlueprintCard'
import BlueprintDetail from './Crafting/BlueprintDetail'
import MissionDetail from './MissionDetail'

vi.mock('../hooks/useRenderVariants', () => ({
  useRenderVariants: () => ({
    variants: [{ variant: '', view: 'iso', hash: 'c1', width: 2048, height: 1400, name: null }],
    loading: false,
    error: null,
  }),
}))

const RIFLE = {
  id: 11, type: 'weapons', sub_type: 'rifle', name: 'Render Rifle', craft_time_seconds: 60, slots: [],
  render: { hash: 'c1', width: 2048, height: 1400, view: 'iso' },
  render_variants_kind: 'fps_weapon', render_item_key: 'ksar_rifle_render', render_variant: '',
}
const PLATE = { id: 12, type: 'armour', sub_type: 'combat', name: 'Plain Plate', craft_time_seconds: 60, slots: [], render: null }

vi.mock('../hooks/useAPI', () => ({
  useCrafting: () => ({ data: { blueprints: [RIFLE, PLATE], resource_locations: {} }, loading: false, error: null, refetch: vi.fn() }),
  useMissionDetail: () => ({
    data: {
      generator: { key: 'render_recover', display_name: 'Render Faction', faction_name: 'Render Faction', guild: 'mercenary_guild' },
      systems: [], tiers: [], all_blueprints: [RIFLE, PLATE],
    },
    loading: false, error: null, refetch: vi.fn(),
  }),
}))

const SRC = 'https://renders.scbridge.app/c1/512.webp'

/** Renders `ui` at `path`, with a stub page at /crafting/:id to catch link navigation. */
function atRoute(ui, path = '/here', pattern = '/here') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={pattern} element={ui} />
        <Route path="/crafting/:id" element={<p>blueprint page</p>} />
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
  expect(screen.queryByText('blueprint page')).not.toBeInTheDocument()
}

describe('Crafting renders', () => {
  it('shows the output render on a blueprint list row, and opening it does not open the blueprint', () => {
    const onOpen = vi.fn()
    atRoute(<BlueprintListRow blueprint={RIFLE} onOpen={onOpen} />)
    expectOpensInPlace('Render Rifle')
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('shows the placeholder on a blueprint list row without a render', () => {
    atRoute(<BlueprintListRow blueprint={PLATE} onOpen={vi.fn()} />)
    expect(screen.getByRole('img', { name: /Plain Plate — image unavailable/ })).toBeInTheDocument()
  })

  it('shows the output render on a blueprint card, and the placeholder without one', () => {
    atRoute(
      <>
        <BlueprintCard blueprint={RIFLE} onOpen={vi.fn()} />
        <BlueprintCard blueprint={PLATE} onOpen={vi.fn()} />
      </>,
    )
    expect(screen.getByRole('img', { name: /Plain Plate — image unavailable/ })).toBeInTheDocument()
    expectOpensInPlace('Render Rifle')
  })

  it('shows the output render on the blueprint detail page', () => {
    atRoute(<BlueprintDetail />, '/crafting/11', '/crafting/:id')
    const img = screen.getByAltText('Render Rifle')
    expect(img.getAttribute('src')).toBe(SRC)
    fireEvent.load(img)
    fireEvent.click(screen.getByRole('button', { name: /Open large view of Render Rifle/ }))
    expect(screen.getByRole('dialog', { name: /Render Rifle renders/ })).toBeInTheDocument()
  })

  it('shows each mission reward blueprint render and opens it without following the reward link', () => {
    atRoute(<MissionDetail />, '/missions/render_recover', '/missions/:key')
    expect(screen.getByRole('img', { name: /Plain Plate — image unavailable/ })).toBeInTheDocument()
    expectOpensInPlace('Render Rifle')
  })
})
