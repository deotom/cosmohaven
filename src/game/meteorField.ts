/**
 * Pure meteor generation: when the next one comes, how big it is, how fast, where from and how far it misses.
 * Every function takes `rand` (a function returning [0, 1)) so tests can drive it with `mulberry32`.
 * All the tuning numbers are exported constants here, plus `meteorGap` in difficulty.ts.
 */
export type Vec3 = [number, number, number]
export type Rand = () => number

export const FIRST_METEOR_DELAY: readonly [number, number] = [20, 40] // seconds
export const MAX_ACTIVE_METEORS = 12

export const SHOWER_CHANCE = 0.12
export const SHOWER_COUNT: readonly [number, number] = [3, 6]
export const SHOWER_SPACING: readonly [number, number] = [0.5, 2.5] // seconds between rocks in a shower
export const SHOWER_CONE = 0.25 // radians of spread around the shower's direction

export const MIN_RADIUS = 0.4
export const MAX_RADIUS = 4
const RADIUS_MEDIAN = 0.95
const RADIUS_SIGMA = 0.6 // log-normal spread: many small rocks, a few big ones
const SHOWER_RADIUS_MEDIAN = 0.55
const SHOWER_RADIUS_SIGMA = 0.25
const SHOWER_MAX_RADIUS = 1

export const MIN_SPEED = 10
export const MAX_SPEED = 28
export const MIN_SPIN = 0.2
export const MAX_SPIN = 2

export const MIN_SPAWN_DISTANCE = 80
export const MAX_SPAWN_DISTANCE = 140
export const DIRECT_HIT_CHANCE = 0.25
export const MAX_MISS_DISTANCE = 30

export const REFERENCE_RADIUS = 1.3
export const REFERENCE_MASS = 40 // mass of the old fixed meteor; mass now scales with volume from here
export const METEOR_VARIANTS = 6
export const PALETTES = [
  { color: '#5b5750', emissive: '#d8641f' }, // grey rock
  { color: '#4a3a32', emissive: '#ff5a1f' }, // brown rock
  { color: '#3f444b', emissive: '#c8742f' }, // dark iron
] as const

export type MeteorSpec = {
  radius: number
  mass: number
  speed: number
  /** Unit vector from the ship towards where the meteor appears */
  direction: Vec3
  spawnDistance: number
  /** Distance the meteor would miss a stationary ship by (0 = direct hit) */
  missDistance: number
  /** Where it is aimed, relative to the ship's position at spawn time */
  aimOffset: Vec3
  spin: Vec3
  variant: number
  palette: number
  emissiveIntensity: number
}

export type MeteorEvent = {
  kind: 'single' | 'shower'
  /** Seconds after the event starts at which each meteor appears */
  meteors: { delay: number; spec: MeteorSpec }[]
}

const between = (rand: Rand, [min, max]: readonly [number, number]) => min + rand() * (max - min)
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / length, v[1] / length, v[2] / length]
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

function gaussian(rand: Rand) {
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand())
}

/** Evenly random direction on a sphere */
export function randomUnitVector(rand: Rand): Vec3 {
  const z = rand() * 2 - 1
  const phi = rand() * Math.PI * 2
  const r = Math.sqrt(1 - z * z)
  return [r * Math.cos(phi), r * Math.sin(phi), z]
}

