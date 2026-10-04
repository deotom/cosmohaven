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
