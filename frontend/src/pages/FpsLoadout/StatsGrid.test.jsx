// frontend/src/pages/FpsLoadout/StatsGrid.test.jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatsGrid from './StatsGrid'

const BASE_STATS = { damage: 22, rounds_per_minute: 600, dps: 220, ammo_capacity: 30, damage_type: 'Ballistic' }
const STATS = { damage: 23.8, rpm: 480, dps: 190, recoil: 0.84 }

const FULL_CELL_COUNT = 19

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

  it('populates Recoil Recovery and Stability from build multipliers', () => {
    const stats = {
      damage: 14.5, rpm: 650, dps: 157, recoil: 0.9,
      multipliers: { weapon_recoil_kick: 0.9, weapon_recoil_handling: 0.85, weapon_recoil_smoothness: 1.05 },
    }
    render(<StatsGrid baseStats={BASE_STATS} stats={stats} />)

    const recovery = screen.getByText('Recoil Recovery').closest('[data-testid="stat-cell"]')
    const stability = screen.getByText('Recoil Stability').closest('[data-testid="stat-cell"]')

    // handling 0.85 → shown as ×0.85, +15% faster (green/positive improvement)
    expect(recovery).toHaveTextContent('×0.85')
    expect(recovery).toHaveTextContent('15% faster')
    // smoothness 1.05 → ×1.05, worse (looser) since >1.0
    expect(stability).toHaveTextContent('×1.05')
    expect(stability).toHaveTextContent('looser')
  })

  it('shows recoil cells as N/A when no multipliers present', () => {
    render(<StatsGrid baseStats={BASE_STATS} stats={{ damage: 22, rpm: 600, dps: 220 }} />)
    const recovery = screen.getByText('Recoil Recovery').closest('[data-testid="stat-cell"]')
    const stability = screen.getByText('Recoil Stability').closest('[data-testid="stat-cell"]')
    expect(recovery).toHaveTextContent('—')
    expect(stability).toHaveTextContent('—')
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

  it('shows suppressor sound + heat multipliers and the equipped optic zoom', () => {
    const stats = {
      damage: 22, rpm: 600, dps: 220,
      zoom: '4× / 8×',
      multipliers: { sound_radius: 0.66, heat: 0.75 },
    }
    render(<StatsGrid baseStats={BASE_STATS} stats={stats} />)
    const soundCell = screen.getByText('Sound').closest('[data-testid="stat-cell"]')
    expect(soundCell).toHaveTextContent('×0.66')
    expect(soundCell).toHaveTextContent('34% quieter')
    const heatCell = screen.getByText('Heat / Shot').closest('[data-testid="stat-cell"]')
    expect(heatCell).toHaveTextContent('×0.75')
    expect(heatCell).toHaveTextContent('25% cooler')
    const zoomCell = screen.getByText('Zoom').closest('[data-testid="stat-cell"]')
    expect(zoomCell).toHaveTextContent('4× / 8×')
  })

  it('shows the ADS speed multiplier from an equipped optic', () => {
    const stats = { damage: 22, rpm: 600, dps: 220, multipliers: { ads_speed: 1.15 } }
    render(<StatsGrid baseStats={BASE_STATS} stats={stats} />)
    const cell = screen.getByText('ADS Speed').closest('[data-testid="stat-cell"]')
    expect(cell).toHaveTextContent('×1.15')
    expect(cell).toHaveTextContent('15% faster')
  })

  it('shows a slower ADS speed for heavy scopes (16x = ×0.75)', () => {
    const stats = { damage: 22, rpm: 600, dps: 220, multipliers: { ads_speed: 0.75 } }
    render(<StatsGrid baseStats={BASE_STATS} stats={stats} />)
    const cell = screen.getByText('ADS Speed').closest('[data-testid="stat-cell"]')
    expect(cell).toHaveTextContent('×0.75')
    expect(cell).toHaveTextContent('25% slower')
  })

  it('shows the multiplied projectile speed with a delta', () => {
    const base = { ...BASE_STATS, projectile_speed: 800 }
    const stats = { damage: 22, rpm: 600, dps: 220, projectileSpeed: 700, multipliers: {} }
    render(<StatsGrid baseStats={base} stats={stats} />)
    const cell = screen.getByText('Proj. Speed').closest('[data-testid="stat-cell"]')
    expect(cell).toHaveTextContent('700')
    expect(cell).toHaveTextContent('-13%')
  })
})
