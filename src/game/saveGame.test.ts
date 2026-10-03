import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { crewProfile } from './crewProfile'
import { gameStats } from './gameState'
import {
  clearSaveSlot,
  createSaveSnapshot,
  isSavedGame,
  readSaveSlot,
  resetNewGame,
  restoreSave,
  saveValidationError,
  writeSaveSlot,
} from './saveGame'
import { shipState } from './shipState'

beforeEach(() => {
  resetNewGame({ ...crewProfile, look: { ...crewProfile.look } })
  const values = new Map<string, string>()
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  })
})

afterEach(() => vi.unstubAllGlobals())

describe('save schema and restore', () => {
  it('creates a valid versioned save with the starting sector and ship', () => {
    const save = createSaveSnapshot()

    expect(saveValidationError(save)).toBeNull()
    expect(save.version).toBe(1)
    expect(save.ship.blocks).toEqual([{ pos: [0, 0, 0], type: 'core' }])
  })

  it('rejects unsupported versions and invalid cargo values', () => {
    expect(isSavedGame({ ...createSaveSnapshot(), version: 2 })).toBe(false)

    const invalidCargo = createSaveSnapshot()
    invalidCargo.game.cargo.scrap = -1
    expect(isSavedGame(invalidCargo)).toBe(false)
  })

  it('round-trips the single slot and reports invalid stored data', () => {
    const save = createSaveSnapshot()
    expect(writeSaveSlot(save)).toBeNull()
    expect(readSaveSlot().save).toEqual(save)

    save.game.credits = -1
    expect(writeSaveSlot(save)).toContain('invalid save snapshot')
    expect(clearSaveSlot()).toBeNull()
    expect(readSaveSlot()).toEqual({ save: null, error: null })
  })

  it('restores wallet, cargo, difficulty, crew, ship blocks, and flight state', () => {
    const save = createSaveSnapshot()
    save.game.credits = 540
    save.game.cargo.surveyData = 2
    save.difficulty = 'challenging'
    save.crew.hunger = 42
    save.flight.arrival = { phase: 'orbiting', body: 0, orbitRadius: 600, lever: 0 }
    save.flight.autopilot = { ...save.flight.autopilot, engaged: true, status: 'Approaching' }
    save.ship.blocks = [
      { pos: [0, 0, 0], type: 'core' },
      { pos: [1, 0, 0], type: 'engine' },
    ]
    save.ship.position = [130, 20, -40]
    save.ship.velocity = [2, 0, -4]
    save.ship.docked = false
    save.ship.stationId = -1
    expect(isSavedGame(save)).toBe(true)

    restoreSave(save)

    expect(shipState.blocks).toHaveLength(2)
    expect(shipState.position.toArray()).toEqual([130, 20, -40])
    expect(shipState.velocity.toArray()).toEqual([2, 0, -4])
    expect(gameStats.arrival.phase).toBe('orbiting')
    expect(gameStats.autopilot.engaged).toBe(true)
  })
})
