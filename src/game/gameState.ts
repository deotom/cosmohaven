import type { PlaceableBlockType } from './types'

export const BLOCK_COSTS: Record<PlaceableBlockType, number> = { hull: 10, food: 30, arcade: 30 }
export const STARTING_SCRAP = 100
export const SCRAP_PICKUP_VALUE = 20

export const FOLD_COST = 40
/** Signal Relics (one per folded sector) needed to decode Earth 2.0's coordinates */
export const RELICS_NEEDED = 5

/**
 * Earth 2.0: the legendary destination, found only in its own sector once the relics are collected.
 * Reaching VICTORY_RADIUS from its centre wins the game. The ship arrives at the sector's origin.
 */
export const EARTH_POSITION: [number, number, number] = [0, 0, -1700]
export const EARTH_RADIUS = 300
export const VICTORY_RADIUS = 600

export type CelestialBody = {
  name: string
  position: [number, number, number]
  radius: number
  /** Gravitational parameter: pull at distance r is gm / r² (units/s²) */
  gm: number
  /** Distance from the centre at which the body's gravity starts to act */
  wellRadius: number
  /** Thickness of the atmosphere above the surface; 0 for none */
  atmosphereHeight: number
}

/**
 * gm is chosen from the pull wanted at the edge of the well (gm = pull × wellRadius²). Pulls stay
 * well under the ship's 8 u/s² of thrust, so you can always climb out, and orbital speeds (sqrt(gm / r))
 * are in the same range as the ~22 u/s the ship cruises at.
 */
export const EARTH_2: CelestialBody = {
  name: 'Earth 2.0',
  position: EARTH_POSITION,
  radius: EARTH_RADIUS,
  gm: 0.2 * 1500 ** 2, // 0.2 u/s² at the edge, 1.25 at the victory radius; circular orbit speed ~21 u/s at r=1000
  wellRadius: 1500,
  atmosphereHeight: VICTORY_RADIUS - EARTH_RADIUS, // reaching the upper atmosphere is landing
}

/**
 * The gravity wells in the current sector. Mutated in place when the ship folds (see sector.ts) so
 * everything that iterates it (gravity, auto-pilot waypoints) always sees the live list.
 */
export const CELESTIAL_BODIES: CelestialBody[] = []

/** What the auto-pilot is doing. orbit / land / dock are nav variants started from the context menu. */
export type AutopilotTask = 'nav' | 'harvest' | 'hold' | 'evac' | 'orbit' | 'land' | 'dock'
/** Arrival at a planet: the player (or auto-pilot) chooses orbit or landing at the edge of its sphere of influence. */
export type ArrivalPhase = 'none' | 'choice' | 'insertion' | 'orbiting' | 'deorbit' | 'descent' | 'landed'
export type ArrivalIntent = 'choose' | 'orbit' | 'land'

export type TargetKind = 'planet' | 'station' | 'scrap' | 'relic' | 'meteor'
/** A reference to something in the world that can be locked on. `key` is unique within the sector. */
export type TargetRef = { kind: TargetKind; key: string; name: string }

export type WellInfo = {
  name: string
  /** Distance above the surface */
  altitude: number
  /** Gravitational acceleration at the ship */
  pull: number
  speed: number
  /** Speed that would make a circular orbit at the ship's current distance */
  orbitSpeed: number
  inAtmosphere: boolean
  /** Speed along the line from the planet's centre: positive is climbing, negative is falling */
  radialSpeed: number
}

export type Notice = { text: string; kind: 'warning' | 'gain'; until: number }

/**
 * Live game state. Mutated from the simulation (frames and event handlers) and
 * sampled by the HUD a few times a second, so React doesn't re-render at 60fps.
 */
export const gameStats = {
  scrap: STARTING_SCRAP,
  /** Distance remaining until the ship is inside the victory radius */
  distanceToEarth: Infinity,
  victory: false,
  notice: null as Notice | null,
  /** The gravity well the ship is currently inside, if any */
  well: null as WellInfo | null,
  /** 1-based tiers; see upgrades.ts */
  /** Hull integrity 0-100: knocked down by impacts, restored free at a shipyard or with Scrap in an emergency */
  hull: 100,
  /** Blocks queued at the shipyard; the first is being assembled, with its progress */
  construction: [] as { type: PlaceableBlockType; progress: number }[],
  /** Main-engine throttle this frame (0-1), for the exhaust plumes */
  thrustLevel: 0,
  /** Signal Relics recovered so far, and the distance to the one in this sector, if any */
  relics: 0,
  relicDistance: null as number | null,
  /** Space-Fold drive: idle, charging up (charge 0-1) or arriving (the flash fading, charge 0-1) */
  fold: { phase: 'idle' as 'idle' | 'charging' | 'arriving', charge: 0 },
  harvesterTier: 1,
  autopilotTier: 1,
  /** Seconds of full-power main thrust burned so far (a stand-in for fuel) */
  thrustUsed: 0,
  harvest: { text: 'Pilot mode only', progress: 0 },
  autopilot: {
    engaged: false,
    destination: 0,
    status: 'Off',
    distance: 0,
    task: 'nav' as AutopilotTask,
    /** Auto-harvest keeps seeking the next piece of scrap; otherwise it stops after one */
    sweep: true,
    /** The piece of scrap the auto-pilot wants the beam on right now */
    harvestId: null as number | null,
    /** What to do on reaching a planet's sphere of influence */
    intent: 'choose' as ArrivalIntent,
  },
  arrival: { phase: 'none' as ArrivalPhase, body: -1, orbitRadius: 0, lever: 0 },
  /** The locked target: bracketed on screen and bound to the auto-pilot's contextual actions */
  target: null as TargetRef | null,
}

