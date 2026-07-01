// frontend/src/pages/FpsLoadout/LoadoutStats.test.jsx
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import LoadoutStats from './LoadoutStats'

const WEAPON_STATS = [
  { slot_key: 'primary', name: 'P4-AR Rifle', damage: 23.8, rpm: 480, dps: 190, recoil: 0.84, isDesign: true, attachments: ['barrel'] },
  { slot_key: 'sidearm', name: 'LH86 Pistol', damage: 13, rpm: 950, dps: 206, recoil: 1.0, isDesign: false, attachments: [] },
]

const RESIST_ROWS = ['physical', 'energy', 'distortion', 'temperature']
const ARMOUR_COLS = ['Helmet', 'Core', 'Arms', 'Legs']

describe('LoadoutStats', () => {
  it('renders a weapon row per equipped weapon', () => {
    render(<LoadoutStats weaponStats={WEAPON_STATS} />)
    expect(screen.getByTestId('weapon-stat-row-primary')).toHaveTextContent('P4-AR Rifle')
    expect(screen.getByTestId('weapon-stat-row-sidearm')).toHaveTextContent('LH86 Pistol')
  })

  it('shows DPS, a DESIGN tag, and attachment mini-icons for the P4-AR', () => {
    render(<LoadoutStats weaponStats={WEAPON_STATS} />)
    const row = screen.getByTestId('weapon-stat-row-primary')
    expect(row).toHaveTextContent('190')
    expect(within(row).getByTestId('design-tag')).toHaveTextContent('DESIGN')
    expect(within(row).getByTestId('attmini-barrel')).toBeInTheDocument()
  })

  it('shows an em-dash for the LH86 (no attachments)', () => {
    render(<LoadoutStats weaponStats={WEAPON_STATS} />)
    const row = screen.getByTestId('weapon-stat-row-sidearm')
    expect(row).toHaveTextContent('—')
    expect(within(row).queryByTestId(/attmini-/)).not.toBeInTheDocument()
  })

  it('shows a "No weapons equipped" row when weaponStats is empty', () => {
    render(<LoadoutStats weaponStats={[]} />)
    expect(screen.getByText('No weapons equipped')).toBeInTheDocument()
  })

  it('renders the 4 armour resistance rows x 5 columns, all em-dash', () => {
    render(<LoadoutStats weaponStats={WEAPON_STATS} />)
    const table = screen.getByTestId('armour-stats-table')

    RESIST_ROWS.forEach((r) => {
      const row = screen.getByTestId(`armour-stat-row-${r}`)
      // Σ Total + 4 per-piece columns = 5 dashed cells per row
      const cells = within(row).getAllByText('—')
      expect(cells).toHaveLength(1 + ARMOUR_COLS.length)
    })

    ARMOUR_COLS.forEach((c) => {
      expect(within(table).getByText(c)).toBeInTheDocument()
    })
    expect(within(table).getByText('Σ Total')).toBeInTheDocument()
  })
})
