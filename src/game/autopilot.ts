import * as THREE from 'three'
import { dockInfo } from './dock'
import {
  canAddCargo,
  CELESTIAL_BODIES,
  gameStats,
  getCargoCapacity,
  getCargoVolume,
  meteorTracks,
  notify,
  setArrival,
  setAutopilot,
  setTarget,
  type AutopilotTask,
  type CelestialBody,
} from './gameState'
import { scrapRegistry, type TargetState } from './targets'

/** Max angular acceleration the auto-pilot asks for, matching the manual controls (rad/s²). */
export const AP_ANGULAR_ACCEL = 4
/** Acceleration of the manoeuvring thrusters (units/s²). The main engine's acceleration is passed in. */
export const AP_THRUST_ACCEL = 8

// Heading controller: α = KP·angleError − KD·ω, close to critically damped (KD ≈ 2·√KP)
const KP = 3
const KD = 3.4
/** Beyond this misalignment (rad) the main engine is off; it ramps in as the nose swings on target. */
const ALIGN_TOLERANCE = 0.6

// Collision avoidance
const LOOKAHEAD = 10 // seconds
const SAFE_DISTANCE = 12 // predicted miss distance below which we dodge

// Approach braking: follow limit(s) = sqrt(arrivalSpeed² + 2·BRAKE_DECEL·s), the speed from which we can still stop
const BRAKE_DECEL = 4.8
const BRAKE_GAIN = 2
const APPROACH_CAP = 45
const LATERAL_GAIN = 0.8
const CRUISE_SPEED = 19 // tier 3 burns just enough to hold this

/** Where the auto-pilot hands over to the arrival choice: just inside a planet's gravity well. */
export const INFLUENCE_FRACTION = 0.97
const INFLUENCE_ARRIVAL_SPEED = 15

// Orbital insertion
/** An orbit counts as locked once speed along and across the orbit are this close (u/s) to a circle, for ORBIT_SETTLE_TIME */
const ORBIT_LOCK_TOLERANCE = 0.25
const ORBIT_SETTLE_TIME = 1
/** Orbits are circularised below this fraction of the well radius */
const ORBIT_STABLE_FRACTION = 0.75
const ORBIT_SAFE_CLEARANCE = 25 // never circularise lower than this above the top of the atmosphere

// De-orbit and landing
const DEORBIT_TANGENTIAL_SPEED = 4 // sideways speed at which the ship is considered "dropped"
const TOUCH_SPEED = 4 // the speed the auto-pilot aims to touch down at; the safe limit is 12
export const LAND_ALTITUDE = 5 // centre-of-ship altitude counted as touchdown
export const SAFE_LANDING_SPEED = 12

// Harvest and evacuation
export const HARVEST_SCAN_RANGE = 150
const HOLD_KP = 0.5
const HOLD_KD = 1.2
const EVAC_HULL = 35
const EVAC_THREATS = 2

export type AutopilotInput = {
  /** 1 basic, 2 collision avoidance, 3 efficient cruise */
  tier: number
  task: AutopilotTask
  /** Where NAV flies to (a planet), if there is one */
  destination: CelestialBody | undefined
  /** The locked target, resolved, for harvest and dock tasks */
  target: TargetState | null
  /** Is the auto-pilot flying, or is this just an arrival manoeuvre the ship is performing for the player? */
  engaged: boolean
  position: THREE.Vector3
  velocity: THREE.Vector3
  quaternion: THREE.Quaternion
  angularVelocity: THREE.Vector3
  /** Gravity at the ship (units/s²), to cancel when hovering */
  gravity: THREE.Vector3
  dt: number
  /** How hard the main engine pushes (units/s²), already including pilot skill and hull damage */
  mainAccel: number
  /** Harvester beam range */
  harvestRange: number
  /** How far the auto-pilot looks for scrap (a Floran sees further) */
  scanRange: number
  hull: number
}

export type AutopilotOutput = {
  /** 0-1 main engine, along the ship's nose */
  throttle: number
  /** World-space angular acceleration to apply (rad/s²); multiply by inertia for torque */
  angularAccel: THREE.Vector3
  /** World-space acceleration from the manoeuvring thrusters (units/s²) */
  maneuverAccel: THREE.Vector3
  status: string
  /** Distance to whatever the task is heading for */
  distance: number
  /** The evacuation protocol wants a Space-Fold now */
  requestFold: boolean
  /** The dock task is in range and wants to dock now */
  requestDock: boolean
}

