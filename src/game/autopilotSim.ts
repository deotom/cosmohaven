import * as THREE from 'three'
import { createAutopilotOutput, resetHold, resetRoute, runAutopilot, type AutopilotInput } from './autopilot'
import { linearDamping } from './damping'
import { dockInfo } from './dock'
import { gameStats, meteorTracks } from './gameState'
import { createGravitySample, sampleGravity } from './gravity'
import { obstaclesFor } from './pathPlanner'
import { mulberry32 } from './rng'
import { enterSector, type Sector } from './sector'
import { DOCK_MAX_SPEED, DOCK_RANGE, stationCollisionShapes, stationPose, STATION_KEEP_OUT } from './station'
import { createTargetState, scrapRegistry } from './targets'

/**
 * A flight simulator for the auto-pilot: the real `runAutopilot`, the real gravity (`sampleGravity`) and a copy of the
 * ship's physics, stepped the way cannon-es steps the game. It is how we measure what the auto-pilot really hits.
 *
 * Constants below are copies of the ones in `Ship.tsx` (which cannot be imported without React and the physics
 * worker); `autopilotSim.test.ts` reads that file and fails if they drift apart.
 */

export const SIM_DT = 1 / 60
/** Ship physics, from Ship.tsx */
export const SHIP_PHYSICS = {
  linearDamping: 0.3,
  wellDamping: 0,
  atmosphereDrag: 0.35,
  angularDamping: 0.8,
  /** THRUST_PER_BLOCK × thrust factor of a ship at full hull with no engine upgrades */
  mainAccel: 8,
}
/** The starter ship is one 1×1×1 block (half-diagonal 0.87); this leaves room for a few more blocks */
export const DEFAULT_SHIP_RADIUS = 2

export type SimTask = 'nav' | 'dock' | 'harvest'
export type HitKind = 'planet' | 'asteroid' | 'station'

export type Scenario = {
  id: string
  /** Which kind of start this is: 'arrival' (at rest at the origin), 'undock' (just outside a hangar), 'flyby' (at rest at a well edge), 'graze' (moving past a planet, in or near its well), 'cross' (a straight line through a station or rocks), 'wellscrap' (scrap lying inside a gravity well), 'random' (anywhere, already moving) */
  start: 'arrival' | 'undock' | 'flyby' | 'graze' | 'cross' | 'wellscrap' | 'random'
  sector: Sector
  tier: number
  task: SimTask
  position: THREE.Vector3
  velocity: THREE.Vector3
  quaternion: THREE.Quaternion
  /** nav: index into sector.planets. dock: index into sector.stations */
  index?: number
  /** harvest: where the single piece of scrap lies */
  scrap?: THREE.Vector3
}

export type SimOptions = {
  maxTime?: number
  /** Seconds to keep flying after a NAV arrival: the pilot needs time to choose, and a ship left to gravity falls in */
  settle?: number
  /** Called every step with the time, position, velocity and the auto-pilot's status, for tracing a single flight */
  trace?: (time: number, position: THREE.Vector3, velocity: THREE.Vector3, status: string) => void
  shipRadius?: number
  mainAccel?: number
  /** Principal moments of inertia of the ship (local axes); the starter ship's are equal */
  inertia?: readonly [number, number, number]
  dt?: number
}

export type SimResult = {
  id: string
  tier: number
  task: SimTask
  start: Scenario['start']
  outcome: 'arrived' | 'crashed' | 'timeout' | 'blocked'
  hit?: { kind: HitKind; name: string; time: number; speed: number }
  time: number
  pathLength: number
  straightLine: number
  /** Smallest gap between the ship's hull and each kind of object over the whole flight (negative: touching) */
  minGap: Record<HitKind, number>
  /** Closest approach to any planet's centre, as a fraction of its well radius */
  minWellFraction: number
  lastStatus: string
}

const NO_GAP = Number.POSITIVE_INFINITY

type Box = { center: THREE.Vector3; half: THREE.Vector3; inverse: THREE.Quaternion }

