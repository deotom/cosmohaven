import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { createAutopilotOutput, runAutopilot, type AutopilotInput } from './autopilot'
import type { CelestialBody } from './gameState'
import { buildObstacles, planPath, type Obstacle, type PlannedPath, type Vec3Like } from './pathPlanner'
import { mulberry32 } from './rng'
import { generateSector, homeSector } from './sector'
import { stationPose } from './station'

const vec = (p: Vec3Like) => ('x' in p ? p.clone() : new THREE.Vector3(...p))

const sphere = (x: number, y: number, z: number, radius: number, kind: Obstacle['kind'] = 'asteroid'): Obstacle => ({
  id: `${kind}:${x},${y},${z}`,
  name: `${kind} ${x},${y},${z}`,
  center: [x, y, z],
  radius,
  kind,
})

const pathLength = (from: THREE.Vector3, path: PlannedPath) => {
  let length = 0
  let at = from
  for (const w of path.waypoints) {
    length += at.distanceTo(w)
    at = w
  }
  return length
}

/**
 * An independent check of the planner's promise. Returns the first problem found, or null. A leg may be inside an
 * obstacle only if it starts inside it (the push-out at the start) or if it is the last leg and the obstacle holds
 * the goal (the approach to a planet, hangar or scrap).
 */
function violation(from: THREE.Vector3, goal: THREE.Vector3, path: PlannedPath, obstacles: readonly Obstacle[]): string | null {
  const points = [from, ...path.waypoints]
  if (path.waypoints.length === 0) return 'no waypoints'
  if (points[points.length - 1].distanceTo(goal) > 1e-6) return 'does not end at the goal'
  for (let k = 0; k < points.length - 1; k++) {
    const a = points[k]
    const b = points[k + 1]
    const ab = b.clone().sub(a)
    const lengthSq = ab.lengthSq()
    for (const o of obstacles) {
      const c = vec(o.center)
      const startsInside = a.distanceTo(c) < o.radius - 1e-3
      const holdsGoal = goal.distanceTo(c) < o.radius
      if (k === points.length - 2 && holdsGoal) continue
      const t = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, c.clone().sub(a).dot(ab) / lengthSq))
      const closest = a.clone().addScaledVector(ab, t).distanceTo(c)
      if (startsInside) {
        if (b.distanceTo(c) < o.radius - 1e-3) return `leg ${k} ends inside ${o.name}`
        continue
      }
      if (closest < o.radius - 1e-3) return `leg ${k} cuts ${o.name} (${closest.toFixed(2)} < ${o.radius})`
    }
  }
  return null
}

function randomField(rand: () => number, extent: number, count: number, minR: number, maxR: number): Obstacle[] {
  const field: Obstacle[] = []
  for (let i = 0; i < count; i++) {
    field.push(sphere((rand() * 2 - 1) * extent, (rand() * 2 - 1) * extent * 0.4, (rand() * 2 - 1) * extent, minR + rand() * (maxR - minR)))
  }
  return field
}

function freePoint(rand: () => number, extent: number, field: readonly Obstacle[]): THREE.Vector3 {
  for (;;) {
    const p = new THREE.Vector3((rand() * 2 - 1) * extent, (rand() * 2 - 1) * extent * 0.4, (rand() * 2 - 1) * extent)
    if (field.every((o) => p.distanceTo(vec(o.center)) > o.radius + 1)) return p
  }
}

/** A ring of overlapping spheres, 100 out from (x, y, z), that leaves no way in to the middle. */
function cage(x: number, y: number, z: number): Obstacle[] {
  const shell: Obstacle[] = []
  for (let a = -1; a <= 1; a++) {
    for (let b = -1; b <= 1; b++) {
      for (let c = -1; c <= 1; c++) {
        if (!a && !b && !c) continue
        const d = new THREE.Vector3(a, b, c).normalize().multiplyScalar(100)
        shell.push(sphere(x + d.x, y + d.y, z + d.z, 60, 'planet'))
      }
    }
  }
  return shell
}

