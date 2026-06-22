import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const headData = {
  head_uuid: 'head-helix',
  head_name: 'Helix II Mining Laser',
  kind: 'mining',
  slots: [
    {
      slot_index: 0,
      compatible: [
        { uuid: 'lm-brandt', name: 'Brandt Module', size: 1, price: 2138, damage_multiplier: 1.15, mod_resistance: 0.1 },
        { uuid: 'lm-focus', name: 'Focus Module', size: 1, price: 3800, damage_multiplier: 1, mod_optimal_window_size: 0.2 },
      ],
    },
  ],
}

vi.mock('../../hooks/useAPI', () => ({ useHeadGadgets: () => ({ data: headData }) }))

import GadgetModulesSection from './GadgetModulesSection'

const head = { uuid: 'head-helix', port_name: 'hardpoint_mining_arm', name: 'Helix II Mining Laser' }

describe('GadgetModulesSection', () => {
  it('renders the head title and gadget prices', () => {
    render(<GadgetModulesSection head={head} />)
    expect(screen.getByText(/Mining Modules/)).toBeInTheDocument()
    expect(screen.getByText('2,138 aUEC')).toBeInTheDocument()
    expect(screen.getByText('3,800 aUEC')).toBeInTheDocument()
  })

  it('read-only without onSelect: gadgets are not buttons', () => {
    render(<GadgetModulesSection head={head} />)
    expect(screen.queryByRole('button', { name: /Brandt Module/ })).not.toBeInTheDocument()
  })

  it('editable: clicking a gadget calls onSelect with the slot key, gadget, and mining kind', () => {
    const onSelect = vi.fn()
    render(<GadgetModulesSection head={head} selections={{}} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('Brandt Module'))
    expect(onSelect).toHaveBeenCalledWith(
      'hardpoint_mining_arm#0',
      expect.objectContaining({ uuid: 'lm-brandt' }),
      'mining_gadget',
    )
  })

  it('editable: an Empty option clears the slot (onSelect with null)', () => {
    const onSelect = vi.fn()
    render(<GadgetModulesSection head={head} selections={{ 'hardpoint_mining_arm#0': 'lm-brandt' }} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('Empty'))
    expect(onSelect).toHaveBeenCalledWith('hardpoint_mining_arm#0', null, 'mining')
  })

  it('shows the combined effect of the selected mining module', () => {
    render(<GadgetModulesSection head={head} selections={{ 'hardpoint_mining_arm#0': 'lm-brandt' }} onSelect={() => {}} />)
    expect(screen.getByText('Combined Effect')).toBeInTheDocument()
    expect(screen.getByText('×1.15')).toBeInTheDocument() // damage multiplier
    expect(screen.getByText('+10%')).toBeInTheDocument()  // mod_resistance
  })
})
