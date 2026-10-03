import * as THREE from 'three'

/**
 * The ship's live motion, written by the Ship each frame and read by effects, the camera and the
 * targeting HUD, which would otherwise have to dig it out of the physics world.
 */
export const shipState = {
  velocity: new THREE.Vector3(),
  /** 0-1: how hot the re-entry is (atmosphere depth × speed); drives particles and camera shake */
  heat: 0,
}
