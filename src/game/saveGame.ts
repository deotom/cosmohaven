import { crewProfile, setCrewProfile, type CrewProfile, type RoleId } from './crewProfile'
import { setNextSectorId } from './fold'
import {
  gameStats,
  meteorTracks,
  resetRepairCooldown,
  STORAGE_TECHS,
  type ArrivalIntent,
  type ArrivalPhase,
  type AutopilotTask,
  type StorageTechId,
} from './gameState'
import { construction as shipConstruction, getDock, setDock } from './dock'
import { enterSector, getSector, homeSector, type PlanetSpec, type Sector, type SurveyBeaconSpec } from './sector'
import { resetShipState, shipState, type SavedPendingBlock } from './shipState'
import { DEFAULT_LOOK, SPECIES, SPECIES_OPTIONS, type Look, type SpeciesId } from './species'
import { crewStats, hazardStats, type Block, type BlockType, type GridPos, type PlaceableBlockType } from './types'
import { DIFFICULTY_PROFILES, type Difficulty } from './difficulty'

export const SAVE_SLOT_KEY = 'cosmohaven.save.v1'

export type SavedGame = {
  version: 1
  savedAt: string
  profile: CrewProfile
  difficulty: Difficulty
  game: {
    credits: number
    cargo: { scrap: number; relics: number; surveyData: number }
    storageTech: StorageTechId | null
    ownedStorageTechs: StorageTechId[]
    harvesterTier: number
    autopilotTier: number
    relics: number
    hull: number
    thrustUsed: number
    victory: boolean
    sideEvent: { id: string | null; name: string; status: 'none' | 'available' | 'complete'; dataValue: number }
  }
  crew: { hunger: number; sanity: number; action: string }
  flight: {
    arrival: { phase: ArrivalPhase; body: number; orbitRadius: number; lever: number }
    autopilot: {
      engaged: boolean
      destination: number
      status: string
      distance: number
      task: AutopilotTask
      sweep: boolean
      harvestId: number | null
      intent: ArrivalIntent
    }
  }
  sector: Sector
  ship: {
    blocks: Block[]
    pending: SavedPendingBlock[]
    position: [number, number, number]
    quaternion: [number, number, number, number]
    velocity: [number, number, number]
    angularVelocity: [number, number, number]
    docked: boolean
    stationId: number
  }
}

export type SaveReadResult = { save: SavedGame | null; error: string | null }

const ROLE_IDS: readonly RoleId[] = ['engineer', 'pilot', 'chef']
const SPECIES_IDS = Object.keys(SPECIES) as SpeciesId[]
const BLOCK_TYPES: readonly BlockType[] = ['core', 'hull', 'food', 'arcade', 'engine', 'shield', 'repair']
const PLACEABLE_BLOCK_TYPES: readonly PlaceableBlockType[] = ['hull', 'food', 'arcade', 'engine', 'shield', 'repair']
const STORAGE_TECH_IDS = Object.keys(STORAGE_TECHS) as StorageTechId[]
const DIFFICULTY_IDS = Object.keys(DIFFICULTY_PROFILES) as Difficulty[]
const ARRIVAL_PHASES: readonly ArrivalPhase[] = ['none', 'choice', 'insertion', 'orbiting', 'deorbit', 'descent', 'landed']
const AUTOPILOT_TASKS: readonly AutopilotTask[] = ['nav', 'harvest', 'hold', 'evac', 'orbit', 'land', 'dock']
const ARRIVAL_INTENTS: readonly ArrivalIntent[] = ['choose', 'orbit', 'land']

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isIntegerInRange = (value: unknown, min: number, max: number): value is number =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max
const isString = (value: unknown, maxLength = 256): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= maxLength
const isEnum = <T extends readonly string[]>(values: T, value: unknown): value is T[number] =>
  typeof value === 'string' && values.includes(value)
const isVector = (value: unknown, length: number, limit = 1e7): value is number[] =>
  Array.isArray(value) && value.length === length && value.every((part) => isFiniteNumber(part) && Math.abs(part) <= limit)
const isTriplet = (value: unknown, limit?: number): value is [number, number, number] => isVector(value, 3, limit)

function isLook(value: unknown): value is Look {
  if (!isRecord(value)) return false
  return (Object.keys(DEFAULT_LOOK) as (keyof Look)[]).every((key) => {
    const options = Object.values(SPECIES_OPTIONS)
      .flat()
      .find((option) => option.key === key)
      ?.choices.map((choice) => choice.id)
    return options?.includes(value[key] as string) ?? false
  })
}