/** The station's real collider boxes in world space, as oriented boxes */
function stationBoxes(sector: Sector) {
  return sector.stations.map((station) => {
    const pose = stationPose(station)
    const origin = new THREE.Vector3(...station.position)
    const inverseYaw = pose.quaternion.clone().invert()
    const boxes: Box[] = stationCollisionShapes().map((shape) => {
      const euler = new THREE.Euler(...(shape.rotation ?? [0, 0, 0]))
      return {
        center: new THREE.Vector3(...shape.position),
        half: new THREE.Vector3(...shape.args).multiplyScalar(0.5),
        inverse: new THREE.Quaternion().setFromEuler(euler).invert(),
      }
    })
    return { name: station.name, origin, inverseYaw, boxes }
  })
}

const local = new THREE.Vector3()

/** Distance from `point` to the surface of the station's colliders (0 when inside one). */
function distanceToStation(point: THREE.Vector3, station: ReturnType<typeof stationBoxes>[number]) {
  let best = NO_GAP
  for (const box of station.boxes) {
    local.copy(point).sub(station.origin).applyQuaternion(station.inverseYaw).sub(box.center).applyQuaternion(box.inverse)
    const dx = Math.max(Math.abs(local.x) - box.half.x, 0)
    const dy = Math.max(Math.abs(local.y) - box.half.y, 0)
    const dz = Math.max(Math.abs(local.z) - box.half.z, 0)
    best = Math.min(best, Math.hypot(dx, dy, dz))
  }
  return best
}

/** One cannon-es step of a rigid body: damping first, v *= (1-d)^dt, then v += a·dt, then x += v·dt; the same for rotation. */
export function stepRigidBody(
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  quat: THREE.Quaternion,
  omega: THREE.Vector3,
  accel: THREE.Vector3,
  angularAccel: THREE.Vector3,
  inertia: readonly [number, number, number],
  linearDrag: number,
  angularDrag: number,
  dt: number,
) {
  vel.multiplyScalar(Math.pow(1 - linearDrag, dt))
  omega.multiplyScalar(Math.pow(1 - angularDrag, dt))
  vel.addScaledVector(accel, dt)
  // The auto-pilot asks for angular acceleration; the ship applies torque = α × mean inertia, and the body responds with I⁻¹
  const mean = (inertia[0] + inertia[1] + inertia[2]) / 3
  const torqueLocal = angularAccel.clone().multiplyScalar(mean).applyQuaternion(quat.clone().invert())
  torqueLocal.set(torqueLocal.x / inertia[0], torqueLocal.y / inertia[1], torqueLocal.z / inertia[2])
  omega.addScaledVector(torqueLocal.applyQuaternion(quat), dt)
  pos.addScaledVector(vel, dt)
  const spin = new THREE.Quaternion(omega.x, omega.y, omega.z, 0).multiply(quat)
  quat.set(quat.x + 0.5 * dt * spin.x, quat.y + 0.5 * dt * spin.y, quat.z + 0.5 * dt * spin.z, quat.w + 0.5 * dt * spin.w).normalize()
}

const DEFAULT_INERTIA = [1 / 6, 1 / 6, 1 / 6] as const

