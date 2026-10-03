import * as THREE from 'three'
import type { Block, GridPos, PlaceableBlockType } from './types'

export type SavedPendingBlock = { pos: GridPos; type: PlaceableBlockType; total: number; progress: number }

const newCore = (): Block[] => [{ pos: [0, 0, 0], type: 'core' }]

/**
 * The ship's live motion, written by the Ship each frame and read by effects, the camera and the
 * targeting HUD, which would otherwise have to dig it out of the physics world.
 */
export const shipState = {
  velocity: new THREE.Vector3(),
  position: new THREE.Vector3(),
  quaternion: new THREE.Quaternion(),
  angularVelocity: new THREE.Vector3(),
  blocks: newCore(),
  pending: [] as SavedPendingBlock[],
  hasSavedTransform: false,
  /** 0-1: how hot the re-entry is (atmosphere depth × speed); drives particles and camera shake */
  heat: 0,
}

export function resetShipState() {
  shipState.velocity.set(0, 0, 0)
  shipState.position.set(0, 0, 0)
  shipState.quaternion.identity()
  shipState.angularVelocity.set(0, 0, 0)
  shipState.blocks = newCore()
  shipState.pending = []
  shipState.hasSavedTransform = false
  shipState.heat = 0
}
