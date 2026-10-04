import * as THREE from 'three'
import type { CelestialBody } from './gameState'
import type { Sector } from './sector'
import { STATION_AVOID_RADIUS } from './station'

/**
 * Pure path planning for the auto-pilot: spheres in, a list of waypoints out. It knows nothing about physics,
 * React or the game stores, so it can be tested as plain input → output.
 */

export type Vec3Like = THREE.Vector3 | readonly [number, number, number]

export type ObstacleKind = 'planet' | 'asteroid' | 'station' | 'well'

/** A sphere the ship must not enter. `radius` already includes the safety margin. */
export type Obstacle = {
  id: string
  name: string
  center: Vec3Like
  radius: number
  kind: ObstacleKind
  /** For a planet: the solid part (surface, atmosphere and a little room) that no path may enter, even on a final approach to a goal inside the avoid sphere */
  core?: number
  /** For a rock or a cluster of rocks: the solid rocks themselves (with a little room), which no final approach may cut through */
  solids?: { center: Vec3Like; radius: number }[]
}

export type PlannedPath = {
  /** Points to fly through in order, ending at the goal. Empty when `blocked` */
  waypoints: THREE.Vector3[]
  /** Parallel to `waypoints`: the obstacle a waypoint steers round, or '' for the goal and approach gates */
  around: string[]
  blocked: boolean
  reason?: string
}

export type BuildOptions = {
  /** Extra room above a planet's atmosphere */
  planetClearance?: number
  /** A deep gravity well is avoided out to this fraction of its radius (the pull bends a straight line well before the surface) */
  wellFraction?: number
  /** Avoidance radius of a station. Defaults to STATION_AVOID_RADIUS, which covers the whole structure */
  stationRadius?: number
  /** Room around a rock for the ship's own size and a wobble in its heading */
  asteroidClearance?: number
  /** Rocks closer than this (between their padded surfaces) are merged into one sphere */
  mergeGap?: number
  /** Merging stops before a sphere grows past this, so a big field is never swallowed whole */
  maxClusterRadius?: number
  /** Points a merged sphere must never swallow. Defaults to the sector's origin, where a folding ship arrives */
  keepClear?: readonly Vec3Like[]
}

export type PlanOptions = {
  /** How many detours may be inserted before giving up */
  maxIterations?: number
}

export const PLANET_CLEARANCE = 30
/** Room above the atmosphere that the last leg of an approach into a planet's avoid sphere still keeps */
export const CORE_CLEARANCE = 10
export const WELL_AVOID_FRACTION = 0.55
export const ASTEROID_CLEARANCE = 10
/** Room around a rock's surface that the last leg into a rock's avoid sphere still keeps (the ship's own size and its wobble) */
export const ROCK_SOLID_CLEARANCE = 6
export const ASTEROID_MERGE_GAP = 10
export const MAX_CLUSTER_RADIUS = 70
export const DEFAULT_MAX_ITERATIONS = 48

/** Surface tolerance: a path may graze a sphere by this much without counting as a hit */
const EPS = 1e-3
/** How far outside a sphere an exit point or approach gate sits: a point on the very surface cannot be left tangentially */
const STANDOFF_FRACTION = 0.3
const MIN_STANDOFF = 8
const standoff = (radius: number) => Math.max(MIN_STANDOFF, STANDOFF_FRACTION * radius)
const DETOUR_FACTORS = [1.02, 1.1, 1.25, 1.5, 2, 3]
const DETOUR_DIRECTIONS = 8
const SPHERE_FACTORS = [1.05, 1.3, 2]
const SPHERE_DIRECTIONS = Array.from({ length: 40 }, (_, i) => {
  // Fibonacci sphere: evenly spread unit vectors
  const y = 1 - (2 * (i + 0.5)) / 40
  const ring = Math.sqrt(1 - y * y)
  const phi = i * Math.PI * (3 - Math.sqrt(5))
  return new THREE.Vector3(Math.cos(phi) * ring, y, Math.sin(phi) * ring)
})
/** A candidate that leaves other obstacles in the way is only used when nothing cleaner exists */
const HIT_PENALTY = 1e6
const GATE_POLAR_ANGLES = [0, 20, 40, 60, 80, 100, 120, 140, 160, 180].map((deg) => (deg * Math.PI) / 180)
const GATE_AZIMUTHS = 8
/** A hangar mouth faces one way, so a station is only approached from within this angle of it */
const STATION_APPROACH_CONE = (50 * Math.PI) / 180
const MAX_EXIT_STEPS = 16

