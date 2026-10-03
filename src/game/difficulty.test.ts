import { afterEach, describe, expect, it } from 'vitest'
import { getBlockCost, getFoldCost, getRepairCost, gameStats } from './gameState'
import { adjustedCost, DIFFICULTY_PROFILES } from './difficulty'
import { nextUpgradeCost } from './upgrades'

describe('difficulty profiles', () => {
  afterEach(() => {
    gameStats.difficulty = 'standard'
    gameStats.harvesterTier = 1
  })

  it('uses the approved meteor intervals', () => {
    expect(DIFFICULTY_PROFILES.relaxed.meteorInterval).toEqual([30, 40])
    expect(DIFFICULTY_PROFILES.standard.meteorInterval).toEqual([15, 20])
    expect(DIFFICULTY_PROFILES.challenging.meteorInterval).toEqual([8, 12])
  })

  it('scales every purchase price and keeps free upgrades free', () => {
    expect(adjustedCost(40, 'relaxed')).toBe(32)
    expect(adjustedCost(40, 'standard')).toBe(40)
    expect(adjustedCost(40, 'challenging')).toBe(50)
    expect(adjustedCost(0, 'challenging')).toBe(0)
  })

  it('rejects invalid base prices', () => {
    expect(() => adjustedCost(-1, 'standard')).toThrow('non-negative')
    expect(() => adjustedCost(Number.NaN, 'standard')).toThrow('non-negative')
  })

  it('applies prices consistently to purchases and upgrades', () => {
    gameStats.difficulty = 'relaxed'
    expect(getBlockCost('hull')).toBe(8)
    expect(getFoldCost()).toBe(32)
    expect(getRepairCost()).toBe(12)
    expect(nextUpgradeCost('harvester')).toBe(64)

    gameStats.difficulty = 'challenging'
    expect(getBlockCost('food')).toBe(38)
    expect(getFoldCost()).toBe(50)
    expect(getRepairCost()).toBe(19)
    expect(nextUpgradeCost('harvester')).toBe(100)
  })
})
