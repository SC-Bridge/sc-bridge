import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import POILootPool from './POILootPool'

// One pool with a mix of rarities so we can exercise the quality filter (#95).
const ENVELOPE = {
  count: 1,
  data: [
    {
      loot_table: 'LootTable.Test',
      container_type: 'Crate',
      rolls: 3,
      items: [
        { uuid: 'i-common', name: 'Common Widget', category: 'weapon', rarity: 'Common', per_roll: 0.5, per_container_odds: 0.8 },
        { uuid: 'i-rare', name: 'Rare Gizmo', category: 'weapon', rarity: 'Rare', per_roll: 0.1, per_container_odds: 0.27 },
        { uuid: 'i-legendary', name: 'Legendary Doohickey', category: 'armour', rarity: 'Legendary', per_roll: 0.01, per_container_odds: 0.03 },
      ],
    },
  ],
}

function renderPool(envelope = ENVELOPE) {
  return render(
    <MemoryRouter>
      <POILootPool envelope={envelope} />
    </MemoryRouter>,
  )
}

describe('POILootPool — quality/rarity filter (#95)', () => {
  it('renders a quality chip per present rarity with counts', () => {
    renderPool()
    expect(screen.getByRole('button', { name: /Common \(1\)/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Rare \(1\)/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Legendary \(1\)/ })).toBeInTheDocument()
  })

  it('filtering by Rare shows only the rare item', () => {
    renderPool()
    fireEvent.click(screen.getByRole('button', { name: /Rare \(1\)/ }))
    const table = screen.getByRole('table')
    expect(within(table).getByText('Rare Gizmo')).toBeInTheDocument()
    expect(within(table).queryByText('Common Widget')).not.toBeInTheDocument()
    expect(within(table).queryByText('Legendary Doohickey')).not.toBeInTheDocument()
  })

  it('clicking the active rarity chip again clears the filter', () => {
    renderPool()
    const rareChip = screen.getByRole('button', { name: /Rare \(1\)/ })
    fireEvent.click(rareChip)
    fireEvent.click(rareChip)
    const table = screen.getByRole('table')
    expect(within(table).getByText('Common Widget')).toBeInTheDocument()
    expect(within(table).getByText('Legendary Doohickey')).toBeInTheDocument()
  })

  it('rarity and category filters compose (Rare + Armour = empty)', () => {
    renderPool()
    // Rare items are all weapons here, so Rare + Armour yields nothing.
    fireEvent.click(screen.getByRole('button', { name: /Rare \(1\)/ }))
    fireEvent.click(screen.getByRole('button', { name: /Armour \(1\)/ }))
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('omits the quality row entirely when no item carries a rarity', () => {
    const noRarity = {
      count: 1,
      data: [{ loot_table: 'LT', container_type: 'Crate', rolls: 1, items: [
        { uuid: 'x', name: 'Plain', category: 'weapon', rarity: null, per_roll: 0.5, per_container_odds: 0.5 },
      ] }],
    }
    renderPool(noRarity)
    expect(screen.queryByText('Quality')).not.toBeInTheDocument()
  })
})
