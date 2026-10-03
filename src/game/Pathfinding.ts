import { gridKey, type Block, type BlockType, type GridPos } from './types'

/**
 * The ship's walkable graph: every block is a walkable cell, connected to its
 * 6 face-neighbours (there's no gravity, so crew can move along any axis).
 * Rebuild it whenever the block list changes.
 */
export type NavGrid = Map<string, BlockType>

const DIRS: readonly GridPos[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
]

export function buildNavGrid(blocks: readonly Block[]): NavGrid {
  return new Map(blocks.map((b) => [gridKey(b.pos), b.type]))
}

const neighbors = (nav: NavGrid, p: GridPos): GridPos[] =>
  DIRS.map((d): GridPos => [p[0] + d[0], p[1] + d[1], p[2] + d[2]]).filter((n) => nav.has(gridKey(n)))

const manhattan = (a: GridPos, b: GridPos) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])

/** Walks the parent links back from `goalKey`; the result excludes the start cell. */
function buildPath(parents: Map<string, GridPos | null>, cells: Map<string, GridPos>, goalKey: string): GridPos[] {
  const path: GridPos[] = []
  let key: string | undefined = goalKey
  while (key) {
    const parent: GridPos | null | undefined = parents.get(key)
    if (!parent) break // reached the start
    path.push(cells.get(key)!)
    key = gridKey(parent)
  }
  return path.reverse()
}

/** A* shortest path from `start` to `goal` (excluding `start`), or null if unreachable. */
export function findPath(nav: NavGrid, start: GridPos, goal: GridPos): GridPos[] | null {
  const startKey = gridKey(start)
  const goalKey = gridKey(goal)
  if (!nav.has(startKey) || !nav.has(goalKey)) return null
  if (startKey === goalKey) return []

  const cells = new Map<string, GridPos>([[startKey, start]])
  const parents = new Map<string, GridPos | null>([[startKey, null]])
  const g = new Map<string, number>([[startKey, 0]])
  const open = new Map<string, number>([[startKey, manhattan(start, goal)]]) // key -> f score
  const closed = new Set<string>()

  while (open.size > 0) {
    // Ships are small, so a linear scan beats the bookkeeping of a heap
    let currentKey = ''
    let best = Infinity
    for (const [k, f] of open) {
      if (f < best) {
        best = f
        currentKey = k
      }
    }
    if (currentKey === goalKey) return buildPath(parents, cells, goalKey)

    open.delete(currentKey)
    closed.add(currentKey)
    const current = cells.get(currentKey)!
    const gCurrent = g.get(currentKey)!

    for (const n of neighbors(nav, current)) {
      const nKey = gridKey(n)
      if (closed.has(nKey)) continue
      const tentative = gCurrent + 1
      if (tentative >= (g.get(nKey) ?? Infinity)) continue
      cells.set(nKey, n)
      parents.set(nKey, current)
      g.set(nKey, tentative)
      open.set(nKey, tentative + manhattan(n, goal))
    }
  }
  return null
}

/** Breadth-first search; every cell reachable from `start`, including `start`. */
export function reachableCells(nav: NavGrid, start: GridPos): GridPos[] {
  if (!nav.has(gridKey(start))) return []
  const seen = new Set([gridKey(start)])
  const result: GridPos[] = [start]
  for (let i = 0; i < result.length; i++) {
    for (const n of neighbors(nav, result[i])) {
      const k = gridKey(n)
      if (seen.has(k)) continue
      seen.add(k)
      result.push(n)
    }
  }
  return result
}

/** Shortest path (excluding `start`) to the closest cell whose block type matches, or null. */
export function findNearestPath(nav: NavGrid, start: GridPos, matches: (type: BlockType) => boolean): GridPos[] | null {
  const startKey = gridKey(start)
  if (!nav.has(startKey)) return null

  const cells = new Map<string, GridPos>([[startKey, start]])
  const parents = new Map<string, GridPos | null>([[startKey, null]])
  const queue: GridPos[] = [start]

  for (let i = 0; i < queue.length; i++) {
    const current = queue[i]
    const currentKey = gridKey(current)
    if (matches(nav.get(currentKey)!)) return buildPath(parents, cells, currentKey)

    for (const n of neighbors(nav, current)) {
      const nKey = gridKey(n)
      if (parents.has(nKey)) continue
      cells.set(nKey, n)
      parents.set(nKey, current)
      queue.push(n)
    }
  }
  return null
}
