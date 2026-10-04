import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  FOLD_AUTO_RETRY_MS,
  FOLD_CANCEL_REFUND,
  FOLD_CHARGE_TIME,
  FOLD_DAMAGE_ABORT,
  advanceFold,
  cancelFold,
  foldChecklist,
  requestFold,
  resetFoldThrottle,
  toggleFold,
} from './fold'
import { setDock } from './dock'
import { CELESTIAL_BODIES, gameStats, getFoldCost, type CelestialBody } from './gameState'
import { arrivalHazard, earthSector, generateSector, getSector, homeSector, type Sector } from './sector'
import { shipState } from './shipState'

const world: CelestialBody = {
  name: 'Test World',
  position: [0, 0, -1000],
  radius: 100,
  gm: 0.25 * 400 ** 2,
  wellRadius: 400,
  atmosphereHeight: 50,
}

/** Charges the drive until it jumps, in 0.1 s frames; returns whether it jumped. */
function chargeThrough() {
  for (let i = 0; i < Math.ceil((FOLD_CHARGE_TIME / 0.1) * 2); i++) {
    if (advanceFold(0.1)) return true
    if (gameStats.fold.phase !== 'charging') return false
  }
  return false
}

beforeEach(() => {
  gameStats.credits = 200
  gameStats.hull = 100
  gameStats.victory = false
  gameStats.relics = 0
  gameStats.difficulty = 'standard'
  gameStats.fold = { phase: 'idle', charge: 0, reserved: 0 }
  setDock({ phase: 'free', stationId: 0 })
  shipState.position.set(0, 0, 0)
  CELESTIAL_BODIES.length = 0
  resetFoldThrottle()
})

afterEach(() => {
  gameStats.fold = { phase: 'idle', charge: 0, reserved: 0 }
  setDock({ phase: 'docked', stationId: 0 })
  CELESTIAL_BODIES.length = 0
})

describe('fold checklist', () => {
  it('is all clear in open space with enough HC', () => {
    expect(foldChecklist().every((check) => check.ok)).toBe(true)
  })

  it('reports each unmet condition', () => {
    setDock({ phase: 'docked' })
    gameStats.credits = 0
    CELESTIAL_BODIES.push(world)
    shipState.position.set(0, 0, -880) // inside the atmosphere and the deep well
    const failed = foldChecklist().filter((check) => !check.ok).map((check) => check.id)
    expect(failed).toEqual(['undocked', 'atmosphere', 'gravity-well', 'credits'])
  })

  it('counts only the inner part of a well as deep', () => {
    CELESTIAL_BODIES.push(world)
    shipState.position.set(0, 0, -1000 + 350) // 350 from the centre: inside the well, outside its deep part
    expect(foldChecklist().every((check) => check.ok)).toBe(true)
    shipState.position.set(0, 0, -1000 + 250)
    expect(foldChecklist().find((check) => check.id === 'gravity-well')?.ok).toBe(false)
  })
})

describe('starting a fold', () => {
  it('takes the fee up front and starts charging', () => {
    expect(requestFold()).toBe('started')
    expect(gameStats.fold.phase).toBe('charging')
    expect(gameStats.fold.reserved).toBe(getFoldCost())
    expect(gameStats.credits).toBe(200 - getFoldCost())
  })

  it('refuses when docked, in a deep well, in an atmosphere or short of HC, without spending anything', () => {
    setDock({ phase: 'docked' })
    expect(requestFold()).toBe('blocked')

    setDock({ phase: 'free' })
    CELESTIAL_BODIES.push(world)
    shipState.position.set(0, 0, -750)
    expect(requestFold()).toBe('blocked')
    shipState.position.set(0, 0, -880)
    expect(requestFold()).toBe('blocked')

    CELESTIAL_BODIES.length = 0
    gameStats.credits = getFoldCost() - 1
    expect(requestFold()).toBe('blocked')

    expect(gameStats.credits).toBe(getFoldCost() - 1)
    expect(gameStats.fold.phase).toBe('idle')
    expect(gameStats.fold.reserved).toBe(0)
  })

  it('ignores a request while already folding or after victory', () => {
    expect(requestFold()).toBe('started')
    expect(requestFold()).toBe('ignored')
    cancelFold()
    gameStats.victory = true
    expect(requestFold()).toBe('ignored')
  })
})

