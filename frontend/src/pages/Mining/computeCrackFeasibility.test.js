import { describe, it, expect } from 'vitest'
import { computeCrackFeasibility } from './computeCrackFeasibility'

describe('computeCrackFeasibility', () => {
  describe('ship row (10/0.2)', () => {
    const globalParams = { power_capacity_per_mass: 10, decay_per_mass: 0.2 }

    it('mass 8000, effectiveDPS 2000: crack feasible (canCrack=true)', () => {
      const result = computeCrackFeasibility({
        mass: 8000,
        globalParams,
        effectiveDPS: 2000,
      })
      expect(result).toEqual({
        capacity: 80000,
        decay: 1600,
        netRate: 400,
        canCrack: true,
        timeToCrack: 200,
        marginPct: 25,
      })
    })

    it('mass 8000, effectiveDPS 1600: cannot crack (netRate=0)', () => {
      const result = computeCrackFeasibility({
        mass: 8000,
        globalParams,
        effectiveDPS: 1600,
      })
      expect(result).toEqual({
        capacity: 80000,
        decay: 1600,
        netRate: 0,
        canCrack: false,
        timeToCrack: null,
        marginPct: 0,
      })
    })
  })

  describe('fps row (5/0.2)', () => {
    const globalParams = { power_capacity_per_mass: 5, decay_per_mass: 0.2 }

    it('mass 1: capacity=5, decay=0.2', () => {
      const result = computeCrackFeasibility({
        mass: 1,
        globalParams,
        effectiveDPS: 1,
      })
      expect(result.capacity).toBe(5)
      expect(result.decay).toBe(0.2)
    })
  })

  describe('gv row (4/0.2)', () => {
    const globalParams = { power_capacity_per_mass: 4, decay_per_mass: 0.2 }

    it('mass 400: capacity=1600, decay=80', () => {
      const result = computeCrackFeasibility({
        mass: 400,
        globalParams,
        effectiveDPS: 1,
      })
      expect(result.capacity).toBe(1600)
      expect(result.decay).toBe(80)
    })
  })

  describe('guards', () => {
    const globalParams = { power_capacity_per_mass: 10, decay_per_mass: 0.2 }

    it('mass 0: returns null', () => {
      const result = computeCrackFeasibility({
        mass: 0,
        globalParams,
        effectiveDPS: 1,
      })
      expect(result).toBeNull()
    })

    it('mass -5: returns null', () => {
      const result = computeCrackFeasibility({
        mass: -5,
        globalParams,
        effectiveDPS: 1,
      })
      expect(result).toBeNull()
    })

    it('missing power_capacity_per_mass: returns null', () => {
      const result = computeCrackFeasibility({
        mass: 100,
        globalParams: { decay_per_mass: 0.2 },
        effectiveDPS: 1,
      })
      expect(result).toBeNull()
    })

    it('missing decay_per_mass: returns null', () => {
      const result = computeCrackFeasibility({
        mass: 100,
        globalParams: { power_capacity_per_mass: 10 },
        effectiveDPS: 1,
      })
      expect(result).toBeNull()
    })

    it('undefined globalParams: returns null', () => {
      const result = computeCrackFeasibility({
        mass: 100,
        globalParams: undefined,
        effectiveDPS: 1,
      })
      expect(result).toBeNull()
    })

    it('null globalParams: returns null', () => {
      const result = computeCrackFeasibility({
        mass: 100,
        globalParams: null,
        effectiveDPS: 1,
      })
      expect(result).toBeNull()
    })

    it('non-number mass: returns null', () => {
      const result = computeCrackFeasibility({
        mass: 'invalid',
        globalParams,
        effectiveDPS: 1,
      })
      expect(result).toBeNull()
    })

    it('undefined effectiveDPS treated as 0', () => {
      const result = computeCrackFeasibility({
        mass: 100,
        globalParams,
        effectiveDPS: undefined,
      })
      expect(result.netRate).toBe(-20) // 0 - (0.2 * 100)
    })
  })
})
