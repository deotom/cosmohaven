import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAutopilotOutput, runAutopilot, type AutopilotInput } from './autopilot'
import { stationPose, type StationSpec } from './station'
import { buildNavGrid, findNearestPath, findPath, reachableCells } from './Pathfinding'
import { createGravitySample, sampleGravity } from './gravity'
import { CELESTIAL_BODIES, gameStats, meteorTracks, requestArrival, trySpendScrap, type CelestialBody } from './gameState'
import { generateSector } from './sector'
import { mulberry32 } from './rng'
import { upgrade } from './upgrades'
import type { Block } from './types'
import { controlHints, flightKeyCodes } from '../input/keymap'

const makeBody = (position: [number, number, number] = [0, 0, -1000]): CelestialBody => ({
  name: 'Test World',
  position,
  radius: 100,
  gm: 10_000,
  wellRadius: 400,
  atmosphereHeight: 20,
})

beforeEach(() => {
  CELESTIAL_BODIES.length = 0
  meteorTracks.clear()
  gameStats.scrap = 100
  gameStats.hull = 100
  gameStats.harvesterTier = 1
  gameStats.autopilotTier = 1
  gameStats.arrival.phase = 'none'
  gameStats.arrival.body = -1
  gameStats.arrival.orbitRadius = 0
  gameStats.arrival.lever = 0
  gameStats.autopilot.engaged = false
  gameStats.autopilot.task = 'nav'
  gameStats.autopilot.destination = 0
})

afterEach(() => {
  CELESTIAL_BODIES.length = 0
  meteorTracks.clear()
})

describe('seeded generation', () => {
  it('returns the same random sequence for the same seed', () => {
    const first = mulberry32(12345)
    const second = mulberry32(12345)
    expect(Array.from({ length: 12 }, first)).toEqual(Array.from({ length: 12 }, second))
  })

  it('generates an identical sector from the same seed and id', () => {
    expect(generateSector(9876, 4)).toEqual(generateSector(9876, 4))
    expect(generateSector(9876, 4)).not.toEqual(generateSector(9877, 4))
  })
})

describe('gravity sampling', () => {
  it('points toward the body and reports the dominant well and atmosphere', () => {
    const body = { ...makeBody([0, 0, 0]), radius: 10, gm: 1000, wellRadius: 100 }
    CELESTIAL_BODIES.push(body)
    const result = sampleGravity(new THREE.Vector3(20, 0, 0), createGravitySample())

    expect(result.dominant?.body).toBe(body)
    expect(result.accel.x).toBeCloseTo(-2.5)
    expect(result.accel.y).toBe(0)
    expect(result.freedom).toBe(1)
    expect(result.atmosphere).toBeCloseTo(0.5)
  })

  it('returns no gravity outside every well', () => {
    CELESTIAL_BODIES.push(makeBody([0, 0, 0]))
    const result = sampleGravity(new THREE.Vector3(500, 0, 0), createGravitySample())

    expect(result.accel.length()).toBe(0)
    expect(result.dominant).toBeNull()
  })
})

describe('ship pathfinding', () => {
  const blocks: Block[] = [
    { pos: [0, 0, 0], type: 'core' },
    { pos: [1, 0, 0], type: 'hull' },
    { pos: [1, 1, 0], type: 'food' },
    { pos: [5, 5, 0], type: 'arcade' },
  ]

  it('finds a shortest face-connected path and handles absent endpoints', () => {
    const grid = buildNavGrid(blocks)
    expect(findPath(grid, [0, 0, 0], [1, 1, 0])).toEqual([
      [1, 0, 0],
      [1, 1, 0],
    ])
    expect(findPath(grid, [0, 0, 0], [5, 5, 0])).toBeNull()
    expect(findPath(grid, [0, 0, 0], [0, 0, 0])).toEqual([])
  })

  it('lists reachable cells and finds the nearest block matching a type', () => {
    const grid = buildNavGrid(blocks)
    expect(reachableCells(grid, [0, 0, 0])).toHaveLength(3)
    expect(findNearestPath(grid, [0, 0, 0], (type) => type === 'food')).toEqual([
      [1, 0, 0],
      [1, 1, 0],
    ])
    expect(findNearestPath(grid, [0, 0, 0], (type) => type === 'arcade')).toBeNull()
  })
})

