import { describe, it, expect } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import HullPanel from './HullPanel'

// Values as the 4.10.3-live pipeline produced them (tools enrich/vehicle_xml.py).
const cutlass = {
  class_name: 'DRAK_Cutlass_Black',
  hull_hp: 6500,
  hull_hp_total: 29760,
  hull_parts: [
    { name: 'Body', hp: 6500, parent: null, vital: true },
    { name: 'Wing_Left', hp: 1500, parent: 'Body', vital: false },
    { name: 'Wing_Right', hp: 1500, parent: 'Body', vital: false },
    { name: 'Canopy', hp: 1000, parent: 'Body', vital: false },
    { name: 'Tail', hp: 6500, parent: 'Body', vital: false },
    { name: 'Thruster_Main_Base_Left', hp: 480, parent: 'Tail', vital: false },
    { name: 'Thruster_Main_Left', hp: 5000, parent: 'Thruster_Main_Base_Left', vital: false },
    { name: 'Thruster_Main_Base_Right', hp: 480, parent: 'Tail', vital: false },
    { name: 'Thruster_Main_Right', hp: 5000, parent: 'Thruster_Main_Base_Right', vital: false },
    { name: 'Missile_Housing_Right', hp: 900, parent: 'Tail', vital: false },
    { name: 'Missile_Housing_Left', hp: 900, parent: 'Tail', vital: false },
  ],
}

function manyParts(n) {
  return [{ name: 'Body', hp: 2350, parent: null, vital: true },
    ...Array.from({ length: n - 1 }, (_, i) => ({ name: `Flap_${i}`, hp: 50, parent: 'Body', vital: false }))]
}

describe('HullPanel (ship overview)', () => {
  it('leads with the total and shows the hull part beside it', () => {
    render(<HullPanel ship={cutlass} />)
    expect(screen.getByText('Hull')).toBeInTheDocument()
    expect(screen.getByTestId('hull-total')).toHaveTextContent('29,760')
    expect(screen.getByTestId('hull-body')).toHaveTextContent('6,500')
  })

  it('lists every part with a readable name, its HP and its depth', () => {
    render(<HullPanel ship={cutlass} />)
    const rows = screen.getAllByTestId('hull-part')
    expect(rows).toHaveLength(11)
    expect(rows[0]).toHaveTextContent('Body')
    expect(rows[0]).toHaveTextContent('6,500')
    expect(rows[6]).toHaveTextContent('Thruster Main Left')
    expect(rows[6]).toHaveTextContent('5,000')
    expect(rows[6].getAttribute('data-depth')).toBe('3')
  })

  it('marks the part whose destruction is the ship\'s', () => {
    render(<HullPanel ship={cutlass} />)
    const rows = screen.getAllByTestId('hull-part')
    expect(within(rows[0]).getByText(/destroys ship/i)).toBeInTheDocument()
    expect(within(rows[1]).queryByText(/destroys ship/i)).not.toBeInTheDocument()
  })

  it('shows a long list collapsed with a toggle for the rest', () => {
    render(<HullPanel ship={{ hull_hp: 2350, hull_hp_total: 3650, hull_parts: manyParts(27) }} />)
    expect(screen.getAllByTestId('hull-part')).toHaveLength(12)
    fireEvent.click(screen.getByRole('button', { name: /show all 27 parts/i }))
    expect(screen.getAllByTestId('hull-part')).toHaveLength(27)
    fireEvent.click(screen.getByRole('button', { name: /show fewer/i }))
    expect(screen.getAllByTestId('hull-part')).toHaveLength(12)
  })

  it('without a breakdown shows the figure it has and no part list', () => {
    render(<HullPanel ship={{ hull_hp: 70000 }} />)
    expect(screen.getByTestId('hull-total')).toHaveTextContent('70,000')
    expect(screen.queryByTestId('hull-body')).not.toBeInTheDocument()
    expect(screen.queryAllByTestId('hull-part')).toHaveLength(0)
  })

  it('renders nothing when the ship has no hull figures (ATLS)', () => {
    const { container } = render(<HullPanel ship={{ hull_hp: null, hull_hp_total: null, hull_parts: null }} />)
    expect(container).toBeEmptyDOMElement()
  })
})
