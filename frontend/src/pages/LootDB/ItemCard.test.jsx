import { describe, it, expect } from 'vitest'
import { vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ItemCard from './ItemCard'

const base = { uuid: 'u1', name: 'Test Rifle', category: 'weapon', rarity: 'Common', manufacturer_name: 'Behring' }

describe('LootDB ItemCard image', () => {
  it('shows the placeholder when the item has no render', () => {
    render(<ItemCard item={{ ...base, render: null }} onSelect={() => {}} />)
    expect(screen.getByText('No image yet')).toBeInTheDocument()
  })

  it('selects the card when the placeholder area is clicked', () => {
    const onSelect = vi.fn()
    render(<ItemCard item={{ ...base, render: null }} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('No image yet'))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('shows the render when the item has one', () => {
    render(<ItemCard item={{ ...base, render: { hash: 'lh1', width: 1024, height: 1024, view: 'iso' } }} onSelect={() => {}} />)
    expect(screen.getByAltText('Test Rifle').getAttribute('src')).toBe('https://renders.scbridge.app/lh1/512.webp')
  })
})