/** A direction near `base`, within about `cone` radians */
function perturbedDirection(rand: Rand, base: Vec3, cone: number): Vec3 {
  const a = normalize(cross(base, Math.abs(base[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]))
  const b = cross(base, a)
  const angle = Math.sqrt(rand()) * cone
  const around = rand() * Math.PI * 2
  const s = Math.sin(angle)
  const c = Math.cos(angle)
  return normalize([
    base[0] * c + (a[0] * Math.cos(around) + b[0] * Math.sin(around)) * s,
    base[1] * c + (a[1] * Math.cos(around) + b[1] * Math.sin(around)) * s,
    base[2] * c + (a[2] * Math.cos(around) + b[2] * Math.sin(around)) * s,
  ])
}

/** Seconds until the next event: a hard minimum plus an exponential tail, so gaps are irregular and some are long. */
export function nextMeteorGap(rand: Rand, gap: { min: number; mean: number }) {
  return gap.min - Math.log(1 - rand()) * Math.max(0, gap.mean - gap.min)
}

export function firstMeteorDelay(rand: Rand) {
  return between(rand, FIRST_METEOR_DELAY)
}

/** Heavy-tailed radius: small rocks are common, big ones rare. */
export function randomRadius(rand: Rand) {
  return clamp(RADIUS_MEDIAN * Math.exp(gaussian(rand) * RADIUS_SIGMA), MIN_RADIUS, MAX_RADIUS)
}

/** Mass follows volume, anchored so the old 1.3 radius rock keeps its old mass. */
export function meteorMass(radius: number) {
  return REFERENCE_MASS * (radius / REFERENCE_RADIUS) ** 3
}

/** Big rocks are slow (easier to dodge), small ones fast. */
export function meteorSpeed(rand: Rand, radius: number) {
  const size = clamp((radius - MIN_RADIUS) / (MAX_RADIUS - MIN_RADIUS), 0, 1)
  const base = MAX_SPEED - (MAX_SPEED - MIN_SPEED) * size
  return clamp(base * (0.9 + rand() * 0.2), MIN_SPEED, MAX_SPEED)
}

function makeSpec(rand: Rand, radius: number, direction: Vec3): MeteorSpec {
  const missDistance = rand() < DIRECT_HIT_CHANCE ? 0 : rand() * MAX_MISS_DISTANCE
  const spawnDistance = between(rand, [MIN_SPAWN_DISTANCE, MAX_SPAWN_DISTANCE])
  // Offset the aim point sideways, perpendicular to the approach line, by the miss distance
  // (scaled up slightly so the straight line's closest approach to the ship is exactly missDistance)
  const side = normalize(cross(direction, randomUnitVector(rand)))
  const offset = (missDistance * spawnDistance) / Math.sqrt(spawnDistance ** 2 - missDistance ** 2)
  const aimOffset: Vec3 = [side[0] * offset, side[1] * offset, side[2] * offset]
  const spinAxis = randomUnitVector(rand)
  const spinSpeed = between(rand, [MIN_SPIN, MAX_SPIN])
  return {
    radius,
    mass: meteorMass(radius),
    speed: meteorSpeed(rand, radius),
    direction,
    spawnDistance,
    missDistance,
    aimOffset,
    spin: [spinAxis[0] * spinSpeed, spinAxis[1] * spinSpeed, spinAxis[2] * spinSpeed],
    variant: Math.floor(rand() * METEOR_VARIANTS),
    palette: Math.floor(rand() * PALETTES.length),
    emissiveIntensity: 0.15 + rand() * 0.35,
  }
}

/** Evenly random direction with the vertical axis squashed, so most rocks come in roughly level with the ship. */
function approachDirection(rand: Rand): Vec3 {
  const d = randomUnitVector(rand)
  return normalize([d[0], d[1] * 0.6, d[2]])
}

/** One event: usually a single rock, occasionally a shower of small ones from nearly the same direction. */
export function planMeteorEvent(rand: Rand): MeteorEvent {
  const direction = approachDirection(rand)
  if (rand() >= SHOWER_CHANCE) {
    return { kind: 'single', meteors: [{ delay: 0, spec: makeSpec(rand, randomRadius(rand), direction) }] }
  }

  const count = SHOWER_COUNT[0] + Math.floor(rand() * (SHOWER_COUNT[1] - SHOWER_COUNT[0] + 1))
  const meteors: MeteorEvent['meteors'] = []
  let delay = 0
  for (let i = 0; i < count; i++) {
    const radius = clamp(
      SHOWER_RADIUS_MEDIAN * Math.exp(gaussian(rand) * SHOWER_RADIUS_SIGMA),
      MIN_RADIUS,
      SHOWER_MAX_RADIUS,
    )
    meteors.push({ delay, spec: makeSpec(rand, radius, perturbedDirection(rand, direction, SHOWER_CONE)) })
    delay += between(rand, SHOWER_SPACING)
  }
  return { kind: 'shower', meteors }
}

/** Starting position and velocity of a meteor, aimed relative to where the ship is now. */
export function meteorTrajectory(shipPosition: Vec3, spec: MeteorSpec): { position: Vec3; velocity: Vec3 } {
  const position: Vec3 = [
    shipPosition[0] + spec.direction[0] * spec.spawnDistance,
    shipPosition[1] + spec.direction[1] * spec.spawnDistance,
    shipPosition[2] + spec.direction[2] * spec.spawnDistance,
  ]
  const toAim = normalize([
    shipPosition[0] + spec.aimOffset[0] - position[0],
    shipPosition[1] + spec.aimOffset[1] - position[1],
    shipPosition[2] + spec.aimOffset[2] - position[2],
  ])
  return { position, velocity: [toAim[0] * spec.speed, toAim[1] * spec.speed, toAim[2] * spec.speed] }
}
