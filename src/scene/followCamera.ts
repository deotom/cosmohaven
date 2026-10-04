import * as THREE from 'three'

/** Where the follow camera sits relative to the ship, in ship space (behind and above the nose at -Z). */
export const FOLLOW_OFFSET = new THREE.Vector3(0, 3, 9)
/** How quickly the smoothed view turns to match the ship (1/s): higher is tighter. */
export const FOLLOW_STIFFNESS = 5

/** The camera looks along its own -Z; tipping it down by this angle aims it from the offset back at the ship. */
export const FOLLOW_TILT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.atan2(FOLLOW_OFFSET.y, FOLLOW_OFFSET.z))
const FOLLOW_TILT_INVERSE = FOLLOW_TILT.clone().invert()

/**
 * Advances the follow camera's frame towards the ship's. The view is a quaternion rather than a position plus an
 * "up" vector, so there is no moment when the ship's up and the view direction line up and the picture flips:
 * the ship can loop, roll or tumble and the camera turns through the shortest path with it.
 *
 * `locked` ties the camera rigidly to the ship (it rolls and flips exactly with it); otherwise it eases after it.
 */
export function advanceFollowFrame(frame: THREE.Quaternion, ship: THREE.Quaternion, dt: number, locked: boolean) {
  if (locked) frame.copy(ship)
  else frame.slerp(ship, 1 - Math.exp(-FOLLOW_STIFFNESS * Math.min(dt, 0.1)))
  return frame.normalize()
}

/** Where the camera wants to be, given the follow frame. */
export function followCameraPosition(frame: THREE.Quaternion, shipPosition: THREE.Vector3, out: THREE.Vector3) {
  return out.copy(FOLLOW_OFFSET).applyQuaternion(frame).add(shipPosition)
}

/** The camera's orientation for a follow frame: the frame, tipped down to look at the ship. */
export function followCameraOrientation(frame: THREE.Quaternion, out: THREE.Quaternion) {
  return out.copy(frame).multiply(FOLLOW_TILT)
}

/** The follow frame that matches an existing camera orientation: lets the chase start from wherever the camera is. */
export function followFrameFromCamera(cameraQuaternion: THREE.Quaternion, out: THREE.Quaternion) {
  return out.copy(cameraQuaternion).multiply(FOLLOW_TILT_INVERSE).normalize()
}

const rotationScratch = new THREE.Quaternion()
const offsetScratch = new THREE.Vector3()

/**
 * Orbit view that turns with the ship: when the ship rotates from `previous` to `current`, swing the camera round the
 * focus by the same rotation (position and orientation), so the view of the ship stays exactly as the player set it.
 */
export function rotateOrbitWithShip(
  previous: THREE.Quaternion,
  current: THREE.Quaternion,
  focus: THREE.Vector3,
  cameraPosition: THREE.Vector3,
  cameraQuaternion: THREE.Quaternion,
) {
  rotationScratch.copy(previous).invert().premultiply(current)
  offsetScratch.copy(cameraPosition).sub(focus).applyQuaternion(rotationScratch)
  cameraPosition.copy(focus).add(offsetScratch)
  cameraQuaternion.premultiply(rotationScratch).normalize()
}

/**
 * The free orbit has no poles: taking the camera's own "up" as the orbit axis every frame means the controls never
 * reach a pole to stop at, so the view can be turned to any angle, over the top and underneath.
 */
export function freeOrbitUp(cameraQuaternion: THREE.Quaternion, out: THREE.Vector3) {
  return out.set(0, 1, 0).applyQuaternion(cameraQuaternion)
}

// ---------- Landing view ----------

/** Altitude (above the surface) where the landing view starts to blend in, and where it is fully in charge. */
export const LANDING_VIEW_START = 70
export const LANDING_VIEW_FULL = 35
/** How far above the ship, and to the side, the landing camera hovers, so the ground fills the view below the ship. */
export const LANDING_HEIGHT = 9
export const LANDING_SIDE = 6
/** The camera is never allowed closer to a planet's centre than its surface plus this. */
export const SURFACE_MARGIN = 2

const smooth = (t: number) => {
  const x = Math.max(0, Math.min(1, t))
  return x * x * (3 - 2 * x)
}

/**
 * How much of the landing view to use: 0 unless the ship is descending or has landed, then ramping from 0 to 1
 * as the altitude falls from LANDING_VIEW_START to LANDING_VIEW_FULL.
 * A retro landing points the nose away from the ground, so the chase camera (behind the nose) ends up between the
 * ship and the ground looking away from it, inside the exhaust and finally below the surface.
 */
export function landingBlend(altitude: number, phase: string) {
  if (phase !== 'descent' && phase !== 'landed') return 0
  return smooth((LANDING_VIEW_START - altitude) / (LANDING_VIEW_START - LANDING_VIEW_FULL))
}

const lookMatrix = new THREE.Matrix4()
const rightScratch = new THREE.Vector3()
const normalScratch = new THREE.Vector3()
const tangentScratch = new THREE.Vector3()

/**
 * A camera pose for the last metres of a landing: above the ship (on the side away from the planet), a little to
 * one side, looking at the ship with the ground behind it and "up" pointing away from the surface.
 */
export function landingCameraPose(
  shipPosition: THREE.Vector3,
  planetCenter: THREE.Vector3,
  shipQuaternion: THREE.Quaternion,
  outPosition: THREE.Vector3,
  outQuaternion: THREE.Quaternion,
) {
  normalScratch.copy(shipPosition).sub(planetCenter)
  if (normalScratch.lengthSq() < 1e-12) normalScratch.set(0, 1, 0)
  normalScratch.normalize()

  // A sideways direction along the ground: the ship's own right, flattened onto the surface
  rightScratch.set(1, 0, 0).applyQuaternion(shipQuaternion)
  tangentScratch.copy(rightScratch).addScaledVector(normalScratch, -rightScratch.dot(normalScratch))
  if (tangentScratch.lengthSq() < 1e-6) {
    // The ship's right points straight at or away from the ground: use its forward instead
    rightScratch.set(0, 0, -1).applyQuaternion(shipQuaternion)
    tangentScratch.copy(rightScratch).addScaledVector(normalScratch, -rightScratch.dot(normalScratch))
    if (tangentScratch.lengthSq() < 1e-6) tangentScratch.set(normalScratch.y, -normalScratch.x, 0)
    if (tangentScratch.lengthSq() < 1e-6) tangentScratch.set(0, 0, 1)
  }
  tangentScratch.normalize()

  outPosition.copy(shipPosition).addScaledVector(normalScratch, LANDING_HEIGHT).addScaledVector(tangentScratch, LANDING_SIDE)
  lookMatrix.lookAt(outPosition, shipPosition, normalScratch)
  outQuaternion.setFromRotationMatrix(lookMatrix)
  return outPosition
}

/** Pushes a camera position out of a planet: never closer to its centre than radius + margin. */
export function clampAboveSurface(position: THREE.Vector3, center: THREE.Vector3, radius: number, margin = SURFACE_MARGIN) {
  const minimum = radius + margin
  const offset = normalScratch.copy(position).sub(center)
  const distance = offset.length()
  if (distance >= minimum) return false
  if (distance < 1e-9) offset.set(0, 1, 0)
  else offset.multiplyScalar(1 / distance)
  position.copy(center).addScaledVector(offset, minimum)
  return true
}
