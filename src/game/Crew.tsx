import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { Character, type CharacterPose } from './Character'
import { currentRole, currentSpecies } from './crewProfile'
import { exposureOf } from './exposure'
import { CELESTIAL_BODIES, gameStats, repairHull } from './gameState'
import { getDock } from './dock'
import { sunDirection } from './sunState'
import { shipPositionRef } from './targetScreen'
import { buildNavGrid, findNearestPath, findPath, reachableCells } from './Pathfinding'
import { REPAIR_BAY_RATE, repairBayNeeded } from './shipModules'
import { crewStats, gridKey, type Block, type BlockType, type GridPos } from './types'

/** Height of the cell floor relative to the cell centre; the astronaut's feet rest here */
const STAND_Y = -0.45
/** How far towards the room (+Z) the astronaut steps when using the props on the back wall */
const USE_STEP = 0.14

const FLORAN_HUNGER_REGEN = 0.5 // points per second in the light
const FLORAN_SANITY_REGEN = 0.8

const WALK_SPEED = 1.6 // blocks per second
const HUNGER_DECAY = 1.5 // points per second
const SANITY_DECAY = 0.5
const LOW_BELOW = 40 // go looking for a fix under this
const FULL_AT = 100 // stop restoring at this
const RESTORE_RATE = 15

/** Each need is a stat that drains over time and is restored by standing on a particular block. */
type Need = 'food' | 'arcade' | 'repair'

const NEEDS: Record<
  Need,
  { block: BlockType; using: string; seeking: string; missing: string }
> = {
  food: {
    block: 'food',
    using: 'Eating',
    seeking: 'Heading to Food Dispenser',
    missing: 'Hungry - no Food Dispenser!',
  },
  arcade: {
    block: 'arcade',
    using: 'Playing Arcade',
    seeking: 'Heading to Arcade',
    missing: 'Sanity low - no Arcade!',
  },
  repair: {
    block: 'repair',
    using: 'Repairing Hull',
    seeking: 'Heading to Repair Bay',
    missing: 'Hull low - no Repair Bay!',
  },
}
const NEED_KEYS = Object.keys(NEEDS) as Need[]

type Mode = 'wandering' | 'seeking' | 'using' | 'resting'

type Brain = {
  mode: Mode
  /** The need being sought or satisfied, when mode is `seeking` or `using` */
  need: Need
  cell: GridPos
  next: GridPos | null
  /** 0-1 progress from `cell` towards `next` */
  progress: number
  /** Remaining cells to visit, excluding `next` */
  path: GridPos[]
  restTimer: number
  /** Block types currently on the ship */
  present: ReadonlySet<BlockType>
}

const sunRay = new THREE.Vector3()
const toBody = new THREE.Vector3()

/** Is the ship's sun blocked by a planet? A ray from the ship towards the sun, against each planet's sphere. */
function sunBlocked() {
  sunRay.copy(sunDirection)
  for (const body of CELESTIAL_BODIES) {
    toBody.set(...body.position).sub(shipPositionRef.current)
    const along = toBody.dot(sunRay)
    if (along > 0 && toBody.addScaledVector(sunRay, -along).length() < body.radius) return true
  }
  return false
}

/**
 * Is the crew member standing in light? Always in a hangar (its lamps are on), beside a reactor core or an arcade
 * cabinet (both glow), or next to a window while the sun isn't hidden behind a planet.
 */
function isLit(cell: GridPos, grid: ReadonlyMap<string, BlockType>) {
  if (getDock().phase === 'docked') return true
  const type = grid.get(gridKey(cell))
  if (type === 'core' || type === 'arcade') return true
  const exposure = exposureOf(cell, (x, y, z) => grid.has(gridKey([x, y, z])))
  return (exposure.px || exposure.nx || exposure.pz || exposure.nz || exposure.py) && !sunBlocked()
}

type CrewProps = {
  blocks: readonly Block[]
  /** Written every frame with the crew member's torso in world space, for the interior camera */
  worldOut: RefObject<THREE.Vector3>
}