const toVec = (p: Vec3Like) => ('x' in p ? p.clone() : new THREE.Vector3(p[0], p[1], p[2]))

// ---------- Building obstacles ----------

type Group = { center: THREE.Vector3; radius: number; members: { position: THREE.Vector3; pad: number; solid?: number }[]; first: number }

function enclose(group: Group, extra: { position: THREE.Vector3; pad: number }) {
  const members = [...group.members, extra]
  const center = new THREE.Vector3()
  for (const m of members) center.add(m.position)
  center.multiplyScalar(1 / members.length)
  let radius = 0
  for (const m of members) radius = Math.max(radius, center.distanceTo(m.position) + m.pad)
  return { members, center, radius }
}

function mergeAsteroids(sector: Sector, clearance: number, gap: number, maxRadius: number, keepClear: readonly THREE.Vector3[]): Obstacle[] {
  const groups: Group[] = []
  sector.asteroids.forEach((rock, index) => {
    const entry = { position: new THREE.Vector3(...rock.position), pad: rock.radius + clearance, solid: rock.radius + ROCK_SOLID_CLEARANCE }
    for (const group of groups) {
      if (group.center.distanceTo(entry.position) >= group.radius + entry.pad + gap) continue
      const merged = enclose(group, entry)
      if (merged.radius > maxRadius || keepClear.some((p) => p.distanceTo(merged.center) < merged.radius)) continue
      group.members = merged.members
      group.center = merged.center
      group.radius = merged.radius
      return
    }
    groups.push({ center: entry.position.clone(), radius: entry.pad, members: [entry], first: index })
  })
  return groups.map((g) => ({
    id: `asteroid:${g.first}`,
    name: g.members.length > 1 ? 'asteroid field' : 'asteroid',
    center: g.center.toArray() as [number, number, number],
    radius: g.radius,
    kind: 'asteroid',
    solids: g.members.map((m) => ({ center: m.position.toArray() as [number, number, number], radius: m.solid ?? m.pad })),
  }))
}

/**
 * Everything the auto-pilot must steer round in `sector`: planets (a body's surface, atmosphere and some room, or
 * a good part of its gravity well if that is bigger), stations, and asteroids merged into a few spheres.
 * `bodies` is normally `sector.planets`.
 */
export function buildObstacles(sector: Sector, bodies: readonly CelestialBody[], options: BuildOptions = {}): Obstacle[] {
  const {
    planetClearance = PLANET_CLEARANCE,
    wellFraction = WELL_AVOID_FRACTION,
    stationRadius = STATION_AVOID_RADIUS,
    asteroidClearance = ASTEROID_CLEARANCE,
    mergeGap = ASTEROID_MERGE_GAP,
    maxClusterRadius = MAX_CLUSTER_RADIUS,
    keepClear = [[0, 0, 0]],
  } = options
  const obstacles: Obstacle[] = []

  for (const body of bodies) {
    const solid = body.radius + body.atmosphereHeight + planetClearance
    const well = body.wellRadius * wellFraction
    obstacles.push({
      id: `planet:${body.name}`,
      name: body.name,
      center: body.position,
      radius: Math.max(solid, well),
      kind: well > solid ? 'well' : 'planet',
      core: body.radius + body.atmosphereHeight + CORE_CLEARANCE,
    })
  }
  for (const station of sector.stations) {
    obstacles.push({ id: `station:${station.name}`, name: station.name, center: station.position, radius: stationRadius, kind: 'station' })
  }
  obstacles.push(...mergeAsteroids(sector, asteroidClearance, mergeGap, maxClusterRadius, keepClear.map(toVec)))
  return obstacles
}

const cache = new WeakMap<Sector, Obstacle[]>()

