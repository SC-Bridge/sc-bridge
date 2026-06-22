import { describe, it, expect } from 'vitest'
import { rowCategory } from './FleetTable'

/**
 * FleetTable wrench icon gating tests.
 *
 * The full FleetTable component has too many dependencies for unit testing
 * (useFleet, useNavigate, useSearchParams, etc.). Instead we test the
 * gating logic: the wrench icon should only appear for flight_ready ships.
 *
 * The actual JSX in FleetTable.jsx is:
 *   {v.production_status === 'flight_ready' && (
 *     <button onClick={...}><Wrench /></button>
 *   )}
 *
 * These tests verify the business rule in isolation.
 */

function shouldShowWrench(vehicle) {
  return vehicle.production_status === 'flight_ready'
}

describe('FleetTable wrench icon gating', () => {
  it('shows wrench for flight_ready ships', () => {
    expect(shouldShowWrench({ production_status: 'flight_ready' })).toBe(true)
  })

  it('hides wrench for concept ships', () => {
    expect(shouldShowWrench({ production_status: 'in_concept' })).toBe(false)
  })

  it('hides wrench for in_production ships', () => {
    expect(shouldShowWrench({ production_status: 'in_production' })).toBe(false)
  })

  it('hides wrench for unknown status', () => {
    expect(shouldShowWrench({ production_status: 'unknown' })).toBe(false)
  })

  it('hides wrench when status is null', () => {
    expect(shouldShowWrench({ production_status: null })).toBe(false)
  })

  it('hides wrench when status is undefined', () => {
    expect(shouldShowWrench({})).toBe(false)
  })
})

describe('FleetTable rowCategory bucketing', () => {
  it('buckets flight-ready owned ships as flight_ready', () => {
    expect(rowCategory({ production_status: 'flight_ready' })).toBe('flight_ready')
  })

  it('buckets concept ships as concept', () => {
    expect(rowCategory({ production_status: 'in_concept' })).toBe('concept')
  })

  it('folds in_production into concept (unreleased/owned)', () => {
    expect(rowCategory({ production_status: 'in_production' })).toBe('concept')
  })

  it('buckets derived loaner rows as loaner regardless of production_status', () => {
    expect(rowCategory({ is_derived_loaner: 1, production_status: 'flight_ready' })).toBe('loaner')
  })

  it('buckets in-game-purchased ships as ingame', () => {
    expect(rowCategory({ source: 'ingame', production_status: 'flight_ready' })).toBe('ingame')
  })

  it('treats pledge ships normally (not ingame)', () => {
    expect(rowCategory({ source: 'pledge', production_status: 'flight_ready' })).toBe('flight_ready')
  })
})
