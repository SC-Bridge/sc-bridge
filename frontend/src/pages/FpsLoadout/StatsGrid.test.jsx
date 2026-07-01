// frontend/src/pages/FpsLoadout/StatsGrid.test.jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatsGrid from './StatsGrid'

const BASE_STATS = { damage: 22, rounds_per_minute: 600, dps: 220, ammo_capacity: 30, damage_type: 'Ballistic' }
const STATS = { damage: 23.8, rpm: 480, dps: 190, recoil: 0.84 }

const FULL_CELL_COUNT = 18

describe('StatsGrid', () => {
  it('renders the full fixed set of stat cells regardless of input', () => {
    render(<StatsGrid baseStats={BASE_STATS} stats={STATS} />)
    expect(screen.getAllByTestId('stat-cell')).toHaveLength(FULL_CELL_COUNT)
  })

  it('renders the full fixed set even with sparse/empty input', () => {
    render(<StatsGrid baseStats={{}} stats={{}} />)
    expect(screen.getAllByTestId('stat-cell')).toHaveLength(FULL_CELL_COUNT)
  })

  it('renders the full fixed set with null baseStats/stats', () => {
    render(<StatsGrid baseStats={null} stats={null} />)
    expect(screen.getAllByTestId('stat-cell')).toHaveLength(FULL_CELL_COUNT)
  })

  it('shows Damage value and delta vs base', () => {
    render(<StatsGrid baseStats={BASE_STATS} stats={STATS} />)
    expect(screen.getByText('Damage')).toBeInTheDocument()
    expect(screen.getByText('23.8')).toBeInTheDocument()
    expect(screen.getByText('+8%')).toBeInTheDocument()
  })

  it('shows em-dash for Heat / Overheat / Charge Time (not in base_stats)', () => {
    render(<StatsGrid baseStats={BASE_STATS} stats={STATS} />)

    const heatCell = screen.getByText('Heat / Shot').closest('[data-testid="stat-cell"]')
    const overheatCell = screen.getByText('Overheat').closest('[data-testid="stat-cell"]')
    const chargeCell = screen.getByText('Charge Time').closest('[data-testid="stat-cell"]')

    expect(heatCell).toHaveTextContent('—')
    expect(overheatCell).toHaveTextContent('—')
    expect(chargeCell).toHaveTextContent('—')
  })
})
