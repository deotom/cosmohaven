import type { Triplet } from '@react-three/cannon'
import { useSyncExternalStore } from 'react'
import * as THREE from 'three'
import { CELESTIAL_BODIES, EARTH_2, gameStats, meteorTracks, setAutopilot, SURVEY_DATA_SELL_VALUE, type CelestialBody } from './gameState'
import { mulberry32 } from './rng'
import { STATION_KEEP_OUT, type StationSpec } from './station'
import { sunColor, sunDirection } from './sunState'

/** A planet in a sector: the physics/gravity data plus how to draw it. */
export type PlanetSpec = CelestialBody & {
  color: string
  emissive: string
  /** Earth 2.0 is drawn by its own component and is not solid: reaching its entry radius wins */
  legendary?: boolean
}
export type AsteroidSpec = { position: Triplet; radius: number; spin: Triplet }
export type SurveyBeaconSpec = { id: string; position: Triplet; name: string }

/**
 * One star system. The ship always arrives at the origin, so positions are relative to the arrival
 * point. Everything here is plain data produced from a seed, so a sector is fully reproducible.
 */
export type Sector = {
  id: number
  name: string
  /** Background colour of space, and the tint of the system's fill light */
  sky: string
  accent: string
  planets: PlanetSpec[]
  /** Drydocks: the only places the ship can be built or modified */
  stations: StationSpec[]
  asteroids: AsteroidSpec[]
  scrap: Triplet[]
  /** A Signal Relic lies somewhere in most sectors, but not in the home sector */
  relic: Triplet | null
  /** A recoverable survey beacon may appear in procedurally generated sectors */
  surveyBeacon: SurveyBeaconSpec | null
  /** Where the sun is (unit vector from the ship towards it) and the colour of its light */
  sun: { direction: Triplet; color: string }
}

const SYLLABLES = ['ka', 'zy', 'ra', 'vo', 'lu', 'te', 'mi', 'xa', 'ne', 'or', 'qu', 'sha', 'tri', 'del', 'bor']
const WELL_PER_RADIUS = 3.4 // a planet's gravity well reaches this many radii out
const EDGE_PULL = 0.25 // u/s² at the well's edge; surface pull works out to ~3, well under the ship's 8 u/s² thrust
const RELIC_CHANCE = 0.6

const word = (rand: () => number, syllables: number) => {
  let w = ''
  for (let i = 0; i < syllables; i++) w += SYLLABLES[Math.floor(rand() * SYLLABLES.length)]
  return w[0].toUpperCase() + w.slice(1)
}

const hex = (h: number, s: number, l: number) => `#${new THREE.Color().setHSL(h, s, l).getHexString()}`

/** A random unit direction, flattened towards the ecliptic so systems read as roughly planar. */
function direction(rand: () => number, flatten = 0.35): THREE.Vector3 {
  return new THREE.Vector3(rand() * 2 - 1, (rand() * 2 - 1) * flatten, rand() * 2 - 1).normalize()
}

const dist = (a: Triplet, b: Triplet) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

function makePlanet(rand: () => number, placed: readonly PlanetSpec[]): PlanetSpec | null {
  const radius = 40 + rand() * 110
  const wellRadius = radius * WELL_PER_RADIUS
  for (let attempt = 0; attempt < 30; attempt++) {
    // Far enough out that the arrival point is never inside the well
    const position = direction(rand).multiplyScalar(wellRadius + 250 + rand() * 700).toArray() as Triplet
    if (placed.some((p) => dist(position, p.position) < wellRadius + p.wellRadius + 40)) continue
    const hue = rand()
    return {
      name: `${word(rand, 2)}-${1 + Math.floor(rand() * 9)}`,
      position,
      radius,
      gm: EDGE_PULL * wellRadius ** 2,
      wellRadius,
      atmosphereHeight: radius * 0.5,
      color: hex(hue, 0.45, 0.42),
      emissive: hex(hue, 0.5, 0.08),
    }
  }
  return null
}

const insideAnyPlanet = (p: Triplet, planets: readonly PlanetSpec[], margin: number) =>
  planets.some((planet) => dist(p, planet.position) < planet.radius + margin)

const nearStation = (p: Triplet, stations: readonly StationSpec[]) => stations.some((s) => dist(p, s.position) < STATION_KEEP_OUT)

