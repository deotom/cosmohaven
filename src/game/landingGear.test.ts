import { Body, Box, Plane, Vec3, World } from 'cannon-es'
import * as THREE from 'three'
import { afterEach, describe, expect, it } from 'vitest'
import { computeGearLayout, gearPose, gearState, isTouchdown, landingDamage, recordGearImpact, retractGear, stepGear, stepSuspension, suspensionAcceleration, toggleGear, updateGear, type SuspensionStep } from './landingGear'
import type { Block, GridPos } from './types'
import { linearDamping } from './damping'
import { LAND_ALTITUDE } from './autopilot'

const hull = (positions: GridPos[]): Block[] => positions.map((pos) => ({ type: 'hull', pos }))
const shapes = [
  hull([[0, 0, 0]]),
  hull(Array.from({ length: 9 }, (_, i): GridPos => [i % 3, 0, Math.floor(i / 3)])),
  hull([[0, 0, 0], [1, 0, 0], [2, 0, 0], [0, 0, 1], [0, 0, 2]]),
  hull([[0, -2, 0], [0, -1, 0], [0, 0, 0], [0, 1, 0]]),
  hull(Array.from({ length: 9 }, (_, i): GridPos => [i % 3, 0, Math.floor(i / 3)]).filter(([x, , z]) => x !== 1 || z !== 1)),
]

afterEach(retractGear)

describe('landing gear layout and motion', () => {
  it.each(shapes.map((blocks, i) => ({ blocks, i })))('supports sample $i without duplicate or floating mounts', ({ blocks }) => {
    const layout = computeGearLayout(blocks)
    expect(layout.mounts.length).toBeGreaterThanOrEqual(3)
    expect(layout.mounts.length).toBeLessThanOrEqual(4)
    expect(new Set(layout.mounts.map(String)).size).toBe(layout.mounts.length)
    const minY = Math.min(...blocks.map((b) => b.pos[1]))
    for (const [x, y, z] of layout.mounts) {
      expect(y).toBe(minY - 0.5)
      expect(blocks.some((b) => b.pos[1] === minY && Math.abs(b.pos[0] - x) < 0.5 && Math.abs(b.pos[2] - z) < 0.5)).toBe(true)
    }
    expect(computeGearLayout([...blocks].reverse())).toEqual(layout)
  })
  it('extends in one second and clamps both endpoints', () => {
    let progress = 0
    for (let i = 0; i < 240; i++) progress = stepGear(progress, true, 1 / 240)
    expect(progress).toBeCloseTo(1)
    expect(stepGear(progress, true, 0.5)).toBe(1)
    expect(stepGear(0.1, false, 0.5)).toBe(0)
    expect(stepGear(0.5, true, -1)).toBe(0.5)
  })
  it('checks height, inward/outward speed and finite values', () => {
    expect(isTouchdown(5, 2, -4)).toBe(false)
    expect(isTouchdown(2.019, 2, -12)).toBe(true)
    expect(isTouchdown(2.15, 2, -12, 0.15)).toBe(true)
    expect(isTouchdown(2.1, 2, -4)).toBe(false)
    expect(isTouchdown(2.3, 2, -4)).toBe(false)
    expect(isTouchdown(2, 2, -12.01)).toBe(false)
    expect(isTouchdown(2, 2, 20)).toBe(false)
    expect(isTouchdown(NaN, 2, 0)).toBe(false)
  })
  it('uses the actual rotated hull and curved surface for foot height', () => {
    for (const blocks of shapes) for (const quaternion of [new THREE.Quaternion(), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)]) {
      const up = new THREE.Vector3(0, 1, 0)
      const pose = gearPose(computeGearLayout(blocks), blocks, quaternion, up, 100)
      expect(new Set(pose.legs.map((leg) => leg.foot.toArray().map((v) => v.toFixed(6)).join(','))).size).toBe(pose.legs.length)
      expect(pose.supportHeight).toBeGreaterThan(pose.bellyHeight + 1.3)
      for (const leg of pose.legs) {
        expect(new THREE.Vector3(0, 100 + pose.supportHeight, 0).add(leg.foot).length()).toBeGreaterThanOrEqual(100 - 1e-8)
      }
    }
  })
  it('automatically deploys below 40, respects G, retracts on ascent and locks in the hangar', () => {
    updateGear('descent', 250, -4, 1, false)
    expect(gearState.progress).toBe(0)
    updateGear('descent', 39, -4, 1, false)
    expect(gearState.progress).toBe(1)
    toggleGear(false)
    updateGear('descent', 10, -4, 1, false)
    expect(gearState.progress).toBe(0)
    updateGear('landed', 2, 0, 1, false)
    expect(gearState.progress).toBe(0)
    updateGear('none', 100, 0, 1, false)
    updateGear('landed', 2, 0, 1, false)
    expect(gearState.progress).toBe(1)
    updateGear('landed', 16, 4, 1, false)
    expect(gearState.progress).toBe(0)
    toggleGear(true)
    expect(gearState.progress).toBe(0)
    updateGear('descent', 2, 0, 1, true)
    expect(gearState.target).toBe(false)
  })
  it.each([4, 8, 12])('absorbs impact at %i u/s', (speed) => {
    expect(landingDamage(speed, true)).toBeLessThanOrEqual(landingDamage(speed, false))
    if (speed <= 8) expect(landingDamage(speed, true)).toBe(0)
  })
  it('moves the braking target with the support height, keeping a three-unit settling margin', () => {
    expect(LAND_ALTITUDE(0.5)).toBe(3.5)
    expect(LAND_ALTITUDE(6)).toBe(9)
    expect(LAND_ALTITUDE()).toBe(5)
  })
  it('keeps an unsafe incoming impact after the spring has slowed the ship', () => {
    const incoming = recordGearImpact(0, -16, true)
    expect(recordGearImpact(incoming, -0.2, true)).toBe(16)
    expect(recordGearImpact(0, -30, false)).toBe(0)
    expect(landingDamage(incoming, true)).toBeGreaterThan(0)
  })
})

