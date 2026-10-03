import { gridKey, type Block, type GridPos } from './types'

const DIRS: readonly GridPos[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
]

/** Number of blocks reachable from the core through face-to-face neighbours, ignoring `without`. */
function connectedCount(blocks: readonly Block[], without?: GridPos) {
  const cells = new Set(blocks.filter((b) => !without || gridKey(b.pos) !== gridKey(without)).map((b) => gridKey(b.pos)))
  const core = blocks.find((b) => b.type === 'core')
  if (!core || !cells.has(gridKey(core.pos))) return 0
  const seen = new Set([gridKey(core.pos)])
  const queue: GridPos[] = [core.pos]
  for (let i = 0; i < queue.length; i++) {
    for (const d of DIRS) {
      const next: GridPos = [queue[i][0] + d[0], queue[i][1] + d[1], queue[i][2] + d[2]]
      const key = gridKey(next)
      if (cells.has(key) && !seen.has(key)) {
        seen.add(key)
        queue.push(next)
      }
    }
  }
  return seen.size
}

/** A block can be removed if it isn't the core and the rest of the ship stays in one piece. */
export function canRemove(blocks: readonly Block[], block: Block) {
  if (block.type === 'core') return false
  return connectedCount(blocks, block.pos) === blocks.length - 1
}

/** A random removable block (e.g. one torn off by a crash), or null if only the core is left. */
export function pickRemovable(blocks: readonly Block[]): Block | null {
  const options = blocks.filter((b) => canRemove(blocks, b))
  return options.length ? options[Math.floor(Math.random() * options.length)] : null
}