describe('cancelling and interruptions', () => {
  it('cancelling refunds most of the fee and returns to idle', () => {
    const cost = getFoldCost()
    requestFold()
    advanceFold(0.5)
    expect(cancelFold()).toBe(true)
    expect(gameStats.fold).toEqual({ phase: 'idle', charge: 0, reserved: 0 })
    expect(gameStats.credits).toBe(200 - cost + Math.round(cost * FOLD_CANCEL_REFUND))
  })

  it('has nothing to cancel when idle', () => {
    expect(cancelFold()).toBe(false)
    expect(gameStats.credits).toBe(200)
  })

  it('the fold key cancels a charge and otherwise starts one', () => {
    expect(toggleFold()).toBe('started')
    expect(toggleFold()).toBe('cancelled')
    expect(gameStats.fold.phase).toBe('idle')
  })

  it('a hit during the charge aborts it and refunds the whole fee', () => {
    requestFold()
    advanceFold(0.5)
    gameStats.hull -= FOLD_DAMAGE_ABORT
    expect(advanceFold(0.1)).toBe(false)
    expect(gameStats.fold.phase).toBe('idle')
    expect(gameStats.credits).toBe(200)
  })

  it('a small knock does not abort it', () => {
    requestFold()
    gameStats.hull -= FOLD_DAMAGE_ABORT - 1
    advanceFold(0.1)
    expect(gameStats.fold.phase).toBe('charging')
  })

  it('a low hull alone does not stop an evacuation that began before the damage', () => {
    gameStats.hull = 20
    expect(requestFold('auto')).toBe('started')
    expect(chargeThrough()).toBe(true)
  })

  it('drifting into a deep well aborts it with a full refund', () => {
    CELESTIAL_BODIES.push(world)
    shipState.position.set(0, 0, -600) // outside the deep part
    expect(requestFold()).toBe('started')
    shipState.position.set(0, 0, -750)
    advanceFold(0.1)
    expect(gameStats.fold.phase).toBe('idle')
    expect(gameStats.credits).toBe(200)
  })
})

describe('completing a fold', () => {
  it('jumps after the charge time and keeps the fee', () => {
    const cost = getFoldCost()
    requestFold()
    expect(chargeThrough()).toBe(true)
    expect(gameStats.fold.phase).toBe('arriving')
    expect(gameStats.fold.reserved).toBe(0)
    expect(gameStats.credits).toBe(200 - cost)
    expect(arrivalHazard(getSector())).toBeNull()
  })

  it('returns to idle once the arrival flash has faded', () => {
    requestFold()
    chargeThrough()
    for (let i = 0; i < 40; i++) advanceFold(0.1)
    expect(gameStats.fold.phase).toBe('idle')
  })
})

describe('automatic (evacuation) requests', () => {
  it('are refused quietly and then throttled instead of retrying every frame', () => {
    gameStats.credits = 0
    expect(requestFold('auto', 1000)).toBe('blocked')
    for (let t = 1001; t < 1000 + FOLD_AUTO_RETRY_MS; t += 16) expect(requestFold('auto', t)).toBe('cooldown')
    expect(requestFold('auto', 1000 + FOLD_AUTO_RETRY_MS)).toBe('blocked')
    expect(gameStats.credits).toBe(0)
  })

  it('start a fold as soon as the conditions are met', () => {
    expect(requestFold('auto', 5000)).toBe('started')
  })

  it('manual requests are never throttled', () => {
    gameStats.credits = 0
    requestFold('auto', 1000)
    expect(requestFold('manual', 1001)).toBe('blocked')
    gameStats.credits = 200
    expect(requestFold('manual', 1002)).toBe('started')
  })
})

describe('arrival safety', () => {
  const base = (): Sector => ({ ...homeSector(), planets: [], stations: [], asteroids: [] })

  it('flags an arrival point inside a gravity well, next to a station, or inside a rock', () => {
    expect(arrivalHazard(base())).toBeNull()
    expect(arrivalHazard({ ...base(), planets: [{ ...world, position: [0, 0, -100], color: '#fff', emissive: '#000' }] })).toMatch(/gravity well/)
    expect(arrivalHazard({ ...base(), stations: [{ id: 0, name: 'Dock', position: [10, 0, 0], yaw: 0 }] })).toMatch(/too close/)
    expect(arrivalHazard({ ...base(), asteroids: [{ position: [3, 0, 0], radius: 2, spin: [0, 0, 0] }] })).toMatch(/asteroid/)
  })

  it('every generated sector has a clear arrival point', () => {
    for (let seed = 1; seed <= 3000; seed++) {
      const sector = generateSector(seed * 7919, seed)
      expect(arrivalHazard(sector), `seed ${seed * 7919}`).toBeNull()
    }
  })

  it('the Earth 2.0 sector has a clear arrival point', () => {
    for (let seed = 1; seed <= 200; seed++) expect(arrivalHazard(earthSector(seed * 104729, seed))).toBeNull()
  })
})