export const createAutopilotOutput = (): AutopilotOutput => ({
  throttle: 0,
  angularAccel: new THREE.Vector3(),
  maneuverAccel: new THREE.Vector3(),
  status: 'Off',
  distance: 0,
  requestFold: false,
  requestDock: false,
})

const v = {
  toTarget: new THREE.Vector3(),
  dir: new THREE.Vector3(),
  aim: new THREE.Vector3(),
  forward: new THREE.Vector3(),
  axis: new THREE.Vector3(),
  rHat: new THREE.Vector3(),
  tHat: new THREE.Vector3(),
  velTan: new THREE.Vector3(),
  desired: new THREE.Vector3(),
  dv: new THREE.Vector3(),
  lateral: new THREE.Vector3(),
  rel: new THREE.Vector3(),
  relVel: new THREE.Vector3(),
  miss: new THREE.Vector3(),
  evade: new THREE.Vector3(),
  spot: new THREE.Vector3(),
}
const WORLD_UP = new THREE.Vector3(0, 1, 0)
const WORLD_X = new THREE.Vector3(1, 0, 0)

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))

function clampLength(vec: THREE.Vector3, max: number) {
  const len = vec.length()
  if (len > max) vec.multiplyScalar(max / len)
}

// ---------- Attitude ----------

/** Points the nose (-Z) at `aim`; returns the remaining angle in radians and fills `angularAccel`. */
export function holdAttitude(input: AutopilotInput, aim: THREE.Vector3, out: AutopilotOutput): number {
  v.forward.set(0, 0, -1).applyQuaternion(input.quaternion)
  v.axis.crossVectors(v.forward, aim)
  const sin = v.axis.length()
  const cos = v.forward.dot(aim)
  const angle = Math.atan2(sin, cos)
  if (sin > 1e-5) v.axis.multiplyScalar(1 / sin)
  else if (cos < 0) v.axis.crossVectors(v.forward, WORLD_UP).normalize() // facing exactly away: pick any turn
  else v.axis.set(0, 0, 0)

  out.angularAccel.copy(v.axis).multiplyScalar(KP * angle).addScaledVector(input.angularVelocity, -KD)
  clampLength(out.angularAccel, AP_ANGULAR_ACCEL)
  return angle
}

/** Damps any spin without trying to point anywhere. */
function stopRotation(input: AutopilotInput, out: AutopilotOutput) {
  out.angularAccel.copy(input.angularVelocity).multiplyScalar(-KD)
  clampLength(out.angularAccel, AP_ANGULAR_ACCEL)
}

// ---------- Hazards ----------

/**
 * Predict each meteor's closest approach and, if it would pass too close, accelerate sideways away from the
 * predicted pass point. Returns how many meteors are on a collision course.
 */
function avoidMeteors(input: AutopilotInput, out: AutopilotOutput): number {
  v.evade.set(0, 0, 0)
  let threats = 0

  for (const track of meteorTracks.values()) {
    v.rel.set(...track.position).sub(input.position)
    v.relVel.set(...track.velocity).sub(input.velocity)
    const speedSq = v.relVel.lengthSq()
    if (speedSq < 1e-3) continue

    const tClosest = -v.rel.dot(v.relVel) / speedSq
    if (tClosest < 0 || tClosest > LOOKAHEAD) continue

    v.miss.copy(v.rel).addScaledVector(v.relVel, tClosest) // where the meteor will be, relative to us
    const missDistance = v.miss.length()
    if (missDistance >= SAFE_DISTANCE) continue

    // Move away from the predicted pass point, but only sideways to the meteor's path
    if (missDistance > 0.5) v.miss.multiplyScalar(-1 / missDistance)
    else v.miss.crossVectors(v.relVel, WORLD_UP).normalize() // a dead-centre hit: dodge to either side
    v.relVel.normalize()
    v.miss.addScaledVector(v.relVel, -v.miss.dot(v.relVel)).normalize()

    const urgency = clamp(1.2 - tClosest / LOOKAHEAD, 0.25, 1) * clamp(1.5 - missDistance / SAFE_DISTANCE, 0.4, 1)
    v.evade.addScaledVector(v.miss, urgency)
    threats++
  }

  if (threats > 0) {
    clampLength(v.evade, 1)
    out.maneuverAccel.addScaledVector(v.evade, AP_THRUST_ACCEL)
  }
  return threats
}