function isProfile(value: unknown): value is CrewProfile {
  return (
    isRecord(value) &&
    isString(value.name, 16) &&
    value.name.trim().length > 0 &&
    isEnum(ROLE_IDS, value.role) &&
    isEnum(SPECIES_IDS, value.species) &&
    isLook(value.look)
  )
}

function isPlanet(value: unknown): value is PlanetSpec {
  return (
    isRecord(value) &&
    isString(value.name, 80) &&
    isTriplet(value.position) &&
    isFiniteNumber(value.radius) &&
    value.radius > 0 &&
    isFiniteNumber(value.gm) &&
    value.gm >= 0 &&
    isFiniteNumber(value.wellRadius) &&
    value.wellRadius > 0 &&
    isFiniteNumber(value.atmosphereHeight) &&
    value.atmosphereHeight >= 0 &&
    typeof value.color === 'string' &&
    typeof value.emissive === 'string' &&
    (value.legendary === undefined || typeof value.legendary === 'boolean')
  )
}

function isSector(value: unknown): value is Sector {
  return sectorValidationError(value) === null
}

function sectorValidationError(value: unknown): string | null {
  if (!isRecord(value)) return 'is not an object'
  if (!isIntegerInRange(value.id, 0, 1_000_000) || !isString(value.name, 100)) return 'identity is invalid'
  if (typeof value.sky !== 'string' || typeof value.accent !== 'string') return 'palette is invalid'
  if (!Array.isArray(value.planets) || value.planets.length > 20 || !value.planets.every(isPlanet)) return 'planet list is invalid'
  if (!Array.isArray(value.stations) || value.stations.length > 20) return 'station list is invalid'
  if (!Array.isArray(value.asteroids) || value.asteroids.length > 500) return 'asteroid list is invalid'
  if (!Array.isArray(value.scrap) || value.scrap.length > 2_000 || !value.scrap.every((position) => isTriplet(position))) return 'scrap list is invalid'
  if (!(value.relic === null || isTriplet(value.relic))) return 'relic position is invalid'
  if (!(value.surveyBeacon === null || isSurveyBeacon(value.surveyBeacon))) return 'survey beacon is invalid'
  if (!isRecord(value.sun) || !isTriplet(value.sun.direction, 1) || typeof value.sun.color !== 'string') return 'sun data is invalid'

  const stationsValid = value.stations.every(
    (station) =>
      isRecord(station) &&
      isIntegerInRange(station.id, 0, 100_000) &&
      isString(station.name, 100) &&
      isTriplet(station.position) &&
      isFiniteNumber(station.yaw),
  )
  if (!stationsValid) return 'station data is invalid'
  const asteroidsValid = value.asteroids.every(
    (asteroid) =>
      isRecord(asteroid) &&
      isTriplet(asteroid.position) &&
      isFiniteNumber(asteroid.radius) &&
      asteroid.radius > 0 &&
      isTriplet(asteroid.spin, 10),
  )
  return asteroidsValid ? null : 'asteroid data is invalid'
}

function isSurveyBeacon(value: unknown): value is SurveyBeaconSpec {
  return isRecord(value) && isString(value.id, 100) && isString(value.name, 100) && isTriplet(value.position)
}

function isSavedPending(value: unknown): value is SavedPendingBlock {
  return (
    isRecord(value) &&
    isTriplet(value.pos, 128) &&
    value.pos.every(Number.isInteger) &&
    isEnum(PLACEABLE_BLOCK_TYPES, value.type) &&
    isFiniteNumber(value.total) &&
    value.total > 0 &&
    value.total <= 60 &&
    isFiniteNumber(value.progress) &&
    value.progress >= 0 &&
    value.progress <= 1
  )
}

function isBlock(value: unknown): value is Block {
  return (
    isRecord(value) &&
    isTriplet(value.pos, 128) &&
    value.pos.every(Number.isInteger) &&
    isEnum(BLOCK_TYPES, value.type)
  )
}

export function isSavedGame(value: unknown): value is SavedGame {
  return saveValidationError(value) === null
}