/** Flies one scenario to its end (arrival, a crash, or giving up) and reports what happened. */
export function simulate(scenario: Scenario, options: SimOptions = {}): SimResult {
  const { sector, tier, task } = scenario
  const dt = options.dt ?? SIM_DT
  const maxTime = options.maxTime ?? 900
  const settle = options.settle ?? 60
  const shipRadius = options.shipRadius ?? DEFAULT_SHIP_RADIUS
  const mainAccel = options.mainAccel ?? SHIP_PHYSICS.mainAccel
  const inertia = options.inertia ?? DEFAULT_INERTIA

  // World state the auto-pilot reads from the game stores
  enterSector(sector)
  meteorTracks.clear()
  scrapRegistry.clear()
  resetHold()
  resetRoute()
  gameStats.autopilotTier = tier
  gameStats.hull = 100
  gameStats.target = null
  gameStats.arrival = { phase: 'none', body: -1, orbitRadius: 0, lever: 0 }
  Object.assign(gameStats.autopilot, {
    engaged: true,
    task,
    destination: task === 'nav' ? (scenario.index ?? 0) : 0,
    status: 'Engaging',
    harvestId: null,
    sweep: false,
    intent: 'choose',
  })
  dockInfo.canDock = false
  const obstacles = obstaclesFor(sector)
  if (task === 'harvest' && scenario.scrap) scrapRegistry.set(1, { position: scenario.scrap.clone(), kind: 'scrap' })

  const station = task === 'dock' ? sector.stations[scenario.index ?? 0] : undefined
  const entrance = station ? stationPose(station).entrance : null
  const boxes = stationBoxes(sector)

  const pos = scenario.position.clone()
  const vel = scenario.velocity.clone()
  const quat = scenario.quaternion.clone()
  const omega = new THREE.Vector3()
  const gravity = createGravitySample()
  const out = createAutopilotOutput()
  const accel = new THREE.Vector3()
  const forward = new THREE.Vector3()
  const target = createTargetState()
  if (entrance) target.position.copy(entrance)
  const goal = entrance ?? (scenario.scrap ? scenario.scrap : new THREE.Vector3(...(sector.planets[scenario.index ?? 0]?.position ?? [0, 0, 0])))

  const input: AutopilotInput = {
    tier,
    task,
    destination: sector.planets[scenario.index ?? 0],
    target: entrance ? target : null,
    engaged: true,
    position: pos,
    velocity: vel,
    quaternion: quat,
    angularVelocity: omega,
    gravity: gravity.accel,
    dt,
    mainAccel,
    harvestRange: 10,
    scanRange: 5000,
    hull: 100,
    obstacles,
  }

  const result: SimResult = {
    id: scenario.id,
    tier,
    task,
    start: scenario.start,
    outcome: 'timeout',
    time: 0,
    pathLength: 0,
    straightLine: scenario.position.distanceTo(goal),
    minGap: { planet: NO_GAP, asteroid: NO_GAP, station: NO_GAP },
    minWellFraction: NO_GAP,
    lastStatus: '',
  }
  let blockedFor = 0
  let arrivedAt = -1
  const previous = new THREE.Vector3()

  for (let t = 0; t < maxTime; t += dt) {
    sampleGravity(pos, gravity)
    // The dock prompt appears within range and below the speed limit, and the auto-pilot reads it
    dockInfo.canDock = entrance !== null && pos.distanceTo(entrance) < DOCK_RANGE && vel.length() < DOCK_MAX_SPEED

    runAutopilot(input, out)
    result.lastStatus = out.status
    options.trace?.(t, pos, vel, out.status)
    if (out.status.startsWith('Path blocked')) blockedFor += dt
    else blockedFor = 0

    if (task === 'nav' && out.status.startsWith('Arrival')) {
      if (arrivedAt < 0) arrivedAt = t
      if (t - arrivedAt >= settle) return finish(result, 'arrived', t)
    }
    if (task === 'dock' && out.requestDock) return finish(result, 'arrived', t)
    if (task === 'harvest' && scenario.scrap && pos.distanceTo(scenario.scrap) < input.harvestRange) return finish(result, 'arrived', t)
    if (blockedFor > 5) return finish(result, 'blocked', t)

    // Same forces the ship applies: gravity, manoeuvring thrusters, and the main engine along the nose
    accel.copy(gravity.accel).add(out.maneuverAccel)
    forward.set(0, 0, -1).applyQuaternion(quat)
    accel.addScaledVector(forward, out.throttle * mainAccel)
    const drag = linearDamping({
      base: SHIP_PHYSICS.linearDamping,
      well: SHIP_PHYSICS.wellDamping,
      freedom: gravity.freedom,
      atmosphereDrag: SHIP_PHYSICS.atmosphereDrag,
      atmosphere: gravity.atmosphere,
      landed: 0,
    })
    previous.copy(pos)
    stepRigidBody(pos, vel, quat, omega, accel, out.angularAccel, inertia, drag, SHIP_PHYSICS.angularDamping, dt)
    result.pathLength += previous.distanceTo(pos)

    // What the ship is touching now
    for (const planet of sector.planets) {
      const centre = Math.hypot(pos.x - planet.position[0], pos.y - planet.position[1], pos.z - planet.position[2])
      const gap = centre - planet.radius - shipRadius
      result.minWellFraction = Math.min(result.minWellFraction, centre / planet.wellRadius)
      if (gap < result.minGap.planet) result.minGap.planet = gap
      if (gap < 0) return finish(result, 'crashed', t, { kind: 'planet', name: planet.name, time: t, speed: vel.length() })
    }
    for (const rock of sector.asteroids) {
      const gap = Math.hypot(pos.x - rock.position[0], pos.y - rock.position[1], pos.z - rock.position[2]) - rock.radius - shipRadius
      if (gap < result.minGap.asteroid) result.minGap.asteroid = gap
      if (gap < 0) return finish(result, 'crashed', t, { kind: 'asteroid', name: 'asteroid', time: t, speed: vel.length() })
    }
    for (const s of boxes) {
      if (pos.distanceToSquared(s.origin) > 150 * 150) continue
      const gap = distanceToStation(pos, s) - shipRadius
      if (gap < result.minGap.station) result.minGap.station = gap
      if (gap < 0) return finish(result, 'crashed', t, { kind: 'station', name: s.name, time: t, speed: vel.length() })
    }
  }
  return finish(result, 'timeout', maxTime)
}