// ---------- Flying to a point ----------

/**
 * Flies to within `stopDistance` of `point`, following a braking curve down to `arrivalSpeed` there.
 * Returns the distance left to go. `holdAtEnd` switches to station-keeping once close, for targets that stay put.
 */
function flyTo(
  input: AutopilotInput,
  out: AutopilotOutput,
  point: THREE.Vector3,
  stopDistance: number,
  arrivalSpeed: number,
  dodging: boolean,
  holdAtEnd = false,
): { remaining: number; braking: boolean; angle: number } {
  v.toTarget.copy(point).sub(input.position)
  const distance = v.toTarget.length()
  v.dir.copy(v.toTarget).multiplyScalar(1 / Math.max(distance, 1e-6))
  out.distance = distance
  const remaining = distance - stopDistance

  if (holdAtEnd && remaining < 6) {
    // Close enough: hover on the spot, cancelling gravity and drift
    v.spot.copy(point).addScaledVector(v.dir, -stopDistance)
    out.maneuverAccel
      .copy(input.gravity)
      .multiplyScalar(-1)
      .addScaledVector(v.spot.sub(input.position), HOLD_KP)
      .addScaledVector(input.velocity, -HOLD_KD)
    clampLength(out.maneuverAccel, AP_THRUST_ACCEL)
    const angle = holdAttitude(input, v.dir, out)
    return { remaining, braking: false, angle }
  }

  const limit = Math.min(APPROACH_CAP, Math.sqrt(arrivalSpeed ** 2 + 2 * BRAKE_DECEL * Math.max(remaining, 0)))
  const closing = input.velocity.dot(v.dir)

  // Too fast for the distance left: brake with the retro thrusters
  const braking = closing > limit
  if (braking) out.maneuverAccel.addScaledVector(v.dir, -clamp(BRAKE_GAIN * (closing - limit), 0, AP_THRUST_ACCEL))

  // Sideways drift (gravity bends the path) is trimmed so the approach stays on the line
  if (!dodging) {
    v.lateral.copy(input.velocity).addScaledVector(v.dir, -closing)
    out.maneuverAccel.addScaledVector(v.lateral, -LATERAL_GAIN)
    clampLength(out.maneuverAccel, AP_THRUST_ACCEL)
  }

  const angle = holdAttitude(input, v.dir, out)
  const alignment = clamp(1 - angle / ALIGN_TOLERANCE, 0, 1)
  // Tier 3 burns just enough to hold a modest cruise speed and coasts otherwise
  const targetSpeed = input.tier >= 3 ? Math.min(limit, CRUISE_SPEED) : limit
  out.throttle = alignment * clamp((targetSpeed - closing) / 6, 0, 1)
  return { remaining, braking, angle }
}

// ---------- NAV ----------

function navTask(input: AutopilotInput, out: AutopilotOutput): AutopilotOutput {
  const body = input.destination
  if (!body) {
    stopRotation(input, out)
    out.status = 'No waypoint'
    return out
  }

  const dodging = input.tier >= 2 && avoidMeteors(input, out) > 0
  v.spot.set(...body.position)
  const influence = body.wellRadius * INFLUENCE_FRACTION
  const { remaining, braking, angle } = flyTo(input, out, v.spot, influence, INFLUENCE_ARRIVAL_SPEED, dodging)

  if (remaining <= 0) {
    // Inside the planet's sphere of influence: stop pushing and wait for the orbit / landing choice
    out.throttle = 0
    out.status = gameStats.autopilot.intent === 'choose' ? 'Arrival: choose [O] orbit / [L] land' : 'Arrival: starting manoeuvre'
    return out
  }

  if (dodging) out.status = 'Evading meteor'
  else if (braking) out.status = 'Approach: braking'
  else if (angle > ALIGN_TOLERANCE) out.status = 'Aligning'
  else out.status = input.tier >= 3 && out.throttle < 0.05 ? 'Coasting' : 'Cruising'
  return out
}

// ---------- Orbital insertion (the player pressed [O]) ----------

let orbitSettled = 0

