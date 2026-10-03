import type { Triplet } from '@react-three/cannon'

/** Integer grid coordinates in ship-local space (1 unit = 1 block). */
export type GridPos = Triplet

/** `core` is the starting block; the rest can be placed by the player. */
export type BlockType = 'core' | 'hull' | 'food' | 'arcade' | 'engine' | 'shield' | 'repair'
export type PlaceableBlockType = Exclude<BlockType, 'core'>

/** Build mode edits the ship and orbits the camera; pilot mode flies it with a chase camera. */
export type GameMode = 'build' | 'pilot'

/** Pilot-mode camera: smoothed third-person follow, or a free orbit around the ship. */
export type CameraView = 'chase' | 'orbit'

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