describe('planPath', () => {
  it('goes straight when nothing is in the way', () => {
    const path = planPath([0, 0, 0], [0, 0, -500], [sphere(200, 0, -250, 50)])
    expect(path.blocked).toBe(false)
    expect(path.waypoints).toHaveLength(1)
    expect(path.waypoints[0].toArray()).toEqual([0, 0, -500])
  })

  it('goes round a sphere on the line without cutting it', () => {
    const field = [sphere(0, 0, -250, 60, 'planet')]
    const from = new THREE.Vector3()
    const goal = new THREE.Vector3(0, 0, -500)
    const path = planPath(from, goal, field)
    expect(path.blocked).toBe(false)
    expect(path.waypoints.length).toBeGreaterThan(1)
    expect(path.around).toContain(field[0].name)
    expect(violation(from, goal, path, field)).toBeNull()
    expect(pathLength(from, path)).toBeLessThan(500 * 1.5)
  })

  it('is deterministic', () => {
    const rand = mulberry32(5)
    const field = randomField(rand, 500, 20, 10, 60)
    const from = freePoint(rand, 500, field)
    const goal = freePoint(rand, 500, field)
    const a = planPath(from, goal, field)
    const b = planPath(from.clone(), goal.clone(), field)
    expect(b.blocked).toBe(a.blocked)
    expect(b.waypoints.map((w) => w.toArray())).toEqual(a.waypoints.map((w) => w.toArray()))
    expect(b.around).toEqual(a.around)
  })

  it('pushes a ship that starts inside an obstacle out through its surface first', () => {
    const field = [sphere(0, 0, 0, 85, 'station')]
    const from = new THREE.Vector3(0, 0, 30)
    const goal = new THREE.Vector3(0, 0, -400)
    const path = planPath(from, goal, field)
    expect(path.blocked).toBe(false)
    expect(path.waypoints[0].distanceTo(new THREE.Vector3())).toBeGreaterThan(85)
    expect(path.waypoints[0].z).toBeGreaterThan(0) // straight out from the centre, not through the station
    expect(violation(from, goal, path, field)).toBeNull()
  })

  it('does not count the obstacle that holds the goal, and approaches it along a straight final leg', () => {
    const planet = sphere(0, 0, -500, 150, 'planet')
    const blocker = sphere(0, 0, -200, 40)
    const from = new THREE.Vector3()
    const goal = new THREE.Vector3(0, 0, -500) // the planet's centre
    const path = planPath(from, goal, [planet, blocker])
    expect(path.blocked).toBe(false)
    expect(violation(from, goal, path, [planet, blocker])).toBeNull()
    const gate = path.waypoints[path.waypoints.length - 2]
    expect(gate.distanceTo(new THREE.Vector3(0, 0, -500))).toBeGreaterThanOrEqual(150)
  })

  it('goes straight in when the ship is already inside the destination', () => {
    const planet = sphere(0, 0, -500, 150, 'planet')
    const path = planPath([0, 0, -400], [0, 0, -500], [planet])
    expect(path.blocked).toBe(false)
    expect(path.waypoints).toHaveLength(1)
  })

  it('approaches a hangar entrance from the side the hangar faces', () => {
    const station = { id: 0, name: 'Test Drydock', position: [300, 0, -300] as [number, number, number], yaw: 0 }
    const entrance = stationPose(station).entrance
    const obstacle = sphere(300, 0, -300, 85, 'station')
    const path = planPath([0, 0, 0], entrance, [obstacle])
    expect(path.blocked).toBe(false)
    const gate = path.waypoints[path.waypoints.length - 2]
    const outward = stationPose(station).outward
    expect(gate.clone().sub(new THREE.Vector3(...station.position)).normalize().dot(outward)).toBeGreaterThan(Math.cos((50 * Math.PI) / 180) - 1e-6)
  })

  it('reports a boxed-in goal as blocked with a reason instead of looping', () => {
    const path = planPath([0, 0, 600], [0, 0, 0], cage(0, 0, 0))
    expect(path.blocked).toBe(true)
    expect(path.waypoints).toEqual([])
    expect(path.reason).toBeTruthy()
  })

  it('stops at the iteration limit', () => {
    const rand = mulberry32(11)
    const field = randomField(rand, 400, 30, 20, 60)
    const from = freePoint(rand, 400, field)
    const goal = freePoint(rand, 400, field)
    const path = planPath(from, goal, field, { maxIterations: 0 })
    if (path.blocked) expect(path.reason).toBeTruthy()
    else expect(violation(from, goal, path, field)).toBeNull()
  })

  describe('random obstacle fields (fuzz)', () => {
    const CASES = 3000
    const EXTENT = 600

    it('reaches the goal in at least 99% of 3,000 fields, never cutting an obstacle, and explains the rest', () => {
      const rand = mulberry32(2024)
      let reached = 0
      const failures: string[] = []
      for (let i = 0; i < CASES; i++) {
        const field = randomField(rand, EXTENT, 3 + Math.floor(rand() * 23), 8, 70)
        const from = freePoint(rand, EXTENT, field)
        const goal = freePoint(rand, EXTENT, field)
        const path = planPath(from, goal, field)
        if (path.blocked) {
          expect(path.reason).toBeTruthy()
          expect(path.waypoints).toEqual([])
          continue
        }
        reached++
        const problem = violation(from, goal, path, field)
        if (problem) failures.push(`case ${i}: ${problem}`)
      }
      expect(failures).toEqual([])
      expect(reached / CASES).toBeGreaterThanOrEqual(0.99)
    })

    it('keeps the detour within 1.5x of the straight line in typical fields', () => {
      // Typical: 2-12 obstacles of radius 8-120 in a 1200-wide box, start and goal at least 400 apart.
      // We look at fields where the straight line really is blocked, since the others are trivially 1.0x
      const rand = mulberry32(77)
      const ratios: number[] = []
      for (let i = 0; i < CASES * 20 && ratios.length < 600; i++) {
        const field = randomField(rand, EXTENT, 2 + Math.floor(rand() * 11), 8, 120)
        const from = freePoint(rand, EXTENT, field)
        const goal = freePoint(rand, EXTENT, field)
        const straight = from.distanceTo(goal)
        if (straight < 400) continue
        const path = planPath(from, goal, field)
        if (path.blocked || !path.around.some(Boolean)) continue
        ratios.push(pathLength(from, path) / straight)
      }
      ratios.sort((x, y) => x - y)
      expect(ratios.length).toBeGreaterThan(300)
      const p95 = ratios[Math.floor(ratios.length * 0.95)]
      const mean = ratios.reduce((s, r) => s + r, 0) / ratios.length
      expect(mean).toBeLessThanOrEqual(1.5)
      expect(p95).toBeLessThanOrEqual(1.5)
    })
  })

  describe('generated sectors', () => {
    it('routes from the arrival point to every planet and station in 3,000 sectors', () => {
      const origin = new THREE.Vector3()
      const failures: string[] = []
      let routes = 0
      let detoured = 0
      for (let seed = 0; seed < 3000; seed++) {
        const sector = generateSector(seed, 1 + (seed % 50))
        const obstacles = buildObstacles(sector, sector.planets)
        const goals = [
          ...sector.planets.map((p) => ({ label: p.name, point: new THREE.Vector3(...p.position) })),
          ...sector.stations.map((s) => ({ label: s.name, point: stationPose(s).entrance })),
        ]
        for (const goal of goals) {
          routes++
          const path = planPath(origin, goal.point, obstacles)
          if (path.blocked) {
            failures.push(`seed ${seed} → ${goal.label}: blocked (${path.reason})`)
            continue
          }
          if (path.around.some(Boolean)) detoured++
          const problem = violation(origin, goal.point, path, obstacles)
          if (problem) failures.push(`seed ${seed} → ${goal.label}: ${problem}`)
        }
      }
      expect(failures).toEqual([])
      expect(routes).toBeGreaterThan(3000)
      expect(detoured).toBeGreaterThan(0)
    })

    it('also routes out of the home station to the practice planet', () => {
      const sector = homeSector()
      const obstacles = buildObstacles(sector, sector.planets)
      const goal = new THREE.Vector3(...sector.planets[0].position)
      const from = new THREE.Vector3(0, 0, 40)
      const path = planPath(from, goal, obstacles)
      expect(path.blocked).toBe(false)
      expect(violation(from, goal, path, obstacles)).toBeNull()
    })
  })
})