function orbitInsertion(input: AutopilotInput, body: CelestialBody, out: AutopilotOutput): AutopilotOutput {
  v.rHat.set(...body.position).sub(input.position)
  const distance = v.rHat.length()
  v.rHat.multiplyScalar(-1 / distance) // planet → ship
  out.distance = distance
  const radialSpeed = input.velocity.dot(v.rHat)
  v.velTan.copy(input.velocity).addScaledVector(v.rHat, -radialSpeed)

  // Circularise where we are: the planet's exact circular orbit speed at this radius, v = sqrt(GM / r), and no
  // radial motion. Only if the ship is outside the safe band (inside the atmosphere, or at the very edge of
  // the well) is it nudged back towards it.
  const minRadius = body.radius + body.atmosphereHeight + ORBIT_SAFE_CLEARANCE
  // Gravity fades in over the outer fifth of a well, and orbits there are unstable (the pull rises faster than 1/r² as
  // you go inward), so the circular orbit has to be lower down, in the region where gravity is a clean inverse square
  const maxRadius = body.wellRadius * ORBIT_STABLE_FRACTION
  if (gameStats.arrival.orbitRadius === 0) {
    setArrival({ orbitRadius: clamp(distance, minRadius, maxRadius) })
    orbitSettled = 0
  }

  // Orbit in the direction we are already going sideways; if there's none, pick any tangent
  if (v.velTan.lengthSq() > 0.25) v.tHat.copy(v.velTan).normalize()
  else v.tHat.crossVectors(v.rHat, WORLD_UP).normalize()
  if (v.tHat.lengthSq() < 0.5) v.tHat.crossVectors(v.rHat, WORLD_X).normalize()

  // Circular orbit speed from the pull actually felt here: v = sqrt(g·r). (Near the edge of a well gravity fades in, so
  // this is slightly less than the textbook sqrt(GM / r).)
  const localPull = input.gravity.length() > 1e-6 ? input.gravity.length() : body.gm / (distance * distance)
  const circularSpeed = Math.sqrt(localPull * distance)
  // Outside the stable band, sink (or climb) towards it; inside, no radial motion at all
  const radialGap = clamp(distance, minRadius, maxRadius) - distance
  const radialTarget = Math.abs(radialGap) > 15 ? clamp(0.1 * radialGap, -6, 6) : 0
  v.desired.copy(v.tHat).multiplyScalar(circularSpeed).addScaledVector(v.rHat, radialTarget)
  v.dv.copy(v.desired).sub(input.velocity)
  const error = v.dv.length()
  const tangentialError = Math.abs(v.velTan.length() - circularSpeed)

  const inBand = distance <= maxRadius * 1.02 && distance >= minRadius * 0.98
  if (inBand && tangentialError < ORBIT_LOCK_TOLERANCE && Math.abs(radialSpeed) < ORBIT_LOCK_TOLERANCE) {
    stopRotation(input, out)
    orbitSettled += input.dt
    if (orbitSettled >= ORBIT_SETTLE_TIME) {
      // Locked: the engine cuts off and the ship coasts round the planet on gravity alone
      setArrival({ phase: 'orbiting' })
      setAutopilot({ engaged: false, status: 'Off' })
      notify(`Orbit locked: ${body.name}. ${Math.round(input.velocity.length())} u/s at ${Math.round(distance - body.radius)} u altitude`, 'gain', 4500)
    }
    out.status = 'Orbit: engine cut-off'
    return out
  }
  orbitSettled = 0

  // Burn along the velocity change we need: retro-thrust where we're too fast, prograde where we're too slow
  v.aim.copy(v.dv).multiplyScalar(1 / error)
  const angle = holdAttitude(input, v.aim, out)
  out.throttle = clamp(1 - angle / ALIGN_TOLERANCE, 0, 1) * clamp(error / (input.mainAccel * 0.6), 0.04, 1)
  out.status = `Orbital insertion: burning ${error.toFixed(1)} u/s`
  return out
}

// ---------- De-orbit and landing ----------