export function saveValidationError(value: unknown): string | null {
  if (!isRecord(value)) return 'Save must be an object'
  if (value.version !== 1) return 'Save version is unsupported'
  if (typeof value.savedAt !== 'string' || !Number.isFinite(Date.parse(value.savedAt))) return 'Save timestamp is invalid'
  if (!isProfile(value.profile)) return 'Crew profile is invalid'
  if (!isEnum(DIFFICULTY_IDS, value.difficulty)) return 'Difficulty is invalid'
  const { game, crew, sector, ship } = value
  if (!isGameData(game)) return 'Game progress or cargo data is invalid'
  if (!isCrewData(crew)) return 'Crew status is invalid'
  if (!isSector(sector)) return `Sector ${sectorValidationError(sector) ?? 'data is invalid'}`
  if (!isFlightData(value.flight, sector.planets.length)) return 'Flight state is invalid'
  if (!isShipData(ship)) return 'Ship blocks, construction queue, or physics state is invalid'

  const quaternion = ship.quaternion
  const quaternionLength = Math.hypot(...quaternion)
  if (quaternionLength < 0.9 || quaternionLength > 1.1) return 'Ship orientation is invalid'
  if (ship.docked && !sector.stations.some((station) => station.id === ship.stationId)) return 'Docked ship has no matching station'
  if (game.sideEvent.status !== 'none' && game.sideEvent.id === null) return 'Side-event status is missing its id'
  if (
    (game.sideEvent.status === 'none' && (game.sideEvent.id !== null || sector.surveyBeacon !== null)) ||
    (game.sideEvent.status !== 'none' && sector.surveyBeacon?.id !== game.sideEvent.id)
  ) return 'Side-event state does not match the current sector'
  if (game.cargo.scrap + game.cargo.relics + game.cargo.surveyData > 1_000_000) return 'Cargo quantity exceeds the supported range'
  return null
}

function isGameData(value: unknown): value is SavedGame['game'] {
  if (!isRecord(value) || !isRecord(value.cargo) || !isRecord(value.sideEvent)) return false
  const cargo = value.cargo
  const event = value.sideEvent
  return (
    isIntegerInRange(value.credits, 0, 1_000_000_000) &&
    isIntegerInRange(cargo.scrap, 0, 1_000_000) &&
    isIntegerInRange(cargo.relics, 0, 1_000_000) &&
    isIntegerInRange(cargo.surveyData, 0, 1_000_000) &&
    (value.storageTech === null || isEnum(STORAGE_TECH_IDS, value.storageTech)) &&
    Array.isArray(value.ownedStorageTechs) &&
    value.ownedStorageTechs.every((id) => isEnum(STORAGE_TECH_IDS, id)) &&
    new Set(value.ownedStorageTechs).size === value.ownedStorageTechs.length &&
    (value.storageTech === null || value.ownedStorageTechs.includes(value.storageTech)) &&
    isIntegerInRange(value.harvesterTier, 1, 3) &&
    isIntegerInRange(value.autopilotTier, 1, 3) &&
    isIntegerInRange(value.relics, 0, 1_000_000) &&
    isFiniteNumber(value.hull) &&
    value.hull >= 0 &&
    value.hull <= 100 &&
    isFiniteNumber(value.thrustUsed) &&
    value.thrustUsed >= 0 &&
    typeof value.victory === 'boolean' &&
    (event.id === null || isString(event.id, 100)) &&
    (event.name === '' || isString(event.name, 100)) &&
    isEnum(['none', 'available', 'complete'] as const, event.status) &&
    isFiniteNumber(event.dataValue) &&
    event.dataValue >= 0
  )
}

function isCrewData(value: unknown): value is SavedGame['crew'] {
  return (
    isRecord(value) &&
    isFiniteNumber(value.hunger) &&
    value.hunger >= 0 &&
    value.hunger <= 100 &&
    isFiniteNumber(value.sanity) &&
    value.sanity >= 0 &&
    value.sanity <= 100 &&
    isString(value.action, 128)
  )
}

function isFlightData(value: unknown, planetCount: number): value is SavedGame['flight'] {
  if (!isRecord(value) || !isRecord(value.arrival) || !isRecord(value.autopilot)) return false
  const arrival = value.arrival
  const autopilot = value.autopilot
  if (!isEnum(ARRIVAL_PHASES, arrival.phase)) return false
  if (!isIntegerInRange(arrival.body, -1, Math.max(0, planetCount - 1))) return false
  if (!isFiniteNumber(arrival.orbitRadius) || arrival.orbitRadius < 0) return false
  if (!isFiniteNumber(arrival.lever) || arrival.lever < 0 || arrival.lever > 1) return false
  if (typeof autopilot.engaged !== 'boolean') return false
  if (!isIntegerInRange(autopilot.destination, 0, Math.max(0, planetCount - 1))) return false
  if (!isString(autopilot.status, 128)) return false
  if (!isFiniteNumber(autopilot.distance) || autopilot.distance < 0) return false
  if (!isEnum(AUTOPILOT_TASKS, autopilot.task)) return false
  if (typeof autopilot.sweep !== 'boolean') return false
  if (!(autopilot.harvestId === null || isIntegerInRange(autopilot.harvestId, 0, 2_000))) return false
  if (!isEnum(ARRIVAL_INTENTS, autopilot.intent)) return false
  return arrival.phase === 'none' ? arrival.body === -1 : arrival.body >= 0 && arrival.body < planetCount
}

