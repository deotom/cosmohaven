import * as THREE from 'three'
import type { Block, GridPos } from './types'

export const GEAR_LENGTH = 1.5
export const TOUCH_TOLERANCE = 0.02
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))

export type GearLayout = { mounts: GridPos[]; gearLength: number; bellyHeight: number }

/** Mounts belong to occupied cells of the lowest layer, including irregular/hollow hulls. */
export function computeGearLayout(blocks: readonly Block[]): GearLayout {
  if (!blocks.length) return { mounts: [], gearLength: GEAR_LENGTH, bellyHeight: 0 }
  const bottom = Math.min(...blocks.map((b) => b.pos[1]))
  const cells = blocks.filter((b) => b.pos[1] === bottom).map((b) => b.pos).sort((a, b) => a[0] - b[0] || a[2] - b[2])
  const minX = Math.min(...cells.map((p) => p[0]))
  const maxX = Math.max(...cells.map((p) => p[0]))
  const minZ = Math.min(...cells.map((p) => p[2]))
  const maxZ = Math.max(...cells.map((p) => p[2]))
  const candidates = cells.flatMap(([x, , z]) => [-0.3, 0.3].flatMap((dx) => [-0.3, 0.3].map((dz): GridPos => [x + dx, bottom - 0.5, z + dz])))
  const corners = cells.length <= 2
    ? [[minX - 0.3, minZ - 0.3], [maxX + 0.3, minZ - 0.3], [(minX + maxX) / 2, maxZ + 0.3]]
    : [[minX - 0.3, minZ - 0.3], [maxX + 0.3, minZ - 0.3], [maxX + 0.3, maxZ + 0.3], [minX - 0.3, maxZ + 0.3]]
  const mounts = corners.map(([x, z]) => {
    candidates.sort((a, b) => Math.hypot(a[0] - x, a[2] - z) - Math.hypot(b[0] - x, b[2] - z) || a[0] - b[0] || a[2] - b[2])
    return candidates.shift()!
  })
  const comY = blocks.reduce((sum, b) => sum + b.pos[1], 0) / blocks.length
  return { mounts, gearLength: GEAR_LENGTH, bellyHeight: comY - bottom + 0.5 }
}

export function stepGear(progress: number, target: boolean, dt: number) {
  return clamp(progress + (target ? 1 : -1) * Math.max(0, dt), 0, 1)
}

export function isTouchdown(altitude: number, supportHeight: number, radialSpeed: number, tolerance = TOUCH_TOLERANCE) {
  return Number.isFinite(altitude + supportHeight + radialSpeed) && altitude - supportHeight <= tolerance && Math.abs(radialSpeed) <= 12
}

/** Low-speed belly contact costs up to 8%; the shock absorbers keep ordinary gear landings undamaged. */
export function landingDamage(speed: number, deployed: boolean) {
  const impact = Math.max(0, speed)
  return Math.min(60, Math.max(0, impact - (deployed ? 8 : 4)) * (deployed ? 0.5 : 1))
}

/** Keep the incoming impact before the spring slows it, so a fast crash still uses collision damage. */
export function recordGearImpact(peak: number, radialSpeed: number, suspensionActive: boolean) {
  return suspensionActive ? Math.max(peak, -radialSpeed, 0) : peak
}

/** Implicit spring/damper: bounded response even when a rendered frame takes half a second. */
export function suspensionAcceleration(altitude: number, supportHeight: number, radialSpeed: number, pull: number, dt: number) {
  if (!Number.isFinite(altitude + supportHeight + radialSpeed + pull + dt)) return 0
  const h = clamp(dt, 1 / 240, 0.5)
  // Sweep the feet through this frame: low FPS must not skip the entire suspension stroke.
  if (altitude + Math.min(0, radialSpeed) * h > supportHeight) return 0
  const k = 400
  const c = 80
  return Math.max(0, pull + (k * (supportHeight - altitude - radialSpeed * h) - c * radialSpeed) / (1 + c * h + k * h * h))
}