/** `buildObstacles` for the sector's own planets, built once per sector (a sector never changes once generated). */
export function obstaclesFor(sector: Sector): readonly Obstacle[] {
  let found = cache.get(sector)
  if (!found) {
    found = buildObstacles(sector, sector.planets)
    cache.set(sector, found)
  }
  return found
}

// ---------- Geometry ----------

type Sphere = { c: THREE.Vector3; r: number; name: string; kind: ObstacleKind; core?: number; solids?: { c: THREE.Vector3; r: number }[] }

/** Where the segment a→b first enters the sphere, as a fraction of its length, or -1 if it stays clear. */
function hitParam(a: THREE.Vector3, b: THREE.Vector3, s: Sphere): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const dz = b.z - a.z
  const fx = a.x - s.c.x
  const fy = a.y - s.c.y
  const fz = a.z - s.c.z
  const A = dx * dx + dy * dy + dz * dz
  const C = fx * fx + fy * fy + fz * fz - s.r * s.r
  const rr = s.r - EPS
  if (A < 1e-12) return rr > 0 && C + s.r * s.r < rr * rr ? 0 : -1
  const B = fx * dx + fy * dy + fz * dz
  const t = Math.min(1, Math.max(0, -B / A))
  const px = fx + dx * t
  const py = fy + dy * t
  const pz = fz + dz * t
  if (rr <= 0 || px * px + py * py + pz * pz >= rr * rr) return -1
  if (C < 0) return 0
  const disc = Math.max(B * B - A * C, 0)
  return Math.min(1, Math.max(0, (-B - Math.sqrt(disc)) / A))
}

const isInside = (p: THREE.Vector3, s: Sphere, margin = EPS) => p.distanceTo(s.c) < s.r - margin
const isFree = (p: THREE.Vector3, spheres: readonly Sphere[]) => !spheres.some((s) => p.distanceTo(s.c) < s.r + EPS)

function firstHit(a: THREE.Vector3, b: THREE.Vector3, spheres: readonly Sphere[], skip?: Sphere): Sphere | null {
  let best: Sphere | null = null
  let bestT = Infinity
  for (const s of spheres) {
    if (s === skip) continue
    const t = hitParam(a, b, s)
    if (t >= 0 && t < bestT) {
      best = s
      bestT = t
    }
  }
  return best
}

const countHits = (a: THREE.Vector3, b: THREE.Vector3, spheres: readonly Sphere[], skip: Sphere) =>
  spheres.reduce((n, s) => (s !== skip && hitParam(a, b, s) >= 0 ? n + 1 : n), 0)

/** Some unit vector perpendicular to `d`, always the same one for the same `d`. */
function anyPerpendicular(d: THREE.Vector3): THREE.Vector3 {
  const axis = Math.abs(d.x) <= Math.abs(d.y) && Math.abs(d.x) <= Math.abs(d.z) ? new THREE.Vector3(1, 0, 0) : Math.abs(d.y) <= Math.abs(d.z) ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1)
  return new THREE.Vector3().crossVectors(d, axis).normalize()
}

/** The cheapest single point to go via so that a→w→b clears `hit`, preferring ones that clear everything else too. */
function bestDetour(a: THREE.Vector3, b: THREE.Vector3, hit: Sphere, spheres: readonly Sphere[]): THREE.Vector3 | null {
  const d = new THREE.Vector3().subVectors(b, a)
  const length = d.length()
  if (length < 1e-9) return null
  d.multiplyScalar(1 / length)
  const t = new THREE.Vector3().subVectors(hit.c, a).dot(d)
  const lateral = new THREE.Vector3().copy(a).addScaledVector(d, t).sub(hit.c) // the line's closest approach, from the centre
  const n0 = lateral.lengthSq() > 1e-9 ? lateral.normalize() : anyPerpendicular(d)
  const n1 = new THREE.Vector3().crossVectors(d, n0)

  let best: THREE.Vector3 | null = null
  let bestCost = Infinity
  const w = new THREE.Vector3()
  const consider = () => {
    if (!isFree(w, spheres)) return
    if (hitParam(a, w, hit) >= 0 || hitParam(w, b, hit) >= 0) return
    const cost = a.distanceTo(w) + w.distanceTo(b) + HIT_PENALTY * (countHits(a, w, spheres, hit) + countHits(w, b, spheres, hit))
    if (cost < bestCost) {
      bestCost = cost
      best = w.clone()
    }
  }
  // Round the middle of the sphere, in the plane across the line...
  for (let k = 0; k < DETOUR_DIRECTIONS; k++) {
    const angle = (k * 2 * Math.PI) / DETOUR_DIRECTIONS
    for (const factor of DETOUR_FACTORS) {
      w.copy(hit.c).addScaledVector(n0, Math.cos(angle) * hit.r * factor).addScaledVector(n1, Math.sin(angle) * hit.r * factor)
      consider()
    }
  }
  // ...and anywhere on it, for when an end of the leg sits close to the surface and only a point near that end will do
  for (const u of SPHERE_DIRECTIONS) {
    for (const factor of SPHERE_FACTORS) {
      w.copy(hit.c).addScaledVector(u, hit.r * factor)
      consider()
    }
  }
  return best
}