function isShipData(value: unknown): value is SavedGame['ship'] {
  if (
    !isRecord(value) ||
    !Array.isArray(value.blocks) ||
    value.blocks.length < 1 ||
    value.blocks.length > 1_000 ||
    !value.blocks.every(isBlock) ||
    !Array.isArray(value.pending) ||
    value.pending.length > 100 ||
    !value.pending.every(isSavedPending) ||
    !isTriplet(value.position) ||
    !isVector(value.quaternion, 4, 1) ||
    !isTriplet(value.velocity, 1_000) ||
    !isTriplet(value.angularVelocity, 1_000) ||
    typeof value.docked !== 'boolean' ||
    !isIntegerInRange(value.stationId, -1, 100_000)
  ) return false

  const blocks = value.blocks
  return (
    blocks.filter((block) => block.type === 'core').length === 1 &&
    blocks.some((block) => block.type === 'core' && block.pos[0] === 0 && block.pos[1] === 0 && block.pos[2] === 0) &&
    new Set(blocks.map((block) => block.pos.join(','))).size === blocks.length
  )
}

export function readSaveSlot(): SaveReadResult {
  let raw: string | null
  try {
    raw = window.localStorage.getItem(SAVE_SLOT_KEY)
  } catch (error) {
    console.error('Failed to read saved game', error)
    return { save: null, error: error instanceof Error ? error.message : 'Failed to read saved game' }
  }
  if (raw === null) return { save: null, error: null }
  try {
    const value: unknown = JSON.parse(raw)
    if (isSavedGame(value)) return { save: value, error: null }
    const message = `Saved game is invalid: ${saveValidationError(value) ?? 'schema mismatch'}; it was not loaded`
    console.error(message)
    return { save: null, error: message }
  } catch (error) {
    console.error('Failed to parse saved game', error)
    return { save: null, error: error instanceof Error ? error.message : 'Failed to parse saved game' }
  }
}

export function writeSaveSlot(save: SavedGame): string | null {
  const validationError = saveValidationError(save)
  if (validationError) {
    const message = `Refused to write an invalid save snapshot: ${validationError}`
    console.error(message)
    return message
  }
  try {
    window.localStorage.setItem(SAVE_SLOT_KEY, JSON.stringify(save))
    return null
  } catch (error) {
    console.error('Failed to save game', error)
    return error instanceof Error ? error.message : 'Failed to save game'
  }
}

export function clearSaveSlot(): string | null {
  try {
    window.localStorage.removeItem(SAVE_SLOT_KEY)
    return null
  } catch (error) {
    console.error('Failed to clear saved game', error)
    return error instanceof Error ? error.message : 'Failed to clear saved game'
  }
}

export function createSaveSnapshot(): SavedGame {
  const dock = getDock()
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    profile: { ...crewProfile, look: { ...crewProfile.look } },
    difficulty: gameStats.difficulty,
    game: {
      credits: gameStats.credits,
      cargo: { ...gameStats.cargo },
      storageTech: gameStats.storageTech,
      ownedStorageTechs: [...gameStats.ownedStorageTechs],
      harvesterTier: gameStats.harvesterTier,
      autopilotTier: gameStats.autopilotTier,
      relics: gameStats.relics,
      hull: gameStats.hull,
      thrustUsed: gameStats.thrustUsed,
      victory: gameStats.victory,
      sideEvent: { ...gameStats.sideEvent },
    },
    crew: { hunger: crewStats.hunger, sanity: crewStats.sanity, action: crewStats.action },
    flight: {
      arrival: { ...gameStats.arrival },
      autopilot: { ...gameStats.autopilot },
    },
    sector: getSector(),
    ship: {
      blocks: shipState.blocks.map((block) => ({ ...block, pos: [...block.pos] as GridPos })),
      pending: shipState.pending.map((block) => ({ ...block, pos: [...block.pos] as GridPos })),
      position: shipState.position.toArray() as [number, number, number],
      quaternion: shipState.quaternion.toArray() as [number, number, number, number],
      velocity: shipState.velocity.toArray() as [number, number, number],
      angularVelocity: shipState.angularVelocity.toArray() as [number, number, number],
      docked: dock.phase === 'docked',
      stationId: dock.phase === 'free' ? -1 : dock.stationId,
    },
  }
}