function deorbit(input: AutopilotInput, body: CelestialBody, out: AutopilotOutput): AutopilotOutput {
  v.rHat.set(...body.position).sub(input.position)
  const distance = v.rHat.length()
  v.rHat.multiplyScalar(-1 / distance)
  out.distance = distance
  const radialSpeed = input.velocity.dot(v.rHat)
  v.velTan.copy(input.velocity).addScaledVector(v.rHat, -radialSpeed)
  const tangential = v.velTan.length()

  if (tangential <= DEORBIT_TANGENTIAL_SPEED) {
    stopRotation(input, out)
    setArrival({ phase: 'descent', lever: 0 })
    notify(`De-orbit complete: descending to ${body.name}`, 'gain', 3500)
    out.status = 'De-orbit complete'
    return out
  }

  // Retrograde burn, tilted slightly towards the surface, until the sideways speed is scrubbed off
  v.aim.copy(v.velTan).multiplyScalar(-1 / tangential).addScaledVector(v.rHat, -0.2).normalize()
  const angle = holdAttitude(input, v.aim, out)
  out.throttle = clamp(1 - angle / ALIGN_TOLERANCE, 0, 1) * clamp((tangential - DEORBIT_TANGENTIAL_SPEED) / 4, 0.2, 1)
  out.status = `De-orbit burn: ${tangential.toFixed(0)} u/s sideways`
  return out
}

/** The automatic descent: nose away from the ground, throttle chosen to follow a soft-landing speed curve. */
function descentController(input: AutopilotInput, body: CelestialBody, out: AutopilotOutput): AutopilotOutput {
  v.rHat.set(...body.position).sub(input.position)
  const distance = v.rHat.length()
  v.rHat.multiplyScalar(-1 / distance)
  out.distance = distance
  const altitude = distance - body.radius
  const radialSpeed = input.velocity.dot(v.rHat)
  const pull = body.gm / (distance * distance)
  v.velTan.copy(input.velocity).addScaledVector(v.rHat, -radialSpeed)

  // How fast we may fall at this height and still be able to brake to TOUCH_SPEED by the ground
  const brakeAccel = Math.max(0.6, 0.6 * (input.mainAccel - pull))
  const wanted = -Math.min(45, Math.sqrt(TOUCH_SPEED ** 2 + 2 * brakeAccel * Math.max(altitude - LAND_ALTITUDE, 0)))
  const outwardAccel = pull + 2 * (wanted - radialSpeed)

  const angle = holdAttitude(input, v.rHat, out)
  out.throttle = clamp(1 - angle / ALIGN_TOLERANCE, 0, 1) * clamp(outwardAccel / input.mainAccel, 0, 1)

  // Sideways drift is bled off near the ground so we come down on the spot
  if (altitude < 600) {
    out.maneuverAccel.copy(v.velTan).multiplyScalar(-0.8)
    clampLength(out.maneuverAccel, 4)
  }
  out.status = `Descent: ${altitude.toFixed(0)} u, ${radialSpeed.toFixed(1)} u/s`
  return out
}

// ---------- HARVEST ----------

function nearestScrap(from: THREE.Vector3, includeRelics: boolean, range: number): number | null {
  let best: number | null = null
  let bestDistance = range
  for (const [id, pickup] of scrapRegistry) {
    if (pickup.relic && !includeRelics) continue
    if (!canAddCargo(pickup.relic ? 'relics' : 'scrap')) continue
    const distance = pickup.position.distanceTo(from)
    if (distance < bestDistance) {
      best = id
      bestDistance = distance
    }
  }
  return best
}

function harvestTask(input: AutopilotInput, out: AutopilotOutput): AutopilotOutput {
  const ap = gameStats.autopilot
  const dodging = input.tier >= 2 && avoidMeteors(input, out) > 0

  // Keep the current piece until it is collected; then take the nearest, or stop if this was a single pick
  let id = ap.harvestId
  const currentPickup = id === null ? undefined : scrapRegistry.get(id)
  if (id !== null && (!currentPickup || !canAddCargo(currentPickup.relic ? 'relics' : 'scrap'))) {
    id = null
    if (!ap.sweep) {
      setAutopilot({ engaged: false, status: 'Off', harvestId: null })
      setTarget(null)
      notify('Harvest complete', 'gain', 2000)
      out.status = 'Harvest complete'
      return out
    }
  }
  if (id === null) id = nearestScrap(input.position, input.target !== null, input.scanRange)
  if (id !== ap.harvestId) setAutopilot({ harvestId: id })

  const pickup = id === null ? undefined : scrapRegistry.get(id)
  if (!pickup) {
    // Nothing in reach: hover and keep scanning
    stopRotation(input, out)
    out.maneuverAccel.copy(input.gravity).multiplyScalar(-1).addScaledVector(input.velocity, -HOLD_KD)
    clampLength(out.maneuverAccel, AP_THRUST_ACCEL)
    out.status =
      getCargoVolume() >= getCargoCapacity()
        ? 'Cargo hold full · sell at Trade Relay'
        : `Sweeping: no scrap within ${Math.round(input.scanRange)} u`
    return out
  }

  // Stop inside beam range, then hold there while the harvester reels it in
  const stop = input.harvestRange * 0.6
  const { remaining } = flyTo(input, out, pickup.position, stop, 0, dodging, true)
  out.status = dodging
    ? 'Evading meteor'
    : remaining < 6
      ? `Harvesting ${pickup.relic ? 'relic' : 'scrap'} (${out.distance.toFixed(0)} u)`
      : `Targeting ${pickup.relic ? 'relic' : 'scrap'} (${out.distance.toFixed(0)} u away)`
  return out
}

