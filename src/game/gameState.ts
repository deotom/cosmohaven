import type { PlaceableBlockType } from './types'
import { adjustedCost, type Difficulty } from './difficulty'

export const BLOCK_COSTS: Record<PlaceableBlockType, number> = {
  hull: 10,
  food: 30,
  arcade: 30,
  engine: 60,
  shield: 80,
  repair: 70,
}
export const STARTING_CREDITS = 100
export const SCRAP_SELL_VALUE = 20
export const SURVEY_DATA_SELL_VALUE = 50
export const BASE_CARGO_CAPACITY = 8

export type CargoKind = 'scrap' | 'relics' | 'surveyData'
const CARGO_ITEM_VOLUME: Record<CargoKind, number> = { scrap: 1, relics: 1, surveyData: 1 }
export type StorageTechId = 'expanded-bay' | 'mass-compressor' | 'quantum-vault'
export const STORAGE_TECHS: Record<StorageTechId, { name: string; description: string; capacity: number; volumeFactor: number; cost: number }> = {
  'expanded-bay': { name: 'Expanded Bay', description: '+6 cargo units', capacity: 14, volumeFactor: 1, cost: 120 },
  'mass-compressor': { name: 'Mass Compressor', description: 'Cargo occupies 55% volume', capacity: BASE_CARGO_CAPACITY, volumeFactor: 0.55, cost: 240 },
  'quantum-vault': { name: 'Quantum Vault', description: 'Cargo occupies 30% volume · 12-unit hold', capacity: 12, volumeFactor: 0.3, cost: 450 },
}

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

export type TargetKind = 'planet' | 'station' | 'scrap' | 'relic' | 'survey' | 'meteor'
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
  credits: STARTING_CREDITS,
  cargo: { scrap: 0, relics: 0, surveyData: 0 },
  storageTech: null as StorageTechId | null,
  ownedStorageTechs: [] as StorageTechId[],
  difficulty: 'standard' as Difficulty,
  /** Distance remaining until the ship is inside the victory radius */
  distanceToEarth: Infinity,
  victory: false,
  notice: null as Notice | null,
  /** The gravity well the ship is currently inside, if any */
  well: null as WellInfo | null,
  /** Hull integrity 0-100: knocked down by impacts, restored free at a shipyard or with HC in an emergency */
  hull: 100,
  /** Blocks queued at the shipyard; the first is being assembled, with its progress */
  construction: [] as { type: PlaceableBlockType; progress: number }[],
  modules: { engines: 0, shields: 0, repairBays: 0 },
  /** Main-engine throttle this frame (0-1), for the exhaust plumes */
  thrustLevel: 0,
  /** Signal Relics recovered so far, and the distance to the one in this sector, if any */
  relics: 0,
  relicDistance: null as number | null,
  sideEvent: { id: null as string | null, name: '', status: 'none' as 'none' | 'available' | 'complete', dataValue: 0 },
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

/** The only repair available in open space: some HC buys a patch-up, with a short cooldown. */
export function emergencyRepair() {
  if (gameStats.hull >= 100) {
    notify('Hull is at full integrity', 'gain')
    return
  }
  if (performance.now() < repairReadyAt) {
    notify('Repair drones are recharging', 'warning')
    return
  }
  const cost = adjustedCost(REPAIR_COST, gameStats.difficulty)
  if (!trySpendCredits(cost)) return
  repairReadyAt = performance.now() + 4000
  repairHull(REPAIR_AMOUNT)
  notify(`Emergency repair: hull ${Math.round(gameStats.hull)}% · ${cost} HC`, 'gain', 2000)
}

export const getBlockCost = (type: PlaceableBlockType) => adjustedCost(BLOCK_COSTS[type], gameStats.difficulty)
export const getFoldCost = () => adjustedCost(FOLD_COST, gameStats.difficulty)
export const getRepairCost = () => adjustedCost(REPAIR_COST, gameStats.difficulty)

export function addCredits(amount: number) {
  gameStats.credits += amount
}

export function setConstruction(queue: typeof gameStats.construction) {
  gameStats.construction = queue
}

export function setShipModules(modules: typeof gameStats.modules) {
  gameStats.modules = modules
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
  return tryAddCargo('relics')
}