/**
 * A crew member who walks between ship blocks. Rendered as a child of the ship
 * group, so it moves with the ship and uses ship-local grid coordinates.
 */
export function Crew({ blocks, worldOut }: CrewProps) {
  const ref = useRef<THREE.Group>(null)
  const bodyRef = useRef<THREE.Group>(null)
  const pose = useRef<CharacterPose>({ walk: 0, activity: 'none' })
  const heading = useRef({ yaw: 0, step: 0 })
  const torso = useMemo(() => new THREE.Vector3(), [])
  const nav = useMemo(() => buildNavGrid(blocks), [blocks])

  const navRef = useRef(nav)
  const brain = useRef<Brain>({
    mode: 'resting',
    need: 'food',
    cell: [0, 0, 0],
    next: null,
    progress: 0,
    path: [],
    restTimer: 1,
    present: new Set(),
  })

  // Pick up newly placed blocks; the crew re-plans at the next cell it reaches
  useEffect(() => {
    navRef.current = nav
    brain.current.present = new Set(nav.values())

    // A block can be dismantled at the shipyard: don't leave the crew member standing in thin air
    const b = brain.current
    const lost = !nav.has(gridKey(b.cell)) || (b.next !== null && !nav.has(gridKey(b.next))) || b.path.some((c) => !nav.has(gridKey(c)))
    if (lost) {
      b.cell = [0, 0, 0]
      b.next = null
      b.progress = 0
      b.path = []
      b.mode = 'resting'
      b.restTimer = 0.5
    }
  }, [nav])

  useFrame((_, rawDelta) => {
    if (gameStats.victory) return
    const dt = Math.min(rawDelta, 0.1)
    const b = brain.current
    const s = crewStats
    const grid = navRef.current

    // Each species has its own appetite: Synth-Bots never get hungry, Humans cope a little better, and so on
    const species = currentSpecies()
    s.hunger = species.hungerImmune ? 0 : Math.max(0, s.hunger - HUNGER_DECAY * species.hungerDecay * dt)
    s.sanity = Math.max(0, s.sanity - SANITY_DECAY * species.sanityDecay * dt)

    // Lumi-Jellies mend the hull just by being aboard
    if (species.shipRepair > 0) repairHull(species.shipRepair * dt)

    // Florans photosynthesise: sunlight through a window, or the glow of the reactor or an arcade, regrows them
    s.lit = species.photosynthesis && isLit(b.cell, grid)
    if (s.lit) {
      s.hunger = Math.min(100, s.hunger + FLORAN_HUNGER_REGEN * dt)
      s.sanity = Math.min(100, s.sanity + FLORAN_SANITY_REGEN * dt)
    }

    const rest = (seconds: number) => {
      b.mode = 'resting'
      b.restTimer = seconds
      b.path = []
    }

    const needValue = (need: Need) => {
      if (need === 'repair') return gameStats.hull
      return need === 'food' ? s.hunger : s.sanity
    }
    const lowNeeds = () =>
      NEED_KEYS.filter(
        (need) =>
          !(need === 'food' && species.hungerImmune) &&
          (need === 'repair' ? repairBayNeeded(gameStats.hull) : needValue(need) < LOW_BELOW),
      ).sort((x, y) => needValue(x) - needValue(y))

    /** Called whenever the crew member is standing on a cell and needs to choose what to do. */
    const decide = () => {
      // Most urgent need first; fall through to the next if its block doesn't exist
      for (const need of lowNeeds()) {
        if (grid.get(gridKey(b.cell)) === NEEDS[need].block) {
          b.mode = 'using'
          b.need = need
          b.path = []
          return
        }
        const route = findNearestPath(grid, b.cell, (t) => t === NEEDS[need].block)
        if (route) {
          b.mode = 'seeking'
          b.need = need
          b.path = route
          return
        }
      }

      // Keep walking an existing wander route
      if (b.mode === 'wandering') {
        if (b.path.length > 0) return
        rest(1 + Math.random() * 2) // arrived at the wander target
        return
      }

      const options = reachableCells(grid, b.cell).filter((c) => gridKey(c) !== gridKey(b.cell))
      const goal = options[Math.floor(Math.random() * options.length)]
      const route = goal && findPath(grid, b.cell, goal)
      if (route && route.length > 0) {
        b.mode = 'wandering'
        b.path = route
      } else {
        rest(2)
      }
    }

    let arrived = false
    if (b.next) {
      b.progress += WALK_SPEED * species.walkSpeed * dt
      if (b.progress >= 1) {
        b.cell = b.next
        b.next = null
        b.progress = 0
        arrived = true
      }
    }

    if (!b.next) {
      if (b.mode === 'using') {
        if (b.need === 'repair') {
          if (!b.present.has('repair')) rest(0.5)
          else {
            repairHull(REPAIR_BAY_RATE * dt)
            if (gameStats.hull >= 100) rest(1.5)
          }
        } else {
          const stat: 'hunger' | 'sanity' = b.need === 'food' ? 'hunger' : 'sanity'
          // A Chef gets more out of every meal
          const rate = RESTORE_RATE * (b.need === 'food' ? currentRole().foodRestore : 1)
          s[stat] = Math.min(FULL_AT, s[stat] + rate * dt)
          if (s[stat] >= FULL_AT) rest(1.5)
        }
      } else if (b.mode === 'resting') {
        b.restTimer -= dt
        if (b.restTimer <= 0) decide()
      } else if (arrived || b.path.length === 0) {
        decide()
      }

      if ((b.mode === 'wandering' || b.mode === 'seeking') && b.path.length > 0) {
        b.next = b.path.shift()!
        b.progress = 0
      }
    }

    const from = b.cell
    const to = b.next ?? b.cell
    ref.current?.position.set(
      from[0] + (to[0] - from[0]) * b.progress,
      from[1] + (to[1] - from[1]) * b.progress,
      from[2] + (to[2] - from[2]) * b.progress,
    )

    // The astronaut faces where it's walking (or the props on the back wall when using them), stands
    // on the floor, and animates to match what it's doing
    const body = bodyRef.current
    if (body) {
      let targetYaw = heading.current.yaw
      if (b.next) {
        const dx = b.next[0] - b.cell[0]
        const dz = b.next[2] - b.cell[2]
        if (dx !== 0 || dz !== 0) targetYaw = Math.atan2(dx, dz)
      } else if (b.mode === 'using') {
        targetYaw = Math.PI
      }
      const turn = Math.atan2(Math.sin(targetYaw - heading.current.yaw), Math.cos(targetYaw - heading.current.yaw))
      heading.current.yaw += turn * Math.min(1, dt * 9)
      heading.current.step += ((b.mode === 'using' && !b.next ? USE_STEP : 0) - heading.current.step) * Math.min(1, dt * 6)
      body.rotation.y = heading.current.yaw
      body.position.set(0, STAND_Y, heading.current.step)

      pose.current.walk += ((b.next ? 1 : 0) - pose.current.walk) * Math.min(1, dt * 8)
      pose.current.activity =
        b.mode === 'using' && !b.next
          ? b.need === 'food'
            ? 'eat'
            : b.need === 'arcade'
              ? 'play'
              : 'repair'
          : 'none'

      body.updateWorldMatrix(true, false)
      worldOut.current.copy(body.localToWorld(torso.set(0, 0.4, 0)))
    }

    if (b.mode === 'using') s.action = NEEDS[b.need].using
    else if (b.mode === 'seeking') s.action = NEEDS[b.need].seeking
    else {
      // Fallback: something is urgently needed but the ship has no block for it
      const unmet = lowNeeds().find((n) => !b.present.has(NEEDS[n].block))
      s.action = unmet ? NEEDS[unmet].missing : b.mode === 'wandering' ? 'Wandering' : 'Idle'
    }
  })

  return (
    <group ref={ref}>
      <group ref={bodyRef} position={[0, STAND_Y, 0]}>
        <Character pose={pose} />
      </group>
    </group>
  )
}