// ---------- HOLD ----------

const anchor = { set: false, point: new THREE.Vector3() }

/** Forget the hover point; the next HOLD takes the ship's position at that moment. */
export function resetHold() {
  anchor.set = false
}

function holdTask(input: AutopilotInput, out: AutopilotOutput): AutopilotOutput {
  if (!anchor.set) {
    anchor.point.copy(input.position)
    anchor.set = true
  }
  // Cancel gravity and drift, dodging meteors on the way; the pull towards the anchor brings us back afterwards
  const threats = avoidMeteors(input, out)
  v.dv.copy(anchor.point).sub(input.position)
  out.distance = v.dv.length()
  v.spot.copy(input.gravity).multiplyScalar(-1).addScaledVector(v.dv, HOLD_KP).addScaledVector(input.velocity, -HOLD_KD)
  out.maneuverAccel.add(v.spot)
  clampLength(out.maneuverAccel, AP_THRUST_ACCEL)
  stopRotation(input, out)
  out.status = threats > 0 ? 'Holding: evading meteor' : out.distance < 3 ? 'Holding position' : `Holding: returning (${out.distance.toFixed(0)} u)`
  return out
}

// ---------- EVAC ----------

function evacTask(input: AutopilotInput, out: AutopilotOutput): AutopilotOutput {
  holdTask(input, out) // sit tight and dodge while we decide

  // How dangerous is it here? Meteors converging on us, or a hull that can't take much more
  let converging = 0
  for (const track of meteorTracks.values()) {
    v.rel.set(...track.position).sub(input.position)
    v.relVel.set(...track.velocity).sub(input.velocity)
    const speedSq = v.relVel.lengthSq()
    if (speedSq < 1e-3) continue
    const t = -v.rel.dot(v.relVel) / speedSq
    if (t < 0 || t > LOOKAHEAD) continue
    if (v.miss.copy(v.rel).addScaledVector(v.relVel, t).length() < SAFE_DISTANCE * 2) converging++
  }

  const lowHull = input.hull < EVAC_HULL
  if (lowHull || converging >= EVAC_THREATS) {
    out.requestFold = true
    out.status = lowHull ? `EVAC: hull at ${Math.round(input.hull)}%, folding out` : `EVAC: ${converging} meteors converging, folding out`
  } else {
    out.status = `EVAC armed: hull ${Math.round(input.hull)}%, ${converging} threats`
  }
  return out
}

// ---------- DOCK ----------

function dockTask(input: AutopilotInput, out: AutopilotOutput): AutopilotOutput {
  const target = input.target
  if (!target) {
    stopRotation(input, out)
    out.status = 'No station'
    return out
  }
  const dodging = input.tier >= 2 && avoidMeteors(input, out) > 0
  flyTo(input, out, target.position, 20, 8, dodging)
  if (dockInfo.canDock) {
    out.requestDock = true
    out.status = 'Dock: requesting clearance'
  } else {
    out.status = dodging ? 'Evading meteor' : `Dock: approaching (${out.distance.toFixed(0)} u)`
  }
  return out
}

// ---------- Entry point ----------

/**
 * One tick of the auto-pilot. Fills `out` in place (no allocation) and never touches the ship: the caller
 * applies throttle, manoeuvre acceleration and angular acceleration.
 *
 * Arrival manoeuvres (orbital insertion, de-orbit burn, automatic descent) run whenever the arrival phase asks
 * for them; everything else follows the selected task while the auto-pilot is engaged.
 */
