import { readFileSync } from 'node:fs'
import { Body, Box, Vec3, World } from 'cannon-es'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { buildScenarios, DEFAULT_SHIP_RADIUS, formatReport, SHIP_PHYSICS, SIM_DT, simulate, stepRigidBody, tally, type SimResult } from './autopilotSim'
import { generateSector, homeSector } from './sector'
import { BAY, RING_RADIUS, SPINE_LENGTH, STATION_AVOID_RADIUS, STATION_EXTENT } from './station'

describe('autopilotSim: the physics matches the game', () => {
  // Ship.tsx cannot be imported here (React, the physics worker), so read the constants out of its source
  const source = readFileSync(new URL('./Ship.tsx', import.meta.url), 'utf8')
  const constant = (name: string) => {
    const match = source.match(new RegExp(`const ${name}\\s*=\\s*([0-9.]+)`))
    expect(match, `${name} in Ship.tsx`).not.toBeNull()
    return Number(match![1])
  }

  it('uses the same damping, atmosphere drag and thrust constants as Ship.tsx', () => {
    expect(constant('LINEAR_DAMPING')).toBe(SHIP_PHYSICS.linearDamping)
    expect(constant('ANGULAR_DAMPING')).toBe(SHIP_PHYSICS.angularDamping)
    expect(constant('ATMOSPHERE_DRAG')).toBe(SHIP_PHYSICS.atmosphereDrag)
    expect(constant('THRUST_PER_BLOCK')).toBe(SHIP_PHYSICS.mainAccel)
  })

  it('steps a body like cannon-es does (position, velocity and attitude after 10 s)', () => {
    const accel = new THREE.Vector3(1.5, -0.7, 2.2)
    const angular = new THREE.Vector3(0.4, -0.9, 0.3)
    const inertia = 1 / 6 // a 1×1×1 block of mass 1

    const world = new World({ gravity: new Vec3(0, 0, 0) })
    const body = new Body({ mass: 1, shape: new Box(new Vec3(0.5, 0.5, 0.5)) })
    body.linearDamping = SHIP_PHYSICS.linearDamping
    body.angularDamping = SHIP_PHYSICS.angularDamping
    body.velocity.set(3, 1, -2)
    world.addBody(body)

    const pos = new THREE.Vector3()
    const vel = new THREE.Vector3(3, 1, -2)
    const quat = new THREE.Quaternion()
    const omega = new THREE.Vector3()
    for (let i = 0; i < 600; i++) {
      body.force.set(accel.x, accel.y, accel.z)
      body.torque.set(angular.x * inertia, angular.y * inertia, angular.z * inertia)
      world.step(SIM_DT)
      stepRigidBody(pos, vel, quat, omega, accel, angular, [inertia, inertia, inertia], SHIP_PHYSICS.linearDamping, SHIP_PHYSICS.angularDamping, SIM_DT)
    }
    const position = new THREE.Vector3(body.position.x, body.position.y, body.position.z)
    const velocity = new THREE.Vector3(body.velocity.x, body.velocity.y, body.velocity.z)
    const attitude = new THREE.Quaternion(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w)
    expect(pos.distanceTo(position)).toBeLessThan(1e-6)
    expect(vel.distanceTo(velocity)).toBeLessThan(1e-6)
    expect(1 - Math.abs(quat.dot(attitude))).toBeLessThan(1e-9)
  })
})

describe('station avoidance radius', () => {
  it('covers the whole structure, taken from the layout constants', () => {
    expect(STATION_EXTENT).toBeGreaterThanOrEqual(BAY.depth + SPINE_LENGTH)
    expect(STATION_EXTENT).toBeGreaterThan(Math.hypot(RING_RADIUS, BAY.depth + SPINE_LENGTH / 2))
    expect(STATION_AVOID_RADIUS).toBeGreaterThan(STATION_EXTENT)
  })
})

describe('auto-pilot trajectories (fast subset; the full 300-seed run is autopilotSim.full.test.ts)', () => {
  it('never hits a planet, a rock or a station, in any tier', () => {
    const results: SimResult[] = []
    for (let seed = 1; seed <= 4; seed++) {
      const sector = generateSector(seed, 1 + (seed % 50))
      for (const scenario of buildScenarios(sector, seed)) results.push(simulate(scenario, { settle: 20 }))
    }
    for (const scenario of buildScenarios(homeSector(), 0, [1, 2, 3], 'home')) results.push(simulate(scenario, { settle: 20 }))
    const t = tally(results)
    const crashed = results.filter((r) => r.outcome === 'crashed').map((r) => `${r.id} tier ${r.tier}: ${r.hit?.kind} ${r.hit?.name}`)
    expect(crashed, formatReport('fast subset', results)).toEqual([])
    expect(t.planet + t.asteroid + t.station).toBe(0)
    expect(t.runs).toBeGreaterThan(100)
  }, 120_000)

  it('does not let the ship fall into the planet after a NAV arrival', () => {
    const sector = generateSector(1, 2)
    const scenario = buildScenarios(sector, 1, [1]).find((s) => s.task === 'nav' && s.start === 'arrival')!
    const result = simulate(scenario, { settle: 120 })
    expect(result.outcome).toBe('arrived')
    expect(result.minGap.planet).toBeGreaterThan(30)
  })

  it('skips scrap lying in a planet atmosphere instead of diving at it', () => {
    const sector = generateSector(83, 1 + (83 % 50))
    const scenarios = buildScenarios(sector, 83, [1]).filter((s) => s.start === 'wellscrap')
    expect(scenarios.length).toBeGreaterThan(0)
    for (const scenario of scenarios) expect(simulate(scenario, { maxTime: 120 }).outcome).not.toBe('crashed')
  })

  it('has a ship radius that covers the starter hull', () => {
    expect(DEFAULT_SHIP_RADIUS).toBeGreaterThan(Math.sqrt(3) / 2)
  })
})
