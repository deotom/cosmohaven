import { getDock } from './dock'
import { CELESTIAL_BODIES, RELICS_NEEDED, addCredits, gameStats, getFoldCost, notify, setFold, trySpendCredits } from './gameState'
import { arrivalHazard, earthSector, enterSector, generateSector, type Sector } from './sector'
import { shipState } from './shipState'

/** Seconds the drive spends spinning up before the ship leaves, and the seconds the arrival flash lasts. */
export const FOLD_CHARGE_TIME = 3
export const FOLD_ARRIVAL_TIME = 1.6

/** The drive cannot hold its field this deep in a gravity well: the fraction of a well's radius counted as "deep". */
export const FOLD_DEEP_WELL_FRACTION = 0.75
/** Hull lost since charging began that makes the drive abort (a hit shakes the field apart). */
export const FOLD_DAMAGE_ABORT = 15
/** Share of the fee returned when the pilot cancels; an interrupted charge is refunded in full. */
export const FOLD_CANCEL_REFUND = 0.8
/** After an automatic request is refused, the auto-pilot waits this long before asking again. */
export const FOLD_AUTO_RETRY_MS = 4000
/** Attempts at finding a destination whose arrival point is clear of hazards. */
const ARRIVAL_ATTEMPTS = 8

let nextSectorId = 1
let hullAtStart = 100
let autoRetryAt = 0

export function setNextSectorId(id: number) {
  if (!Number.isInteger(id) || id < 1) throw new Error('Next sector id must be a positive integer')
  nextSectorId = id
}

export type FoldCheck = { id: 'undocked' | 'atmosphere' | 'gravity-well' | 'credits'; label: string; ok: boolean; message: string }
export type FoldRequestResult = 'started' | 'ignored' | 'blocked' | 'cooldown'

/** Whether `position` is inside an atmosphere, or deep inside any gravity well. */
export function foldGravityState(position: { x: number; y: number; z: number }) {
  let atmosphere = false
  let deepWell = false
  for (const body of CELESTIAL_BODIES) {
    const distance = Math.hypot(body.position[0] - position.x, body.position[1] - position.y, body.position[2] - position.z)
    if (body.atmosphereHeight > 0 && distance < body.radius + body.atmosphereHeight) atmosphere = true
    if (distance < body.wellRadius * FOLD_DEEP_WELL_FRACTION) deepWell = true
  }
  return { atmosphere, deepWell }
}

/** The conditions a fold needs, in the order they are reported. Reads live state, so call it on demand. */
export function foldChecklist(position: { x: number; y: number; z: number } = shipState.position): FoldCheck[] {
  const { atmosphere, deepWell } = foldGravityState(position)
  const cost = getFoldCost()
  return [
    { id: 'undocked', label: 'Undocked', ok: getDock().phase === 'free', message: 'Undock before folding' },
    { id: 'atmosphere', label: 'Clear of atmosphere', ok: !atmosphere, message: 'Cannot fold inside an atmosphere: climb out first' },
    { id: 'gravity-well', label: 'Clear of deep gravity well', ok: !deepWell, message: 'Cannot fold deep in a gravity well: move away from the planet' },
    { id: 'credits', label: `${cost} HC available`, ok: gameStats.credits >= cost, message: `Not enough HC! Need ${cost}, have ${gameStats.credits}` },
  ]
}

const firstBlocker = () => foldChecklist().find((check) => !check.ok) ?? null

/**
 * Starts a Space-Fold: the fee is taken up front and spins up the drive. Manual requests explain why they
 * were refused; automatic ones (the evacuation protocol) are throttled so they cannot spam the player.
 */
export function requestFold(source: 'manual' | 'auto' = 'manual', now = performance.now()): FoldRequestResult {
  if (gameStats.victory || gameStats.fold.phase !== 'idle') return 'ignored'
  if (source === 'auto' && now < autoRetryAt) return 'cooldown'

  const blocker = firstBlocker()
  if (blocker) {
    notify(blocker.message, 'warning')
    if (source === 'auto') autoRetryAt = now + FOLD_AUTO_RETRY_MS
    return 'blocked'
  }

  const cost = getFoldCost()
  if (!trySpendCredits(cost)) return 'blocked'
  hullAtStart = gameStats.hull
  setFold({ phase: 'charging', charge: 0, reserved: cost })
  notify('Space-Fold drive charging: hold on! (J to cancel)', 'gain', FOLD_CHARGE_TIME * 1000)
  return 'started'
}

/** Ends a charge early and refunds the fee: most of it for a cancel, all of it when the drive aborted itself. */
function abortCharge(refundShare: number, message: string, kind: 'warning' | 'gain') {
  const { reserved } = gameStats.fold
  addCredits(Math.round(reserved * refundShare))
  setFold({ phase: 'idle', charge: 0, reserved: 0 })
  notify(message, kind, 2500)
}

/** J again while charging cancels the fold. Returns whether there was a charge to cancel. */
export function cancelFold(): boolean {
  if (gameStats.fold.phase !== 'charging') return false
  const refund = Math.round(gameStats.fold.reserved * FOLD_CANCEL_REFUND)
  abortCharge(FOLD_CANCEL_REFUND, `Fold cancelled · ${refund} HC refunded`, 'gain')
  return true
}

/** The key does the sensible thing: cancels a charge in progress, otherwise asks for a fold. */
export function toggleFold(): FoldRequestResult | 'cancelled' {
  return cancelFold() ? 'cancelled' : requestFold('manual')
}

/** Why a charge in progress must stop right now, if it must. */
function chargeInterruption(): string | null {
  if (hullAtStart - gameStats.hull >= FOLD_DAMAGE_ABORT) return 'Fold interrupted: the hull took a hit. Fee refunded'
  const { atmosphere, deepWell } = foldGravityState(shipState.position)
  if (atmosphere || deepWell) return 'Fold interrupted: drifted into a gravity well. Fee refunded'
  return null
}

/**
 * Advances the fold sequence by `dt` seconds. Returns true on the frame the ship jumps, when the
 * caller must teleport it to the new sector's arrival point.
 */
export function advanceFold(dt: number): boolean {
  const { phase, charge } = gameStats.fold

  if (phase === 'charging') {
    const interruption = chargeInterruption()
    if (interruption) {
      abortCharge(1, interruption, 'warning')
      return false
    }
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

/** Builds the next sector, trying fresh seeds until the arrival point is clear of planets, wells and rocks. */
function buildDestination(toEarth: boolean): Sector {
  let sector: Sector | null = null
  for (let attempt = 0; attempt < ARRIVAL_ATTEMPTS; attempt++) {
    const seed = Math.floor(Math.random() * 2 ** 31)
    const id = nextSectorId++
    sector = toEarth ? earthSector(seed, id) : generateSector(seed, id)
    if (!arrivalHazard(sector)) break
  }
  return sector!
}

/** Once all the relics are collected the drive can decode Earth 2.0's coordinates, so the fold lands there. */
function jump() {
  const toEarth = gameStats.relics >= RELICS_NEEDED
  const sector = buildDestination(toEarth)
  enterSector(sector)
  setFold({ phase: 'arriving', charge: 0, reserved: 0 })
  notify(toEarth ? 'Fold complete: Earth 2.0 dead ahead!' : `Fold complete: ${sector.name}`, 'gain', 3500)
}

/** Clears the auto-pilot's retry timer; for tests. */
export function resetFoldThrottle() {
  autoRetryAt = 0
}
