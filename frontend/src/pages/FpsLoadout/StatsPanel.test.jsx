// frontend/src/pages/FpsLoadout/StatsPanel.test.jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatsPanel from './StatsPanel'

const BASE = { damage: 13, rounds_per_minute: 950, dps: 205.8, effective_range: 20, ammo_capacity: 25 }
const STATS = { damage: 13.62, rpm: 818, dps: 185.4, recoil: 0.864, multipliers: {} }

describe('StatsPanel', () => {
  it('shows base → build for damage / fire rate / dps', () => {
    render(<StatsPanel baseStats={BASE} stats={STATS} />)
    expect(screen.getByText('Damage')).toBeInTheDocument()
    expect(screen.getByText('13.6')).toBeInTheDocument()       // build damage, 1 dp
    expect(screen.getByText('818')).toBeInTheDocument()        // build rpm, 0 dp
    expect(screen.getByText(/Fire Rate/)).toBeInTheDocument()
    expect(screen.getByText('DPS')).toBeInTheDocument()
  })
  it('shows recoil as a multiplier and unaffected stats as fixed', () => {
    render(<StatsPanel baseStats={BASE} stats={STATS} />)
    expect(screen.getByText('×0.86')).toBeInTheDocument()      // recoil
    expect(screen.getByText('20 m')).toBeInTheDocument()       // range, unaffected
    expect(screen.getByText('25')).toBeInTheDocument()         // magazine
  })
})