// ---------- Approach gates ----------

/** The point where a ray from `goal` along `u` leaves a sphere that contains `goal`. */
function exitDistance(goal: THREE.Vector3, u: THREE.Vector3, s: Sphere): number {
  const g = new THREE.Vector3().subVectors(goal, s.c)
  const b = u.dot(g)
  return -b + Math.sqrt(Math.max(b * b - (g.lengthSq() - s.r * s.r), 0))
}

/**
 * The goal sits inside the obstacles in `dests` (it is a planet, a hangar entrance, or scrap lying near a rock). The
 * last leg is allowed to enter them, but only along a straight line from a "gate" just outside all of them, so
 * we arrive from a sensible side. Returns null when no side is clear.
 */
function findGate(start: THREE.Vector3, goal: THREE.Vector3, dests: readonly Sphere[], blockers: readonly Sphere[]): THREE.Vector3 | null {
  const station = dests.find((s) => s.kind === 'station')
  const preferred = new THREE.Vector3()
  if (station && goal.distanceTo(station.c) > 1) preferred.subVectors(goal, station.c)
  else preferred.subVectors(start, goal)
  if (preferred.lengthSq() < 1e-12) preferred.set(0, 0, 1)
  preferred.normalize()
  const p1 = anyPerpendicular(preferred)
  const p2 = new THREE.Vector3().crossVectors(preferred, p1)

  const u = new THREE.Vector3()
  for (const polar of GATE_POLAR_ANGLES) {
    if (station && polar > STATION_APPROACH_CONE) break
    const azimuths = polar === 0 ? 1 : GATE_AZIMUTHS
    for (let k = 0; k < azimuths; k++) {
      const az = (k * 2 * Math.PI) / GATE_AZIMUTHS
      u.copy(preferred).multiplyScalar(Math.cos(polar)).addScaledVector(p1, Math.sin(polar) * Math.cos(az)).addScaledVector(p2, Math.sin(polar) * Math.sin(az))
      let t = 0
      for (const s of dests) t = Math.max(t, exitDistance(goal, u, s))
      const gate = goal.clone().addScaledVector(u, t + standoff(Math.max(...dests.map((s) => s.r))))
      if (dests.some((s) => gate.distanceTo(s.c) < s.r + EPS)) continue
      if (blockers.some((s) => isInside(gate, s, -EPS) || hitParam(gate, goal, s) >= 0)) continue
      // The last leg must not cut through a planet's solid body to reach a goal on its far side
      if (dests.some((s) => s.core !== undefined && goal.distanceTo(s.c) >= s.core && hitParam(gate, goal, { ...s, r: s.core }) >= 0)) continue
      // Nor through a rock that lies between the gate and scrap sitting close to it
      if (dests.some((s) => s.solids?.some((rock) => goal.distanceTo(rock.c) >= rock.r && hitParam(gate, goal, rock as Sphere) >= 0))) continue
      return gate
    }
  }
  return null
}

// ---------- Planning ----------

type Node = { p: THREE.Vector3; around: string }

