import { describe, expect, it } from 'vitest'
import type { Block } from './types'
import { engineThrustMultiplier, repairBayNeeded, shieldDamageFactor } from './shipModules'

const blocks = (...types: Block['type'][]): Block[] => types.map((type, index) => ({ type, pos: [index, 0, 0] }))

describe('ship modules', () => {
  it('adds a capped 25% thrust bonus per engine module', () => {
    expect(engineThrustMultiplier(blocks('core'))).toBe(1)
    expect(engineThrustMultiplier(blocks('core', 'engine'))).toBe(1.25)
    expect(engineThrustMultiplier(blocks('core', 'engine', 'engine', 'engine', 'engine', 'engine'))).toBe(2)
  })

  it('reduces impact damage by 20% per shield, capped at 60%', () => {
    expect(shieldDamageFactor(blocks('core'))).toBe(1)
    expect(shieldDamageFactor(blocks('core', 'shield'))).toBe(0.8)
    expect(shieldDamageFactor(blocks('core', 'shield', 'shield', 'shield', 'shield'))).toBe(0.4)
  })

  it('asks the crew to use a repair bay only below 75% hull', () => {
    expect(repairBayNeeded(74.9)).toBe(true)
    expect(repairBayNeeded(75)).toBe(false)
    expect(repairBayNeeded(100)).toBe(false)
  })
})