describe('suspension in cannon with the same force/substep convention as Ship', () => {
  it('does not send the full stopping impulse again while the worker response is pending', () => {
    const sample = [0, -12, 0]
    const first = stepSuspension(null, sample, 2, 2, -12, 2, 0.1)
    const pending = stepSuspension(first, sample, 2, 2, -12, 2, 0.1)
    expect(pending.acceleration).toBeLessThan(first.acceleration * 0.15)
    const acknowledged = stepSuspension(pending, [0, -0.2, 0], 2, 2, -0.2, 2, 0.1)
    expect(acknowledged.velocity).toBeGreaterThan(-0.2)
  })
  it('handles delayed worker samples at 2–240 FPS without launching the ship or penetrating the hull', () => {
    for (const dt of [0.5, 1 / 60, 1 / 240]) {
      const world = new World({ gravity: new Vec3() })
      const body = new Body({ mass: 1 })
      body.position.y = 2
      body.velocity.y = -12
      body.linearDamping = 0
      world.addBody(body)
      let step: SuspensionStep | null = null
      let sample = [0, -12, 0]
      let height = 2
      let peak = 0
      let minimum = Infinity
      for (let frame = 0; frame < 5 / dt; frame++) {
        if (frame % 4 === 0) { sample = [0, body.velocity.y, 0]; height = body.position.y }
        const h = Math.min(dt, 0.1)
        step = stepSuspension(step, sample, height, 2, sample[1], 2, h)
        body.force.y += (step.acceleration - 2) * h * 60
        world.step(1 / 60, dt, 10)
        peak = Math.max(peak, body.position.y)
        minimum = Math.min(minimum, body.position.y)
        expect(Number.isFinite(body.position.y + body.velocity.y)).toBe(true)
      }
      expect(peak).toBeLessThan(2.3)
      expect(minimum).toBeGreaterThan(0.5)
      expect(Math.abs(body.position.y - 2)).toBeLessThan(0.15)
    }
  })
  it.each([1 / 2, 1 / 30, 1 / 60, 1 / 144, 1 / 240])('settles at frame dt %f without NaN or penetrating the belly', (dt) => {
    for (const speed of [2, 6, 12]) {
      const world = new World({ gravity: new Vec3() })
      const floor = new Body({ mass: 0, shape: new Plane() })
      floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
      world.addBody(floor)
      const body = new Body({ mass: 1, shape: new Box(new Vec3(0.5, 0.5, 0.5)) })
      body.position.y = 2.1
      body.velocity.y = -speed
      body.linearDamping = linearDamping({ base: 0, well: 0, freedom: 1, atmosphereDrag: 0.35, atmosphere: 1, landed: 0.6 })
      world.addBody(body)
      let minHeight = Infinity
      let settledAtOneSecond = false
      for (let time = 0; time < 5; time += dt) {
        const h = Math.min(dt, 0.1)
        const accel = suspensionAcceleration(body.position.y, 2, body.velocity.y, 2, h)
        body.force.y += (accel - 2) * h * 60
        world.step(1 / 60, dt, 10)
        expect(Number.isFinite(body.position.y + body.velocity.y)).toBe(true)
        minHeight = Math.min(minHeight, body.position.y)
        if (!settledAtOneSecond && time + dt >= 1) {
          settledAtOneSecond = true
          expect(Math.abs(body.position.y - 2)).toBeLessThan(0.25)
          expect(Math.abs(body.velocity.y)).toBeLessThan(0.5)
        }
      }
      expect(minHeight).toBeGreaterThan(0.5)
      expect(body.position.y).toBeCloseTo(2, 1)
      expect(Math.abs(body.velocity.y)).toBeLessThan(0.1)
    }
  })
  it.each([1 / 2, 1 / 240])('the pure spring remains finite at dt %f without a collider', (dt) => {
    for (const speed of [2, 6, 12]) {
      let altitude = 2.1
      let velocity = -speed
      for (let time = 0; time < 5; time += dt) {
        velocity += (suspensionAcceleration(altitude, 2, velocity, 2, dt) - 2) * dt
        altitude += velocity * dt
        expect(Number.isFinite(altitude + velocity)).toBe(true)
        expect(altitude).toBeGreaterThan(0.5)
      }
      expect(altitude).toBeCloseTo(2, 1)
      expect(Math.abs(velocity)).toBeLessThan(0.1)
    }
  })
})