function finish(result: SimResult, outcome: SimResult['outcome'], time: number, hit?: SimResult['hit']): SimResult {
  result.outcome = outcome
  result.time = time
  if (hit) result.hit = hit
  return result
}

// ---------- Scenarios ----------

const randomQuaternion = (rand: () => number) =>
  new THREE.Quaternion(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1 || 1).normalize()

/** Is `p` clear of every planet's surface, atmosphere and a margin, of every rock and of every station? */
function isClear(sector: Sector, p: THREE.Vector3, margin: number) {
  return (
    !sector.planets.some((b) => p.distanceTo(new THREE.Vector3(...b.position)) < b.radius + b.atmosphereHeight + margin) &&
    !sector.asteroids.some((r) => p.distanceTo(new THREE.Vector3(...r.position)) < r.radius + margin) &&
    !sector.stations.some((s) => p.distanceTo(new THREE.Vector3(...s.position)) < STATION_KEEP_OUT + margin)
  )
}

const insideAnyWell = (sector: Sector, p: THREE.Vector3) => sector.planets.some((b) => p.distanceTo(new THREE.Vector3(...b.position)) < b.wellRadius)

/**
 * The flights we measure in one sector: from the arrival point to each planet, to the hangar and to a few pieces of
 * scrap; out of the hangar to each planet; and past each planet slowly from the edge of its gravity well.
 */
