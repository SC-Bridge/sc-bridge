import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ItemSource from './ItemSource'

const weapons = [
  { uuid: 'w1', name: 'P4-AR Rifle', sub_type: 'rifle' },
  { uuid: 'w2', name: 'A03 Sniper Rifle', sub_type: 'sniper' },
]
const builds = [{ id: 1, name: 'CQB Build', weapon_uuid: 'w1', config: {} }]
const ownership = { owned: new Set(['w1']), wishlisted: new Set(['w2']) }

describe('ItemSource', () => {
  it('defaults to the Weapons tab with the first sub-filter active for a weapon slot', () => {
    render(<ItemSource slotKey="primary" weapons={weapons} attachments={[]} builds={[]} ownership={{}} onPick={() => {}} />)
    expect(screen.getByTestId('type-weapons')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('cat-rifles')).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows an owned tick for P4-AR, renders the custom build with a CUSTOM tag, and fires onPick on click', () => {
    const onPick = vi.fn()
    render(<ItemSource slotKey="primary" weapons={weapons} attachments={[]} builds={builds} ownership={ownership} onPick={onPick} />)

    // P4-AR (owned) is visible under the default Rifles sub-filter.
    expect(screen.getByText('P4-AR Rifle')).toBeInTheDocument()
    expect(screen.getByLabelText('owned')).toBeInTheDocument()

    // The saved build for this slot's weapon sits at the top, tagged as a custom design.
    expect(screen.getByText('CQB Build')).toBeInTheDocument()
    expect(screen.getByText(/CUSTOM Q/)).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('item-weapon-w1'))
    expect(onPick).toHaveBeenCalledWith(weapons[0])
  })

  it('narrows to the Sniper sub-filter, showing A03 with an aspirational badge and hiding P4-AR', () => {
    render(<ItemSource slotKey="primary" weapons={weapons} attachments={[]} builds={[]} ownership={ownership} onPick={() => {}} />)

    expect(screen.queryByText('A03 Sniper Rifle')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('cat-sniper'))

    expect(screen.getByText('A03 Sniper Rifle')).toBeInTheDocument()
    expect(screen.getByLabelText('aspirational')).toBeInTheDocument()
    expect(screen.queryByText('P4-AR Rifle')).not.toBeInTheDocument()
  })

  it('renders empty "coming soon" states for Armour and Utility tabs', () => {
    render(<ItemSource slotKey="helmet" weapons={weapons} attachments={[]} builds={[]} ownership={{}} onPick={() => {}} />)
    expect(screen.getByTestId('type-armour')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/Armour catalog coming soon/)).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('type-utility'))
    expect(screen.getByText(/Utility catalog coming soon/)).toBeInTheDocument()
  })

  it('lists attachments on the Attach tab', () => {
    const attachments = [{ uuid: 'a1', name: 'Stark Barrel', sub_type: 'barrel' }]
    const onPick = vi.fn()
    render(<ItemSource slotKey="primary" weapons={[]} attachments={attachments} builds={[]} ownership={{}} onPick={onPick} />)

    fireEvent.click(screen.getByTestId('type-attach'))
    expect(screen.getByText('Stark Barrel')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('item-attach-a1'))
    expect(onPick).toHaveBeenCalledWith(attachments[0])
  })
})
