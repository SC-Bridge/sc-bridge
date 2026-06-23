import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const compatible = [
  { uuid: 'lm-brandt', name: 'Brandt Module', size: 1, price: 2138, damage_multiplier: 1.15, mod_resistance: 0.1 },
  { uuid: 'lm-focus', name: 'Focus Module', size: 1, price: 3800, damage_multiplier: 1, mod_optimal_window_size: 0.2 },
]
const headData = {
  head_name: 'Arbor MH2 Mining Laser',
  kind: 'mining',
  slots: [
    { slot_index: 0, max_size: 1, compatible },
    { slot_index: 1, max_size: 1, compatible },
  ],
}

vi.mock('../../hooks/useAPI', () => ({ useHeadGadgets: () => ({ data: headData }) }))

import GadgetSlots from './GadgetSlots'

describe('GadgetSlots', () => {
  it('renders one empty child row per slot by default', () => {
    render(<GadgetSlots headUuid="head-arbor" portName="turret_1" selections={{}} onSelect={() => {}} />)
    expect(screen.getAllByText('Empty module slot')).toHaveLength(2)
  })

  it('clicking a slot opens the picker; choosing a module calls onSelect with the slot key + kind', () => {
    const onSelect = vi.fn()
    render(<GadgetSlots headUuid="head-arbor" portName="turret_1" selections={{}} onSelect={onSelect} />)
    fireEvent.click(screen.getAllByText('Empty module slot')[0])
    // Picker modal opens
    expect(screen.getByText('Select Mining Module')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Brandt Module'))
    expect(onSelect).toHaveBeenCalledWith('turret_1#0', expect.objectContaining({ uuid: 'lm-brandt' }), 'mining_gadget')
  })

  it('shows the installed module name and the combined effect when a slot is filled', () => {
    render(<GadgetSlots headUuid="head-arbor" portName="turret_1" selections={{ 'turret_1#0': 'lm-brandt' }} onSelect={() => {}} />)
    expect(screen.getByText('Brandt Module')).toBeInTheDocument()
    expect(screen.getByText('×1.15')).toBeInTheDocument()
    expect(screen.getByText('+10%')).toBeInTheDocument() // mod_resistance
    expect(screen.getByText('Empty module slot')).toBeInTheDocument() // the other slot still empty
  })

  it('is read-only without onSelect (rows are not buttons)', () => {
    render(<GadgetSlots headUuid="head-arbor" portName="turret_1" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
