import type { Triplet } from '@react-three/cannon'

/** Integer grid coordinates in ship-local space (1 unit = 1 block). */
export type GridPos = Triplet

/** `core` is the starting block; the rest can be placed by the player. */
export type BlockType = 'core' | 'hull' | 'food' | 'arcade' | 'engine' | 'shield' | 'repair'
export type PlaceableBlockType = Exclude<BlockType, 'core'>

/** Build mode edits the ship and orbits the camera; pilot mode flies it with a chase camera. */
export type GameMode = 'build' | 'pilot'

/**
 * Pilot-mode camera: `chase` eases after the ship's heading and roll, `locked` is rigidly fixed to the ship (it
 * rolls and flips exactly with it), `orbit` is a free orbit around the ship.
 */
export type CameraView = 'chase' | 'locked' | 'orbit'

/** Whether the camera is attached to the ship (chase or locked) rather than free to orbit. */
export const isFollowView = (view: CameraView) => view !== 'orbit'

const CAMERA_VIEW_ORDER: readonly CameraView[] = ['chase', 'locked', 'orbit']
export const nextCameraView = (view: CameraView): CameraView => CAMERA_VIEW_ORDER[(CAMERA_VIEW_ORDER.indexOf(view) + 1) % CAMERA_VIEW_ORDER.length]
export const CAMERA_VIEW_LABELS: Record<CameraView, string> = { chase: 'CHASE', locked: 'SHIP-LOCKED', orbit: 'ORBIT' }

export type Block = { pos: GridPos; type: BlockType }

export type CrewStats = {
  /** 0-100, lower is worse */
  hunger: number
  /** 0-100, lower is worse */
  sanity: number
  /** Human-readable current action for the HUD */
  action: string
  /** In sunlight or lamplight right now (Florans regrow while this is true) */
  lit: boolean
}

export const gridKey = (p: GridPos) => p.join(',')

/**
 * Live crew stats, mutated every frame by the simulation and sampled by the HUD.
 * Kept outside React state so it doesn't trigger 60 re-renders per second.
 */
export const crewStats: CrewStats = { hunger: 100, sanity: 100, action: 'Idle', lit: false }

/** Live hazard info for the HUD, written by the EventManager. */
export const hazardStats = { meteors: 0 }
