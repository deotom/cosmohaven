import type { GridPos } from './types'

/** Which of a block's six faces have no neighbouring block, i.e. face open space. */
export type Exposure = { px: boolean; nx: boolean; py: boolean; ny: boolean; pz: boolean; nz: boolean }

export function exposureOf(pos: GridPos, isOccupied: (x: number, y: number, z: number) => boolean): Exposure {
  const [x, y, z] = pos
  return {
    px: !isOccupied(x + 1, y, z),
    nx: !isOccupied(x - 1, y, z),
    py: !isOccupied(x, y + 1, z),
    ny: !isOccupied(x, y - 1, z),
    pz: !isOccupied(x, y, z + 1),
    nz: !isOccupied(x, y, z - 1),
  }
}
