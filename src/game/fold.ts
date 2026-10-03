import { getDock } from './dock'
import { RELICS_NEEDED, gameStats, getFoldCost, notify, setFold, trySpendCredits } from './gameState'
import { earthSector, enterSector, generateSector } from './sector'

/** Seconds the drive spends spinning up before the ship leaves, and the seconds the arrival flash lasts. */
export const FOLD_CHARGE_TIME = 3
export const FOLD_ARRIVAL_TIME = 1.6

let nextSectorId = 1

export function setNextSectorId(id: number) {
  if (!Number.isInteger(id) || id < 1) throw new Error('Next sector id must be a positive integer')
  nextSectorId = id
}

/** Starts a Space-Fold: spends HC and spins up the drive. Does nothing if already folding. */
export function requestFold() {
  if (gameStats.victory || gameStats.fold.phase !== 'idle') return
  if (getDock().phase !== 'free') {
    notify('Undock before folding', 'warning')
    return
  }
  if (!trySpendCredits(getFoldCost())) return
  setFold({ phase: 'charging', charge: 0 })
  notify('Space-Fold drive charging: hold on!', 'gain', FOLD_CHARGE_TIME * 1000)
}

/**
 * Advances the fold sequence by `dt` seconds. Returns true on the frame the ship jumps, when the
 * caller must teleport it to the new sector's arrival point.
 */
export function advanceFold(dt: number): boolean {
  const { phase, charge } = gameStats.fold

  if (phase === 'charging') {
    const next = charge + dt / FOLD_CHARGE_TIME
    if (next < 1) {
      setFold({ charge: next })
      return false
    }
    jump()
    return true
  }

  if (phase === 'arriving') {
    const next = charge + dt / FOLD_ARRIVAL_TIME
    setFold(next < 1 ? { charge: next } : { phase: 'idle', charge: 0 })
  }
  return false
}

/** Once all the relics are collected the drive can decode Earth 2.0's coordinates, so the fold lands there. */
function jump() {
  const toEarth = gameStats.relics >= RELICS_NEEDED
  const seed = Math.floor(Math.random() * 2 ** 31)
  const sector = toEarth ? earthSector(seed, nextSectorId++) : generateSector(seed, nextSectorId++)
  enterSector(sector)
  setFold({ phase: 'arriving', charge: 0 })
  notify(toEarth ? 'Fold complete: Earth 2.0 dead ahead!' : `Fold complete: ${sector.name}`, 'gain', 3500)
}