export function runAutopilot(input: AutopilotInput, out: AutopilotOutput): AutopilotOutput {
  out.throttle = 0
  out.maneuverAccel.set(0, 0, 0)
  out.angularAccel.set(0, 0, 0)
  out.requestFold = false
  out.requestDock = false

  const phase = gameStats.arrival.phase
  const body = CELESTIAL_BODIES[gameStats.arrival.body]
  if (body) {
    if (phase === 'insertion') return orbitInsertion(input, body, out)
    if (phase === 'deorbit') return deorbit(input, body, out)
    if (phase === 'descent' && input.engaged) return descentController(input, body, out)
  }
  if (!input.engaged) return out

  switch (input.task) {
    case 'harvest':
      return harvestTask(input, out)
    case 'hold':
      return holdTask(input, out)
    case 'evac':
      return evacTask(input, out)
    case 'dock':
      return dockTask(input, out)
    default:
      return navTask(input, out)
  }
}

// ---------- Controls used by the UI ----------

const TASK_CYCLE: AutopilotTask[] = ['nav', 'harvest', 'hold', 'evac']

export const TASK_LABELS: Record<AutopilotTask, string> = {
  nav: 'NAV',
  harvest: 'HARVEST',
  hold: 'HOLD',
  evac: 'EVAC',
  orbit: 'ORBIT',
  land: 'LAND',
  dock: 'DOCK',
}

/** Chooses what the auto-pilot does. Switching task starts fresh: a new hover point, a new scrap target. */
export function setTask(task: AutopilotTask, extra: Partial<typeof gameStats.autopilot> = {}) {
  resetHold()
  setAutopilot({ task, harvestId: null, status: gameStats.autopilot.engaged ? 'Engaging' : 'Off', ...extra })
}

/** Shift+P: cycle through the selectable task modes. */
export function nextTask() {
  const current = TASK_CYCLE.indexOf(gameStats.autopilot.task)
  const task = TASK_CYCLE[(current + 1) % TASK_CYCLE.length]
  setTask(task, { intent: 'choose' })
  notify(`Auto-pilot task: ${TASK_LABELS[task]}`, 'gain', 2000)
}

export function toggleAutopilot() {
  if (gameStats.autopilot.engaged) {
    setAutopilot({ engaged: false, status: 'Off', harvestId: null })
    notify('Auto-pilot disengaged', 'gain')
  } else {
    resetHold()
    setAutopilot({ engaged: true, status: 'Engaging' })
    notify(`Auto-pilot engaged: ${TASK_LABELS[gameStats.autopilot.task]}`, 'gain')
  }
}

/** Cycles the NAV destination through the known waypoints. */
export function nextWaypoint() {
  if (CELESTIAL_BODIES.length === 0) return
  const destination = (gameStats.autopilot.destination + 1) % CELESTIAL_BODIES.length
  setAutopilot({ destination })
  notify(`Waypoint: ${CELESTIAL_BODIES[destination].name}`, 'gain')
}

/**
 * Manual landing: the ship holds its nose away from the ground by itself while the pilot works the throttle
 * lever (Space up, Shift down). Sideways drift is bled off a little near the ground.
 */
export function manualDescent(input: AutopilotInput, lever: number, out: AutopilotOutput): AutopilotOutput {
  out.throttle = 0
  out.maneuverAccel.set(0, 0, 0)
  out.angularAccel.set(0, 0, 0)
  const body = CELESTIAL_BODIES[gameStats.arrival.body]
  if (!body) return out

  v.rHat.set(...body.position).sub(input.position)
  const distance = v.rHat.length()
  v.rHat.multiplyScalar(-1 / distance)
  const altitude = distance - body.radius
  const radialSpeed = input.velocity.dot(v.rHat)
  v.velTan.copy(input.velocity).addScaledVector(v.rHat, -radialSpeed)

  const angle = holdAttitude(input, v.rHat, out)
  out.throttle = lever * clamp(1 - angle / ALIGN_TOLERANCE, 0, 1)
  if (altitude < 600) {
    out.maneuverAccel.copy(v.velTan).multiplyScalar(-0.5)
    clampLength(out.maneuverAccel, 3)
  }
  out.status = `Landing: ${altitude.toFixed(0)} u, ${radialSpeed.toFixed(1)} u/s, throttle ${Math.round(lever * 100)}%`
  return out
}