export function buildScenarios(sector: Sector, seed: number, tiers: readonly number[] = [1, 2, 3], label = `seed ${seed}`): Scenario[] {
  const rand = mulberry32(seed * 7919 + 13)
  const scenarios: Scenario[] = []
  const origin = new THREE.Vector3()
  const rest = new THREE.Vector3()
  const base = (id: string, start: Scenario['start'], position: THREE.Vector3, quaternion: THREE.Quaternion, task: SimTask) => ({
    id: `${label} ${id}`,
    start,
    sector,
    position,
    velocity: rest.clone(),
    quaternion,
    task,
  })
  const add = (partial: Omit<Scenario, 'tier'>) => {
    for (const tier of tiers) scenarios.push({ ...partial, tier })
  }

  const arrivalFacing = randomQuaternion(rand)
  if (sector.stations.length === 0 || origin.distanceTo(new THREE.Vector3(...sector.stations[0].position)) > STATION_KEEP_OUT + 40) {
    sector.planets.forEach((planet, i) => add({ ...base(`arrival→${planet.name}`, 'arrival', origin.clone(), arrivalFacing.clone(), 'nav'), index: i }))
    sector.stations.forEach((_, i) => add({ ...base(`arrival→dock`, 'arrival', origin.clone(), arrivalFacing.clone(), 'dock'), index: i }))
    const far = sector.scrap
      .map((p) => new THREE.Vector3(...p))
      .filter((p) => p.length() > 100 && !insideAnyWell(sector, p))
      .sort((a, b) => a.length() - b.length())
    const picks = [far[0], far[Math.floor(far.length / 2)], far[far.length - 1]].filter((p, i, all) => p && all.indexOf(p) === i)
    picks.forEach((scrap, i) => add({ ...base(`arrival→scrap${i}`, 'arrival', origin.clone(), arrivalFacing.clone(), 'harvest'), scrap }))
  }

  // Out of a hangar: at rest just outside the mouth, nose pointing away from the station
  sector.stations.forEach((station, s) => {
    const pose = stationPose(station)
    const position = pose.entrance.clone().addScaledVector(pose.outward, 14)
    sector.planets.forEach((planet, i) =>
      add({ ...base(`undock${s}→${planet.name}`, 'undock', position.clone(), pose.departureQuaternion.clone(), 'nav'), index: i }),
    )
  })

  // Slowly past a planet: starting at rest at the edge of its well, heading for a point on the far side that a straight line
  // would reach by cutting through the planet's atmosphere
  sector.planets.forEach((planet) => {
    const centre = new THREE.Vector3(...planet.position)
    for (let k = 0; k < 2; k++) {
      const u = new THREE.Vector3(rand() * 2 - 1, (rand() * 2 - 1) * 0.35, rand() * 2 - 1).normalize()
      const side = new THREE.Vector3().crossVectors(u, new THREE.Vector3(0, 1, 0)).normalize()
      const startAt = centre.clone().addScaledVector(u, planet.wellRadius * 1.02)
      const scrap = centre.clone().addScaledVector(u, -planet.wellRadius * 1.1).addScaledVector(side, planet.wellRadius * (0.1 + 0.25 * k))
      if (!isClear(sector, startAt, 20) || !isClear(sector, scrap, 20)) continue
      if (sector.planets.some((b) => b !== planet && (insideWell(b, startAt) || insideWell(b, scrap)))) continue
      add({ ...base(`flyby ${planet.name}#${k}`, 'flyby', startAt, randomQuaternion(rand), 'harvest'), scrap })
    }
  })

  // Already moving past a planet, as after a manual fly-by: inside the well or just outside it, sliding sideways at a walking
  // pace, with scrap on the far side
  sector.planets.forEach((planet) => {
    const centre = new THREE.Vector3(...planet.position)
    for (let k = 0; k < 3; k++) {
      const u = new THREE.Vector3(rand() * 2 - 1, (rand() * 2 - 1) * 0.35, rand() * 2 - 1).normalize()
      const tangent = new THREE.Vector3().crossVectors(u, new THREE.Vector3(0, 1, 0)).normalize()
      const fraction = [0.6, 0.85, 1.3][k]
      const startAt = centre.clone().addScaledVector(u, planet.wellRadius * fraction)
      const scrap = centre.clone().addScaledVector(u, -planet.wellRadius * 1.2).addScaledVector(tangent, planet.wellRadius * 0.2)
      if (!isClear(sector, startAt, 20) || !isClear(sector, scrap, 20)) continue
      if (sector.planets.some((b) => b !== planet && (insideWell(b, startAt) || insideWell(b, scrap)))) continue
      const velocity = tangent.multiplyScalar(4 + rand() * 16).addScaledVector(u, -(rand() * 6))
      add({ ...base(`graze ${planet.name}#${k}`, 'graze', startAt, randomQuaternion(rand), 'harvest'), velocity, scrap })
    }
  })

  // Scrap lying inside a gravity well (the generator only keeps it off the planet's surface)
  const inWell = sector.scrap
    .map((p) => new THREE.Vector3(...p))
    .filter((p) => insideAnyWell(sector, p))
    .slice(0, 3)
  inWell.forEach((scrap, i) => add({ ...base(`wellscrap${i}`, 'wellscrap', origin.clone(), arrivalFacing.clone(), 'harvest'), scrap }))

  // Straight across a station or a rock: from one side, at rest, to the other
  const across = (id: string, centre: THREE.Vector3, direction: THREE.Vector3, reach: number) => {
    const startAt = centre.clone().addScaledVector(direction, -reach)
    const scrap = centre.clone().addScaledVector(direction, reach)
    if (!isClear(sector, startAt, 20) || !isClear(sector, scrap, 20) || sector.planets.some((b) => insideWell(b, startAt) || insideWell(b, scrap))) return
    add({ ...base(id, 'cross', startAt, randomQuaternion(rand), 'harvest'), scrap })
  }
  sector.stations.forEach((station, s) => {
    const pose = stationPose(station)
    const centre = new THREE.Vector3(...station.position)
    // along the axis, from behind the station to its mouth and back, and across it
    across(`cross station${s} axis`, centre, pose.outward.clone(), 220)
    across(`cross station${s} side`, centre, new THREE.Vector3(1, 0, 0).applyQuaternion(pose.quaternion), 220)
    across(`cross station${s} diag`, centre, new THREE.Vector3(1, 0.3, -1).normalize().applyQuaternion(pose.quaternion), 220)
  })
  for (let k = 0; k < 2 && sector.asteroids.length > 0; k++) {
    const rock = sector.asteroids[Math.floor(rand() * sector.asteroids.length)]
    const direction = new THREE.Vector3(rand() * 2 - 1, (rand() * 2 - 1) * 0.4, rand() * 2 - 1).normalize()
    across(`cross rock${k}`, new THREE.Vector3(...rock.position), direction, 150)
  }

  // Anywhere, already moving: to the nearest planet, or to a piece of scrap
  for (let k = 0; k < 3; k++) {
    const spot = new THREE.Vector3(rand() * 2 - 1, (rand() * 2 - 1) * 0.4, rand() * 2 - 1).normalize().multiplyScalar(100 + rand() * 900)
    if (!isClear(sector, spot, 25)) continue
    const velocity = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize().multiplyScalar(rand() * 25)
    const random = (id: string, task: SimTask) => ({ ...base(id, 'random', spot.clone(), randomQuaternion(rand), task), velocity: velocity.clone() })
    if (sector.planets.length > 0) add({ ...random(`random${k}?planet`, 'nav'), index: Math.floor(rand() * sector.planets.length) })
    const scrap = sector.scrap.map((p) => new THREE.Vector3(...p)).sort((a, b) => a.distanceTo(spot) - b.distanceTo(spot))[0]
    if (scrap && scrap.distanceTo(spot) > 40) add({ ...random(`random${k}?scrap`, 'harvest'), scrap })
    if (sector.stations.length > 0) add({ ...random(`random${k}?dock`, 'dock'), index: 0 })
  }
  return scenarios
}

