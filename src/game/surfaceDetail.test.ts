import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAutopilotOutput, runAutopilot, type AutopilotInput } from './autopilot'
import { CELESTIAL_BODIES, EARTH_2, gameStats, type CelestialBody } from './gameState'
import { generateSector } from './sector'
import {
  cellRandom,
  detailStrength,
  DETAIL_FULL,
  DETAIL_START,
  dustIntensity,
  isLandable,
  landRefusal,
  MAX_PROPS,
  planetKind,
  propsAround,
  propsInCell,
  touchShake,
} from './surfaceDetail'

function nameOfKind(kind: 'gas' | 'rocky' | 'ice') {
  for (let i = 0; i < 500; i++) {
    const name = `Probe-${i}`
    if (planetKind(name) === kind) return name
  }
  throw new Error(`no ${kind} name found`)
}

describe('planet kind and landing', () => {
  it('gas giants are not landable, rocky and ice worlds are, Earth 2.0 always is', () => {
    expect(isLandable({ name: nameOfKind('gas') })).toBe(false)
    expect(isLandable({ name: nameOfKind('rocky') })).toBe(true)
    expect(isLandable({ name: nameOfKind('ice') })).toBe(true)
    expect(isLandable({ name: EARTH_2.name })).toBe(true)
  })

  it('explains why a gas giant refuses a landing and says nothing for solid worlds', () => {
    expect(landRefusal({ name: nameOfKind('gas') })).toMatch(/gas giant/)
    expect(landRefusal({ name: nameOfKind('rocky') })).toBeNull()
  })

  it('classifies the generated planets, with roughly the intended share of gas giants', () => {
    let gas = 0
    let total = 0
    for (let seed = 1; seed <= 100; seed++) {
      for (const planet of generateSector(seed * 31, seed).planets) {
        total++
        if (!isLandable(planet)) gas++
      }
    }
    expect(gas / total).toBeGreaterThan(0.15)
    expect(gas / total).toBeLessThan(0.45)
  })
})

describe('detail layer strength', () => {
  it('is 0 high up, 1 near the ground, and never rises with altitude', () => {
    expect(detailStrength(DETAIL_START)).toBe(0)
    expect(detailStrength(DETAIL_START * 10)).toBe(0)
    expect(detailStrength(DETAIL_FULL)).toBe(1)
    expect(detailStrength(0)).toBe(1)
    let previous = detailStrength(0)
    for (let altitude = 1; altitude <= DETAIL_START + 50; altitude++) {
      const now = detailStrength(altitude)
      expect(now).toBeLessThanOrEqual(previous + 1e-12)
      previous = now
    }
  })
})

describe('ground props', () => {
  const rocky = nameOfKind('rocky')
  const ice = nameOfKind('ice')
  const center: [number, number, number] = [0.3, 0.5, -0.8]

  it('are the same every time for the same planet and cell', () => {
    expect(propsInCell(rocky, 90, 12, 7)).toEqual(propsInCell(rocky, 90, 12, 7))
    expect(propsAround(rocky, 90, center)).toEqual(propsAround(rocky, 90, center))
    expect(cellRandom(1, 2, 3, 4)).toBe(cellRandom(1, 2, 3, 4))
  })

  it('differ between planets and between cells', () => {
    expect(propsAround(rocky, 90, center)).not.toEqual(propsAround(ice, 90, center))
    expect(propsAround(rocky, 90, center)).not.toEqual(propsAround(rocky, 90, [-center[0], center[1], center[2]]))
  })

  it('stay the same wherever the ship is: a cell yields the same props whoever asks', () => {
    const a = propsAround(rocky, 90, center, 130)
    const b = propsAround(rocky, 90, [center[0] + 0.05, center[1], center[2]], 130)
    const keyOf = (p: { dir: number[] }) => p.dir.join(',')
    const shared = a.filter((p) => b.some((q) => keyOf(q) === keyOf(p)))
    expect(shared.length).toBeGreaterThan(a.length / 2)
  })

  it('never exceed the cap, and are nearest-first when capped', () => {
    for (const radius of [40, 90, 150]) {
      const props = propsAround(rocky, radius, center, 400, MAX_PROPS)
      expect(props.length).toBeLessThanOrEqual(MAX_PROPS)
      expect(props.length).toBeGreaterThan(0)
    }
    expect(propsAround(rocky, 90, center, 400, 25)).toHaveLength(25)
    const near = propsAround(rocky, 90, center, 400, 25)
    const far = propsAround(rocky, 90, center, 400, 400)
    expect(far.slice(0, 25)).toEqual(near)
  })

  it('lie within range of the point and on unit directions', () => {
    const c = new THREE.Vector3(...center).normalize()
    for (const prop of propsAround(rocky, 90, center, 60)) {
      const dir = new THREE.Vector3(...prop.dir)
      expect(dir.length()).toBeCloseTo(1, 6)
      expect(dir.angleTo(c) * 90).toBeLessThanOrEqual(60 + 1e-6)
      expect(prop.size).toBeGreaterThan(0)
    }
  })

  it('work at the poles and across the longitude seam', () => {
    expect(propsAround(rocky, 90, [0, 1, 0]).length).toBeGreaterThan(0)
    expect(propsAround(rocky, 90, [0, -1, 0]).length).toBeGreaterThan(0)
    expect(propsAround(rocky, 90, [1, 0, -1e-6]).length).toBeGreaterThan(0)
  })

  it('do not appear on gas giants or Earth 2.0', () => {
    expect(propsAround(nameOfKind('gas'), 90, center)).toEqual([])
    expect(propsAround(EARTH_2.name, 300, center)).toEqual([])
  })
})