export function declareVictory() {
  gameStats.victory = true
}

export function setArrival(patch: Partial<typeof gameStats.arrival>) {
  Object.assign(gameStats.arrival, patch)
}

export function setTarget(target: TargetRef | null) {
  gameStats.target = target
}

/** [O] / [L] at a planet: begin the orbital insertion burn, or the de-orbit burn towards the surface. */
export function requestArrival(choice: 'orbit' | 'land') {
  const phase = gameStats.arrival.phase
  if (choice === 'orbit' && (phase === 'choice' || phase === 'orbiting' || phase === 'deorbit' || phase === 'descent')) {
    setArrival({ phase: 'insertion', orbitRadius: 0 })
  } else if (choice === 'land' && (phase === 'choice' || phase === 'orbiting' || phase === 'insertion')) {
    setArrival({ phase: 'deorbit' })
  } else {
    notify(phase === 'none' ? 'Fly into a planet\'s sphere of influence first' : 'Not available right now', 'warning', 2000)
  }
}

export const REPAIR_COST = 15
export const REPAIR_AMOUNT = 25
let repairReadyAt = 0

export function damageHull(amount: number) {
  gameStats.hull = Math.max(0, gameStats.hull - amount)
}

export function repairHull(amount: number) {
  gameStats.hull = Math.min(100, gameStats.hull + amount)
}

/** A damaged ship is slower: full thrust at 100% hull, 55% at 0%. */
export const hullThrustFactor = () => 0.55 + 0.45 * (gameStats.hull / 100)

/** The only repair available in open space: some Scrap buys a patch-up, with a short cooldown. */
export function emergencyRepair() {
  if (gameStats.hull >= 100) {
    notify('Hull is at full integrity', 'gain')
    return
  }
  if (performance.now() < repairReadyAt) {
    notify('Repair drones are recharging', 'warning')
    return
  }
  if (!trySpendScrap(REPAIR_COST)) return
  repairReadyAt = performance.now() + 4000
  repairHull(REPAIR_AMOUNT)
  notify(`Emergency repair: hull ${Math.round(gameStats.hull)}%`, 'gain', 2000)
}

export function addScrap(amount: number) {
  gameStats.scrap += amount
}

export function setConstruction(queue: typeof gameStats.construction) {
  gameStats.construction = queue
}

export function setThrustLevel(level: number) {
  gameStats.thrustLevel = level
}

export function setFold(patch: Partial<typeof gameStats.fold>) {
  Object.assign(gameStats.fold, patch)
}

export function setRelicDistance(distance: number | null) {
  gameStats.relicDistance = distance
}

export function collectRelic() {
  gameStats.relics += 1
}

export function setHarvest(text: string, progress: number) {
  gameStats.harvest.text = text
  gameStats.harvest.progress = progress
}

export function setAutopilot(patch: Partial<typeof gameStats.autopilot>) {
  Object.assign(gameStats.autopilot, patch)
}

export function addThrustUsed(seconds: number) {
  gameStats.thrustUsed += seconds
}

/** Incoming meteors, tracked by the physics bodies so the auto-pilot can predict collisions. */
export type MeteorTrack = { position: [number, number, number]; velocity: [number, number, number] }
export const meteorTracks = new Map<number, MeteorTrack>()

export function reportWell(well: WellInfo | null) {
  gameStats.well = well
}

/** Shows a brief message on the HUD. */
export function notify(text: string, kind: Notice['kind'], durationMs = 1500) {
  gameStats.notice = { text, kind, until: performance.now() + durationMs }
}

/** Deducts `cost` if the player can afford it; otherwise shows a warning and returns false. */
export function trySpendScrap(cost: number): boolean {
  if (gameStats.scrap < cost) {
    notify(`Not enough Scrap! Need ${cost}, have ${gameStats.scrap}`, 'warning')
    return false
  }
  gameStats.scrap -= cost
  return true
}

/** A snapshot of the game stats for the HUD, with expired notices dropped. */
export function readGameStats() {
  const notice = gameStats.notice && gameStats.notice.until > performance.now() ? gameStats.notice : null
  return {
    ...gameStats,
    notice,
    harvest: { ...gameStats.harvest },
    construction: gameStats.construction.map((c) => ({ ...c })),
    fold: { ...gameStats.fold },
    autopilot: { ...gameStats.autopilot },
    arrival: { ...gameStats.arrival },
  }
}