const insideWell = (b: Sector['planets'][number], p: THREE.Vector3) => p.distanceTo(new THREE.Vector3(...b.position)) < b.wellRadius

// ---------- Reports ----------

export type GroupKey = 'task' | 'tier' | 'start'

/** Counts of outcomes by crash kind for a set of results. */
export function tally(results: readonly SimResult[]) {
  const t = { runs: results.length, arrived: 0, planet: 0, asteroid: 0, station: 0, timeout: 0, blocked: 0, length: 0, straight: 0, lengthRuns: 0 }
  for (const r of results) {
    if (r.outcome === 'arrived') {
      t.arrived++
      t.length += r.pathLength
      t.straight += r.straightLine
      t.lengthRuns++
    } else if (r.outcome === 'crashed' && r.hit) t[r.hit.kind]++
    else if (r.outcome === 'timeout') t.timeout++
    else if (r.outcome === 'blocked') t.blocked++
  }
  return t
}

const pct = (n: number, of: number) => (of === 0 ? '  -  ' : `${((100 * n) / of).toFixed(1).padStart(4)}%`)

/** A table of what the auto-pilot hit, grouped by tier and task. */
export function formatReport(title: string, results: readonly SimResult[]): string {
  const lines = [`## ${title}`, '', '| tier | task | runs | arrived | planet | rock | station | timeout | blocked | mean length / straight |', '|---|---|---|---|---|---|---|---|---|---|']
  for (const tier of [1, 2, 3]) {
    for (const task of ['nav', 'dock', 'harvest'] as const) {
      const rows = results.filter((r) => r.tier === tier && r.task === task)
      if (rows.length === 0) continue
      const t = tally(rows)
      const ratio = t.straight > 0 ? (t.length / t.straight).toFixed(2) : '-'
      lines.push(
        `| ${tier} | ${task} | ${t.runs} | ${pct(t.arrived, t.runs)} | ${t.planet} (${pct(t.planet, t.runs).trim()}) | ${t.asteroid} (${pct(t.asteroid, t.runs).trim()}) | ${t.station} (${pct(t.station, t.runs).trim()}) | ${t.timeout} | ${t.blocked} | ${ratio} |`,
      )
    }
  }
  const all = tally(results)
  lines.push(`| all | all | ${all.runs} | ${pct(all.arrived, all.runs)} | ${all.planet} | ${all.asteroid} | ${all.station} | ${all.timeout} | ${all.blocked} | ${all.straight > 0 ? (all.length / all.straight).toFixed(2) : '-'} |`)
  return lines.join('\n')
}

/** The crashes and failures as one line each */
export function listFailures(results: readonly SimResult[], limit = 40): string[] {
  return results
    .filter((r) => r.outcome !== 'arrived')
    .slice(0, limit)
    .map((r) => `${r.id} tier ${r.tier} ${r.task} [${r.start}]: ${r.outcome}${r.hit ? ` ${r.hit.kind} ${r.hit.name} at ${r.hit.time.toFixed(0)}s, ${r.hit.speed.toFixed(0)} u/s` : ''} (last status: ${r.lastStatus})`)
}