/**
 * Plans a route from `from` to `to` round the obstacles. Straight if nothing is in the way; otherwise detours
 * that touch the padded spheres, then trimmed of any waypoint that was not needed.
 *
 * - Obstacles that contain the goal are the destination itself: they are not avoided on the final leg, which runs
 *   in a straight line from a gate on their surface (see `findGate`). If `from` is already inside all of them the
 *   path simply goes straight in.
 * - A start inside any other obstacle is first pushed out through its surface.
 * - It never loops: after `maxIterations` detours, or when no clear detour exists, it returns `blocked: true`
 *   with the reason and no waypoints.
 */
export function planPath(from: Vec3Like, to: Vec3Like, obstacles: readonly Obstacle[], options: PlanOptions = {}): PlannedPath {
  const start = toVec(from)
  const goal = toVec(to)
  const all: Sphere[] = obstacles.map((o) => ({ c: toVec(o.center), r: o.radius, name: o.name, kind: o.kind, core: o.core, solids: o.solids?.map((x) => ({ c: toVec(x.center), r: x.radius })) }))
  const dests = all.filter((s) => isInside(goal, s, 0))
  const blocked = (reason: string): PlannedPath => ({ waypoints: [], around: [], blocked: true, reason })
  // A goal in a planet's atmosphere or below is not somewhere to fly to (a goal at the planet's centre means 'go to the planet')
  const buried = dests.find((s) => s.core !== undefined && goal.distanceTo(s.c) > 1 && goal.distanceTo(s.c) < s.core)
  if (buried) return blocked(`'s atmosphere is in the way`)

  let active = all
  let target = goal
  let gated = false
  if (dests.length > 0) {
    if (dests.every((s) => isInside(start, s, 0))) {
      active = all.filter((s) => !dests.includes(s))
    } else {
      const gate = findGate(start, goal, dests, all.filter((s) => !dests.includes(s)))
      if (!gate) return blocked(`no clear approach to ${dests[0].name}`)
      target = gate
      gated = true
    }
  }

  // Get out of anything the ship starts inside
  const nodes: Node[] = [{ p: start, around: '' }]
  let cursor = start
  for (let step = 0; ; step++) {
    const trap = active.find((s) => isInside(cursor, s))
    if (!trap) break
    if (step >= MAX_EXIT_STEPS) return blocked(`cannot get clear of ${trap.name}`)
    const out = new THREE.Vector3().subVectors(cursor, trap.c)
    if (out.lengthSq() < 1e-12) out.subVectors(goal, cursor)
    if (out.lengthSq() < 1e-12) out.set(0, 1, 0)
    cursor = trap.c.clone().addScaledVector(out.normalize(), trap.r + standoff(trap.r))
    nodes.push({ p: cursor, around: trap.name })
  }

  const budget = { left: options.maxIterations ?? DEFAULT_MAX_ITERATIONS }
  let failure = ''
  const solve = (a: THREE.Vector3, b: THREE.Vector3): Node[] | null => {
    const hit = firstHit(a, b, active)
    if (!hit) return [{ p: b, around: '' }]
    if (budget.left-- <= 0) {
      failure = `too many obstacles in the way (gave up near ${hit.name})`
      return null
    }
    const via = bestDetour(a, b, hit, active)
    if (!via) {
      failure = `no way round ${hit.name}`
      return null
    }
    const first = solve(a, via)
    const second = first && solve(via, b)
    if (!first || !second) return null
    first[first.length - 1].around = hit.name
    return [...first, ...second]
  }

  const leg = solve(cursor, target)
  if (!leg) return blocked(failure)
  nodes.push(...leg)

  // String-pulling: from each node, jump to the furthest node still in clear sight
  const kept: Node[] = [nodes[0]]
  let i = 0
  while (i < nodes.length - 1) {
    let j = nodes.length - 1
    while (j > i + 1 && firstHit(nodes[i].p, nodes[j].p, active)) j--
    kept.push(nodes[j])
    i = j
  }
  if (gated) kept.push({ p: goal, around: '' })

  const route = kept.slice(1)
  return { waypoints: route.map((n) => n.p), around: route.map((n) => n.around), blocked: false }
}
