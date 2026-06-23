import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import GadgetPicker from './GadgetPicker'

const compatible = [
  { uuid: 'lm-brandt', name: 'Brandt Module', size: 1, price: 2138, damage_multiplier: 1.15, mod_resistance: 0.1 },
  { uuid: 'lm-focus', name: 'Focus Module', size: 1, price: 3800, damage_multiplier: 1, mod_optimal_window_size: 0.2 },
]

describe('GadgetPicker', () => {
  it('lists compatible modules with prices and a Leave empty option', () => {
    render(<GadgetPicker slotLabel="Helix · Slot 1" kind="mining" compatible={compatible} installedUuid={null} onSelect={() => {}} onClose={() => {}} />)
    expect(screen.getByText('Brandt Module')).toBeInTheDocument()
    expect(screen.getByText('2,138 aUEC')).toBeInTheDocument()
    expect(screen.getByText('Leave empty')).toBeInTheDocument()
  })

  it('clicking a module selects it and closes', () => {
    const onSelect = vi.fn(), onClose = vi.fn()
    render(<GadgetPicker slotLabel="x" kind="mining" compatible={compatible} installedUuid={null} onSelect={onSelect} onClose={onClose} />)
    fireEvent.click(screen.getByText('Focus Module'))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ uuid: 'lm-focus' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('clicking Leave empty clears the slot', () => {
    const onSelect = vi.fn(), onClose = vi.fn()
    render(<GadgetPicker slotLabel="x" kind="mining" compatible={compatible} installedUuid="lm-brandt" onSelect={onSelect} onClose={onClose} />)
    fireEvent.click(screen.getByText('Leave empty'))
    expect(onSelect).toHaveBeenCalledWith(null)
    expect(onClose).toHaveBeenCalled()
  })
})