export type SuspensionStep = { sample: readonly number[]; velocity: number; altitude: number; acceleration: number }

/** Predict the impulse already sent until the worker acknowledges a new velocity sample. */
export function stepSuspension(previous: SuspensionStep | null, sample: readonly number[], altitude: number, height: number, radialSpeed: number, pull: number, dt: number): SuspensionStep {
  const velocity = previous?.sample === sample ? previous.velocity : radialSpeed
  const predictedAltitude = previous?.sample === sample ? previous.altitude : altitude
  const acceleration = suspensionAcceleration(predictedAltitude, height, velocity, pull, dt)
  const nextVelocity = velocity + (acceleration - pull) * Math.min(Math.max(0, dt), 0.1)
  // The worker runs at most ten fixed 1/60 s substeps per frame.
  return { sample, acceleration, velocity: nextVelocity, altitude: predictedAltitude + nextVelocity * Math.min(Math.max(0, dt), 1 / 6) }
}

/** Gimballed struts follow the surface normal; the existing descent points the nose, rather than the belly, outward. */
export function gearPose(layout: GearLayout, blocks: readonly Block[], quaternion: THREE.Quaternion, up: THREE.Vector3, radius: number) {
  const com = new THREE.Vector3()
  for (const b of blocks) com.add(new THREE.Vector3(...b.pos))
  com.divideScalar(Math.max(1, blocks.length))
  const localDown = up.clone().negate().applyQuaternion(quaternion.clone().invert())
  const swivel = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), localDown)
  let bellyHeight = 0
  for (const b of blocks) {
    const offset = new THREE.Vector3(...b.pos).sub(com)
    const depth = offset.dot(localDown) + 0.5 * (Math.abs(localDown.x) + Math.abs(localDown.y) + Math.abs(localDown.z))
    bellyHeight = Math.max(bellyHeight, depth)
  }
  const legs = layout.mounts.map((mount) => {
    const anchor = new THREE.Vector3(...mount).sub(com)
    const root = new THREE.Vector3(anchor.x, 0, anchor.z).applyQuaternion(swivel).addScaledVector(localDown, bellyHeight)
    const length = layout.gearLength
    const foot = root.clone().addScaledVector(localDown, length).applyQuaternion(quaternion)
    const depth = -foot.dot(up)
    const tangentSq = Math.max(0, foot.lengthSq() - depth * depth)
    const height = Math.sqrt(Math.max(0, radius * radius - tangentSq)) - radius + depth
    return { anchor, root, length, foot, height }
  })
  return { legs, localDown, bellyHeight, supportHeight: Math.max(bellyHeight, ...legs.map((leg) => leg.height)) }
}

/** Transient telemetry only: never saved; restored descent reconstructs it on the next frame. */
export const gearState = { progress: 0, target: false, manual: null as boolean | null, phase: 'none', supportHeight: 2, altitude: Infinity }
export const readGear = () => ({ ...gearState })
export function retractGear() {
  gearState.progress = 0
  gearState.target = false
  gearState.manual = null
  gearState.phase = 'none'
}
export function toggleGear(locked: boolean) {
  if (locked) { retractGear(); return }
  gearState.manual = !gearState.target
  gearState.target = gearState.manual
}
export function updateGear(phase: string, altitude: number, radialSpeed: number, dt: number, locked: boolean) {
  if (locked) { retractGear(); return }
  const landing = phase === 'descent' || phase === 'landed'
  const wasLanding = gearState.phase === 'descent' || gearState.phase === 'landed'
  if (landing !== wasLanding) gearState.manual = null
  gearState.phase = phase
  gearState.altitude = altitude
  if (!landing || (phase === 'landed' && altitude > 15 && radialSpeed > 0)) {
    if (gearState.manual === null || altitude > 15 && radialSpeed > 0) gearState.target = false
  } else if (gearState.manual === null) gearState.target = altitude < 40
  gearState.progress = stepGear(gearState.progress, gearState.target, dt)
}
export function reportGearHeight(height: number) { gearState.supportHeight = height }
