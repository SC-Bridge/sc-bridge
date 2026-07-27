import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ArmourStatsGrid from './ArmourStatsGrid'

const BASE = { resist_physical: 0.2, resist_energy: 0.15, resist_distortion: 0.1, resist_thermal: 0.05, resist_biochemical: 0, resist_stun: 0, temperature_min: -80, temperature_max: 120, weight: 12.5 }

describe('ArmourStatsGrid', () => {
  it('renders all nine cells even when values are missing (fixed layout)', () => {
    render(<ArmourStatsGrid baseStats={{}} stats={{}} />)
    expect(screen.getAllByTestId('stat-cell')).toHaveLength(9)
  })

  it('shows resistances as percentages with delta vs base', () => {
    render(<ArmourStatsGrid baseStats={BASE} stats={{ ...BASE, resist_physical: 0.24 }} />)
    expect(screen.getByText('24%')).toBeInTheDocument()  // crafted physical resist
    expect(screen.getByText('+20%')).toBeInTheDocument() // delta vs base (0.2 -> 0.24)
  })

  it('renders the temperature band and weight', () => {
    render(<ArmourStatsGrid baseStats={BASE} stats={BASE} />)
    expect(screen.getByText('-80° / 120°')).toBeInTheDocument()
    expect(screen.getByText('12.5')).toBeInTheDocument()
  })
})
