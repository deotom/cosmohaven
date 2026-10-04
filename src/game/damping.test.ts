import { describe, expect, it } from 'vitest'
import { MAX_LINEAR_DAMPING, linearDamping } from './damping'

const terms = { base: 0.3, well: 0, freedom: 0, atmosphereDrag: 0.35, atmosphere: 0, landed: 0 }

describe('ship linear damping', () => {
  it('stays inside [0, MAX] for every combination the game can produce (a damping of 1 or more makes cannon return NaN)', () => {
    for (let freedom = 0; freedom <= 1.0001; freedom += 0.1) {
      for (let atmosphere = 0; atmosphere <= 1.0001; atmosphere += 0.1) {
        for (const landed of [0, 0.6, 0.9, 5]) {
          const damping = linearDamping({ ...terms, freedom, atmosphere, landed })
          expect(Number.isFinite(damping)).toBe(true)
          expect(damping).toBeGreaterThanOrEqual(0)
          expect(damping).toBeLessThanOrEqual(MAX_LINEAR_DAMPING)
        }
      }
    }
  })

  it('matches the plain formula whenever it is below the cap (nothing else changes)', () => {
    expect(linearDamping(terms)).toBeCloseTo(0.3, 9) // open space
    expect(linearDamping({ ...terms, freedom: 1 })).toBeCloseTo(0, 9) // deep in a well
    expect(linearDamping({ ...terms, freedom: 1, atmosphere: 1 })).toBeCloseTo(0.35, 9) // on a surface with an atmosphere
  })

  it('the old landing value of 0.9 on top of the surface drag would have exceeded 1 and is now capped', () => {
    const surface = { ...terms, freedom: 1, atmosphere: 1 }
    expect(0 + 0.35 + 0.9).toBeGreaterThan(1) // what the first version of the landing fix computed
    expect(linearDamping({ ...surface, landed: 0.9 })).toBe(MAX_LINEAR_DAMPING)
  })

  it('resting on the ground never lowers the damping', () => {
    for (let freedom = 0; freedom <= 1; freedom += 0.25) {
      for (let atmosphere = 0; atmosphere <= 1; atmosphere += 0.25) {
        const flying = linearDamping({ ...terms, freedom, atmosphere })
        const resting = linearDamping({ ...terms, freedom, atmosphere, landed: 0.6 })
        expect(resting).toBeGreaterThanOrEqual(flying)
      }
    }
  })

  it('falls back to the base drag if an input is not a finite number', () => {
    expect(linearDamping({ ...terms, freedom: Number.NaN })).toBe(0.3)
  })
})