describe('touchdown effects', () => {
  it('dust needs low altitude and thrust, and grows with both', () => {
    expect(dustIntensity(25, 1)).toBe(0)
    expect(dustIntensity(100, 1)).toBe(0)
    expect(dustIntensity(5, 0)).toBe(0)
    expect(dustIntensity(5, 1)).toBeGreaterThan(dustIntensity(15, 1))
    expect(dustIntensity(5, 1)).toBeGreaterThan(dustIntensity(5, 0.4))
    expect(dustIntensity(-3, 2)).toBeLessThanOrEqual(1)
  })

  it('the touch shake decays to nothing', () => {
    expect(touchShake(0)).toBeGreaterThan(touchShake(0.3))
    expect(touchShake(0.3)).toBeGreaterThan(0)
    expect(touchShake(5)).toBe(0)
    expect(touchShake(-1)).toBe(0)
  })
})

describe('auto-pilot refuses to land on a gas giant', () => {
  const gasName = nameOfKind('gas')
  const rockyName = nameOfKind('rocky')
  const makeBody = (name: string): CelestialBody => ({ name, position: [0, 0, 0], radius: 100, gm: 10_000, wellRadius: 400, atmosphereHeight: 20 })
  const input = (body: CelestialBody): AutopilotInput => ({
    tier: 1,
    task: 'land',
    destination: body,
    target: null,
    engaged: false,
    position: new THREE.Vector3(0, 0, 300),
    velocity: new THREE.Vector3(8, 0, 0),
    quaternion: new THREE.Quaternion(),
    angularVelocity: new THREE.Vector3(),
    gravity: new THREE.Vector3(),
    dt: 1 / 60,
    mainAccel: 8,
    harvestRange: 10,
    scanRange: 150,
    hull: 100,
  })

  beforeEach(() => {
    CELESTIAL_BODIES.length = 0
    gameStats.arrival.phase = 'deorbit'
    gameStats.arrival.body = 0
    gameStats.autopilot.intent = 'land'
    gameStats.notice = null
  })
  afterEach(() => {
    CELESTIAL_BODIES.length = 0
    gameStats.arrival.phase = 'none'
    gameStats.arrival.body = -1
    gameStats.autopilot.intent = 'choose'
  })

  it('sends a gas giant landing request back to the arrival choice with a reason', () => {
    const body = makeBody(gasName)
    CELESTIAL_BODIES.push(body)
    const out = runAutopilot(input(body), createAutopilotOutput())
    expect(gameStats.arrival.phase).toBe('choice')
    expect(out.status).toContain('refused')
    expect(out.throttle).toBe(0)
    expect(gameStats.notice?.kind).toBe('warning')
    expect(gameStats.autopilot.intent).toBe('choose')
  })

  it('still runs the normal de-orbit burn on a rocky world', () => {
    const body = makeBody(rockyName)
    CELESTIAL_BODIES.push(body)
    const out = runAutopilot(input(body), createAutopilotOutput())
    expect(gameStats.arrival.phase).toBe('deorbit')
    expect(out.status).toContain('De-orbit')
  })
})