export function restoreSave(save: SavedGame) {
  if (!isSavedGame(save)) throw new Error('Cannot restore an invalid saved game')

  resetRepairCooldown()
  setCrewProfile({ ...save.profile, look: { ...save.profile.look } })
  gameStats.credits = save.game.credits
  gameStats.cargo = { ...save.game.cargo }
  gameStats.storageTech = save.game.storageTech
  gameStats.ownedStorageTechs = [...save.game.ownedStorageTechs]
  gameStats.harvesterTier = save.game.harvesterTier
  gameStats.autopilotTier = save.game.autopilotTier
  gameStats.relics = save.game.relics
  gameStats.hull = save.game.hull
  gameStats.thrustUsed = save.game.thrustUsed
  gameStats.victory = save.game.victory
  gameStats.difficulty = save.difficulty
  gameStats.sideEvent = { ...save.game.sideEvent }
  gameStats.construction = []
  gameStats.modules = { engines: 0, shields: 0, repairBays: 0 }
  gameStats.target = null
  gameStats.distanceToEarth = Infinity
  gameStats.relicDistance = null
  gameStats.notice = null
  gameStats.well = null
  gameStats.thrustLevel = 0
  gameStats.fold = { phase: 'idle', charge: 0 }
  gameStats.arrival = { ...save.flight.arrival }
  gameStats.harvest = { text: 'Pilot mode only', progress: 0 }
  crewStats.hunger = save.crew.hunger
  crewStats.sanity = save.crew.sanity
  crewStats.action = save.crew.action
  crewStats.lit = false
  hazardStats.meteors = 0
  meteorTracks.clear()
  enterSector(save.sector)
  gameStats.arrival = { ...save.flight.arrival }
  gameStats.autopilot = { ...save.flight.autopilot }
  gameStats.sideEvent = { ...save.game.sideEvent }
  setNextSectorId(save.sector.id + 1)
  shipState.blocks = save.ship.blocks.map((block) => ({ ...block, pos: [...block.pos] as GridPos }))
  shipState.pending = save.ship.pending.map((block) => ({ ...block, pos: [...block.pos] as GridPos }))
  shipState.position.fromArray(save.ship.position)
  shipState.quaternion.fromArray(save.ship.quaternion).normalize()
  shipState.velocity.fromArray(save.ship.velocity)
  shipState.angularVelocity.fromArray(save.ship.angularVelocity)
  shipState.hasSavedTransform = true
  setDock({ phase: save.ship.docked ? 'docked' : 'free', stationId: save.ship.stationId })
  shipConstruction.active = false
  shipConstruction.progress = 0
  resetShipStateAfterRestore()
}

function resetShipStateAfterRestore() {
  shipState.heat = 0
  gameStats.construction = shipState.pending.map((item, index) => ({
    type: item.type,
    progress: index === 0 ? item.progress : 0,
  }))
}

export function resetNewGame(profile: CrewProfile) {
  setCrewProfile({ ...profile, look: { ...profile.look } })
  resetRepairCooldown()
  gameStats.credits = 100
  gameStats.cargo = { scrap: 0, relics: 0, surveyData: 0 }
  gameStats.storageTech = null
  gameStats.ownedStorageTechs = []
  gameStats.difficulty = 'standard'
  gameStats.distanceToEarth = Infinity
  gameStats.victory = false
  gameStats.notice = null
  gameStats.well = null
  gameStats.hull = 100
  gameStats.construction = []
  gameStats.modules = { engines: 0, shields: 0, repairBays: 0 }
  gameStats.target = null
  gameStats.thrustLevel = 0
  gameStats.relics = 0
  gameStats.relicDistance = null
  gameStats.sideEvent = { id: null, name: '', status: 'none', dataValue: 0 }
  gameStats.fold = { phase: 'idle', charge: 0 }
  gameStats.harvesterTier = 1
  gameStats.autopilotTier = 1
  gameStats.thrustUsed = 0
  gameStats.harvest = { text: 'Pilot mode only', progress: 0 }
  gameStats.autopilot = {
    engaged: false,
    destination: 0,
    status: 'Off',
    distance: 0,
    task: 'nav',
    sweep: true,
    harvestId: null,
    intent: 'choose',
  }
  gameStats.arrival = { phase: 'none', body: -1, orbitRadius: 0, lever: 0 }
  crewStats.hunger = 100
  crewStats.sanity = 100
  crewStats.action = 'Idle'
  crewStats.lit = false
  hazardStats.meteors = 0
  meteorTracks.clear()
  resetShipState()
  enterSector(homeSector())
  setNextSectorId(1)
  setDock({ phase: 'docked', stationId: 0 })
  shipConstruction.active = false
  shipConstruction.progress = 0
}