describe('buildObstacles', () => {
  it('turns planets, stations and rocks into padded spheres and merges close rocks', () => {
    const sector = homeSector()
    const obstacles = buildObstacles(sector, sector.planets)
    const planet = obstacles.find((o) => o.kind === 'planet' || o.kind === 'well')
    expect(planet?.radius).toBeGreaterThan(sector.planets[0].radius + sector.planets[0].atmosphereHeight)
    expect(obstacles.some((o) => o.kind === 'station')).toBe(true)
    expect(obstacles.filter((o) => o.kind === 'asteroid').length).toBeLessThanOrEqual(sector.asteroids.length)

    const merged = buildObstacles({ ...sector, asteroids: [{ position: [100, 0, 0], radius: 1, spin: [0, 0, 0] }, { position: [115, 0, 0], radius: 1, spin: [0, 0, 0] }, { position: [900, 0, 0], radius: 1, spin: [0, 0, 0] }] }, [])
    const rocks = merged.filter((o) => o.kind === 'asteroid')
    expect(rocks).toHaveLength(2)
    expect(Math.max(...rocks.map((r) => r.radius))).toBeGreaterThan(11)
  })
})

describe('auto-pilot with obstacles', () => {
  const body: CelestialBody = { name: 'Far', position: [0, 0, -1500], radius: 50, gm: 1000, wellRadius: 200, atmosphereHeight: 10 }
  const input = (overrides: Partial<AutopilotInput> = {}): AutopilotInput => ({
    tier: 1,
    task: 'nav',
    destination: body,
    target: null,
    engaged: true,
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(), // nose along -Z, straight at the planet
    angularVelocity: new THREE.Vector3(),
    gravity: new THREE.Vector3(),
    dt: 1 / 60,
    mainAccel: 8,
    harvestRange: 10,
    scanRange: 150,
    hull: 100,
    ...overrides,
  })

  it('flies straight at the planet when nothing is in the way', () => {
    const out = runAutopilot(input({ obstacles: [sphere(400, 0, -700, 40)] }), createAutopilotOutput())
    expect(out.status).not.toContain('Detouring')
    expect(out.angularAccel.length()).toBeLessThan(1e-6)
  })

  it('turns away from the straight line when a rock blocks it, at every tier', () => {
    for (const tier of [1, 2, 3]) {
      const out = runAutopilot(input({ tier, obstacles: [sphere(0, 0, -700, 40)] }), createAutopilotOutput())
      expect(out.status).toContain('Detouring around')
      expect(out.angularAccel.length()).toBeGreaterThan(0.1)
    }
  })

  it('stands still and says why when the route is blocked', () => {
    const out = runAutopilot(input({ obstacles: cage(0, 0, -1500), velocity: new THREE.Vector3(0, 0, -10) }), createAutopilotOutput())
    expect(out.status).toContain('Path blocked')
    expect(out.throttle).toBe(0)
    expect(out.maneuverAccel.z).toBeGreaterThan(0) // braking against the motion
  })
})