export function completeSurveyEvent(id: string) {
  if (gameStats.sideEvent.id !== id || gameStats.sideEvent.status !== 'available') return false
  if (!tryAddCargo('surveyData')) return false
  gameStats.sideEvent.status = 'complete'
  notify('Survey Beacon recovered · research data stored in cargo', 'gain', 3500)
  return true
}

export function getCargoCapacity() {
  return gameStats.storageTech ? STORAGE_TECHS[gameStats.storageTech].capacity : BASE_CARGO_CAPACITY
}

export function getCargoVolume() {
  const tech = gameStats.storageTech ? STORAGE_TECHS[gameStats.storageTech] : null
  return (
    gameStats.cargo.scrap * CARGO_ITEM_VOLUME.scrap +
    gameStats.cargo.relics * CARGO_ITEM_VOLUME.relics +
    gameStats.cargo.surveyData * CARGO_ITEM_VOLUME.surveyData
  ) * (tech?.volumeFactor ?? 1)
}

export function canAddCargo(kind: CargoKind, amount = 1) {
  if (!Number.isInteger(amount) || amount <= 0) return false
  const compression = gameStats.storageTech ? STORAGE_TECHS[gameStats.storageTech].volumeFactor : 1
  return getCargoVolume() + amount * CARGO_ITEM_VOLUME[kind] * compression <= getCargoCapacity() + 1e-9
}

export function tryAddCargo(kind: CargoKind, amount = 1) {
  if (!canAddCargo(kind, amount)) {
    notify('Cargo hold full · sell cargo at a Trade Relay', 'warning', 2500)
    return false
  }
  gameStats.cargo[kind] += amount
  if (kind === 'relics') gameStats.relics += amount
  return true
}

export function trySpendCredits(cost: number): boolean {
  if (gameStats.credits < cost) {
    notify(`Not enough HC! Need ${cost}, have ${gameStats.credits}`, 'warning')
    return false
  }
  gameStats.credits -= cost
  return true
}

export const getStorageTechCost = (id: StorageTechId) => adjustedCost(STORAGE_TECHS[id].cost, gameStats.difficulty)

export function getCargoSaleValue(atDrydock: boolean) {
  const rawValue = gameStats.cargo.scrap * SCRAP_SELL_VALUE + gameStats.cargo.surveyData * SURVEY_DATA_SELL_VALUE
  return Math.floor(rawValue * (atDrydock ? 1 : 0.9))
}

export function sellCargo(atDrydock: boolean) {
  const payout = getCargoSaleValue(atDrydock)
  if (payout === 0) {
    notify('No sellable cargo in the hold', 'warning')
    return 0
  }
  const soldScrap = gameStats.cargo.scrap
  const soldData = gameStats.cargo.surveyData
  gameStats.cargo.scrap = 0
  gameStats.cargo.surveyData = 0
  gameStats.credits += payout
  notify(`Cargo sold: ${soldScrap} Scrap · ${soldData} Data → ${payout} HC${atDrydock ? '' : ' (Relay rate)'}`, 'gain', 3500)
  return payout
}

export function purchaseStorageTech(id: StorageTechId) {
  if (gameStats.storageTech === id) {
    notify(`${STORAGE_TECHS[id].name} already active`, 'warning')
    return false
  }
  if (!gameStats.ownedStorageTechs.includes(id) && !trySpendCredits(getStorageTechCost(id))) return false
  if (!gameStats.ownedStorageTechs.includes(id)) gameStats.ownedStorageTechs.push(id)
  gameStats.storageTech = id
  notify(`${STORAGE_TECHS[id].name} installed`, 'gain', 2500)
  return true
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
/** A snapshot of the game stats for the HUD, with expired notices dropped. */
export function readGameStats() {
  const notice = gameStats.notice && gameStats.notice.until > performance.now() ? gameStats.notice : null
  return {
    ...gameStats,
    notice,
    cargo: { ...gameStats.cargo },
    sideEvent: { ...gameStats.sideEvent },
    ownedStorageTechs: [...gameStats.ownedStorageTechs],
    harvest: { ...gameStats.harvest },
    construction: gameStats.construction.map((c) => ({ ...c })),
    modules: { ...gameStats.modules },
    fold: { ...gameStats.fold },
    autopilot: { ...gameStats.autopilot },
    arrival: { ...gameStats.arrival },
  }
}