/** Maybe a drydock out beyond one of the planets' gravity wells (it is stationary, so it keeps clear of them). */
function makeStations(rand: () => number, planets: readonly PlanetSpec[]): StationSpec[] {
  if (planets.length === 0 || rand() >= 0.35) return []
  const planet = planets[Math.floor(rand() * planets.length)]
  for (let attempt = 0; attempt < 12; attempt++) {
    const position = new THREE.Vector3(...planet.position).addScaledVector(direction(rand), planet.wellRadius + 160 + rand() * 80).toArray() as Triplet
    if (Math.hypot(...position) < 250) continue // not on top of the arrival point
    if (planets.some((p) => dist(position, p.position) < p.wellRadius + 60)) continue
    return [{ id: 0, name: `${planet.name} Drydock`, position, yaw: rand() * Math.PI * 2 }]
  }
  return []
}

function makeAsteroids(rand: () => number, planets: readonly PlanetSpec[], count: number, clustered: boolean, stations: readonly StationSpec[]): AsteroidSpec[] {
  const centers = clustered ? [0, 1, 2].map(() => direction(rand).multiplyScalar(150 + rand() * 450)) : []
  const asteroids: AsteroidSpec[] = []
  for (let i = 0; i < count; i++) {
    const position = (
      centers.length && rand() < 0.7
        ? centers[Math.floor(rand() * centers.length)].clone().add(direction(rand, 0.6).multiplyScalar(rand() * 90))
        : direction(rand, 0.4).multiplyScalar(25 + rand() * 120)
    ).toArray() as Triplet
    if (insideAnyPlanet(position, planets, 30) || Math.hypot(...position) < 20 || nearStation(position, stations)) continue
    asteroids.push({
      position,
      radius: 0.5 + rand() * 1.9,
      spin: [rand() * 0.6 - 0.3, rand() * 0.6 - 0.3, rand() * 0.6 - 0.3],
    })
  }
  return asteroids
}

function makeScrap(rand: () => number, planets: readonly PlanetSpec[], clusters: number, stations: readonly StationSpec[]): Triplet[] {
  const scrap: Triplet[] = []
  const add = (p: THREE.Vector3) => {
    const position = p.toArray() as Triplet
    if (!insideAnyPlanet(position, planets, 8) && !nearStation(position, stations)) scrap.push(position)
  }
  for (let i = 0; i < 8; i++) add(direction(rand, 0.5).multiplyScalar(20 + rand() * 70)) // a starter handful
  for (let c = 0; c < clusters; c++) {
    const center = direction(rand).multiplyScalar(120 + rand() * 1000)
    const count = 8 + Math.floor(rand() * 7)
    for (let i = 0; i < count; i++) add(center.clone().add(direction(rand, 0.8).multiplyScalar(rand() * 45)))
  }
  return scrap
}

function makeRelic(rand: () => number, planets: readonly PlanetSpec[]): Triplet | null {
  if (rand() >= RELIC_CHANCE) return null
  for (let attempt = 0; attempt < 20; attempt++) {
    const position = direction(rand).multiplyScalar(450 + rand() * 650).toArray() as Triplet
    if (!insideAnyPlanet(position, planets, 150)) return position
  }
  return null
}

function makeSurveyBeacon(rand: () => number, id: number, planets: readonly PlanetSpec[], stations: readonly StationSpec[]): SurveyBeaconSpec | null {
  if (rand() >= 0.45) return null
  for (let attempt = 0; attempt < 20; attempt++) {
    const position = direction(rand).multiplyScalar(550 + rand() * 750).toArray() as Triplet
    if (insideAnyPlanet(position, planets, 180) || nearStation(position, stations)) continue
    return { id: `survey-${id}`, name: 'Survey Beacon', position }
  }
  return null
}