describe('docking geometry', () => {
  const station: StationSpec = { id: 0, name: 'Test Drydock', position: [4, 2, -3], yaw: 0 }

  it('places the bay and outward vector in station-local orientation', () => {
    const pose = stationPose(station)
    expect(pose.slot.toArray()).toEqual([4, -1.5, -16])
    expect(pose.entrance.toArray()).toEqual([4, -1.5, 5])
    expect(pose.outward.toArray()).toEqual([0, 0, 1])
  })

  it('rotates the docking pose with the station yaw', () => {
    const pose = stationPose({ ...station, yaw: Math.PI / 2 })
    expect(pose.outward.x).toBeCloseTo(1)
    expect(pose.outward.y).toBeCloseTo(0)
    expect(pose.outward.z).toBeCloseTo(0)
  })
})

describe('game state and upgrades', () => {
  it('spends only available Scrap', () => {
    gameStats.scrap = 30
    expect(trySpendScrap(20)).toBe(true)
    expect(gameStats.scrap).toBe(10)
    expect(trySpendScrap(20)).toBe(false)
    expect(gameStats.scrap).toBe(10)
  })

  it('moves arrival through valid choices and leaves invalid choices unchanged', () => {
    gameStats.arrival.phase = 'choice'
    requestArrival('land')
    expect(gameStats.arrival.phase).toBe('deorbit')
    requestArrival('orbit')
    expect(gameStats.arrival.phase).toBe('insertion')

    gameStats.arrival.phase = 'none'
    requestArrival('land')
    expect(gameStats.arrival.phase).toBe('none')
    expect(gameStats.notice?.kind).toBe('warning')
  })

  it('upgrades only when the next tier is affordable', () => {
    gameStats.scrap = 80
    upgrade('harvester')
    expect(gameStats.harvesterTier).toBe(2)
    expect(gameStats.scrap).toBe(0)

    upgrade('harvester')
    expect(gameStats.harvesterTier).toBe(2)
    expect(gameStats.scrap).toBe(0)
  })
})

describe('auto-pilot controller', () => {
  function input(overrides: Partial<AutopilotInput> = {}): AutopilotInput {
    return {
      tier: 2,
      task: 'nav',
      destination: makeBody(),
      target: null,
      engaged: true,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      angularVelocity: new THREE.Vector3(),
      gravity: new THREE.Vector3(),
      dt: 1 / 60,
      mainAccel: 8,
      harvestRange: 10,
      scanRange: 150,
      hull: 100,
      ...overrides,
    }
  }

  it('applies a lateral correction for a predicted meteor collision', () => {
    const body = makeBody()
    meteorTracks.set(1, { position: [20, 0, 0], velocity: [-5, 0, 0] })
    const out = runAutopilot(input({ destination: body }), createAutopilotOutput())

    expect(out.status).toBe('Evading meteor')
    expect(out.maneuverAccel.length()).toBeGreaterThan(0)
  })

  describe('shared keyboard controls', () => {
    it('uses the same binding table for the HUD and flight key capture', () => {
      expect(controlHints('pilot')).toContain('Shift+P — Cycle Auto-Pilot task')
      expect(controlHints('pilot')).toContain('↑ — Pitch nose down')
      expect(controlHints('build')).toContain('1 — Select Hull')
      expect(controlHints('build')).not.toContain('F — Hold to harvest Scrap')
      expect(flightKeyCodes().has('KeyW')).toBe(true)
      expect(flightKeyCodes().has('KeyE')).toBe(true)
    })
  })

  it('commands braking thrust for a descent faster than the safe touchdown speed', () => {
    const body = makeBody([0, 0, 0])
    CELESTIAL_BODIES.push(body)
    gameStats.arrival.phase = 'descent'
    gameStats.arrival.body = 0
    const facingOutward = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)
    const out = runAutopilot(
      input({
        task: 'land',
        destination: body,
        engaged: true,
        position: new THREE.Vector3(0, 0, 105),
        velocity: new THREE.Vector3(0, 0, -30),
        quaternion: facingOutward,
      }),
      createAutopilotOutput(),
    )

    expect(out.status).toContain('Descent:')
    expect(out.throttle).toBeGreaterThan(0)
    expect(out.throttle).toBeLessThanOrEqual(1)
  })
})