/** A procedurally generated star system: planet layout, asteroid fields, scrap clusters, maybe a relic. */
export function generateSector(seed: number, id: number): Sector {
  const rand = mulberry32(seed)
  const planets: PlanetSpec[] = []
  const wanted = 1 + Math.floor(rand() * 3)
  for (let i = 0; i < wanted; i++) {
    const planet = makePlanet(rand, planets)
    if (planet) planets.push(planet)
  }
  const stations = makeStations(rand, planets)
  const hue = rand()
  return {
    id,
    name: `${word(rand, 3)} Sector`,
    sky: hex(hue, 0.5, 0.02),
    accent: hex(hue, 0.7, 0.6),
    planets,
    stations,
    asteroids: makeAsteroids(rand, planets, 18 + Math.floor(rand() * 32), rand() < 0.65, stations),
    scrap: makeScrap(rand, planets, 3 + Math.floor(rand() * 3), stations),
    relic: makeRelic(rand, planets),
    sun: { direction: direction(rand, 0.6).toArray() as Triplet, color: hex(rand(), 0.3, 0.92) },
    surveyBeacon: makeSurveyBeacon(rand, id, planets, stations),
  }
}

/** The game starts docked at the home drydock, which sits at the sector's origin with its hangar facing +Z. */
const HOME_STATIONS: StationSpec[] = [{ id: 0, name: 'Haven Drydock', position: [0, 0, 0], yaw: 0 }]

/** Where the game starts: the practice planet Kepler-9, a ring of scrap, and no relic. */
export function homeSector(): Sector {
  const rand = mulberry32(1)
  const kepler: PlanetSpec = {
    name: 'Kepler-9',
    position: [-160, -30, -320],
    radius: 60,
    gm: 0.5 * 200 ** 2,
    wellRadius: 200,
    atmosphereHeight: 40,
    color: '#3a5f8f',
    emissive: '#0b1a33',
  }
  return {
    id: 0,
    name: 'Home Sector',
    sky: '#02030a',
    accent: '#3b6bff',
    planets: [kepler],
    stations: HOME_STATIONS,
    asteroids: makeAsteroids(rand, [kepler], 26, false, HOME_STATIONS),
    scrap: makeScrap(rand, [kepler], 2, HOME_STATIONS),
    relic: null,
    surveyBeacon: null,
    sun: { direction: [0.84, 0.56, 0.28], color: '#fff4e0' },
  }
}

/** The legendary sector: Earth 2.0 dead ahead, a calm field around it, no relic. */
export function earthSector(seed: number, id: number): Sector {
  const rand = mulberry32(seed)
  const earth: PlanetSpec = { ...EARTH_2, color: '#3a8dff', emissive: '#103060', legendary: true }
  return {
    id,
    name: 'Earth 2.0 System',
    sky: '#020612',
    accent: '#9fd4ff',
    planets: [earth],
    stations: [],
    asteroids: makeAsteroids(rand, [earth], 14, false, []),
    scrap: makeScrap(rand, [earth], 2, []),
    relic: null,
    surveyBeacon: null,
    // Behind the arrival point, so the face of Earth that comes into view is the sunlit one
    sun: { direction: [0.3, 0.35, 0.9], color: '#fff1d6' },
  }
}

// --- The current sector, as a tiny external store so React can re-render when it changes ---

let current: Sector = homeSector()
const listeners = new Set<() => void>()

export const getSector = () => current

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Re-renders whenever the ship folds into a new sector. */
export const useSector = () => useSyncExternalStore(subscribe, getSector)

/** Makes `sector` the current one: updates gravity wells and waypoints, and tells the scene to rebuild. */
export function enterSector(sector: Sector) {
  current = sector
  sunDirection.set(...sector.sun.direction).normalize()
  sunColor.set(sector.sun.color)
  CELESTIAL_BODIES.length = 0
  CELESTIAL_BODIES.push(...sector.planets)
  gameStats.distanceToEarth = Infinity
  gameStats.relicDistance = null
  if (sector.surveyBeacon) {
    if (gameStats.sideEvent.id !== sector.surveyBeacon.id || gameStats.sideEvent.status !== 'complete') {
      gameStats.sideEvent.id = sector.surveyBeacon.id
      gameStats.sideEvent.name = sector.surveyBeacon.name
      gameStats.sideEvent.status = 'available'
      gameStats.sideEvent.dataValue = SURVEY_DATA_SELL_VALUE
    }
  } else {
    gameStats.sideEvent.id = null
    gameStats.sideEvent.name = ''
    gameStats.sideEvent.status = 'none'
    gameStats.sideEvent.dataValue = 0
  }
  gameStats.well = null
  setAutopilot({ engaged: false, destination: 0, status: 'Off' })
  meteorTracks.clear()
  listeners.forEach((listener) => listener())
}

enterSector(current)
