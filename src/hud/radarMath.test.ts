import { describe, expect, it } from 'vitest'
import { Euler, Quaternion, Vector3 } from 'three'
import { projectRadar, selectRadarContacts } from './radarMath'

describe('projectRadar', () => {
  const origin = new Vector3(14, -28, 39)
  for (const angles of [[0, 0, 0], [1.2, 0, 0], [0, 2.1, 0], [0, 0, -1.7], [1.2, 2.1, -1.7]]) {
    it(`keeps forward up and height signed at rotation ${angles.join(',')}`, () => {
      const rotation = new Quaternion().setFromEuler(new Euler(...angles as [number, number, number]))
      const world = (local: Vector3) => local.applyQuaternion(rotation).add(origin)
      const forward = projectRadar(world(new Vector3(0, 0, -50)), origin, rotation, 100)
      expect(forward.x).toBeCloseTo(0)
      expect(forward.y).toBeCloseTo(-0.5)
      expect(forward.height).toBeCloseTo(0)
      expect(projectRadar(world(new Vector3(0, 30, 0)), origin, rotation, 100).height).toBeCloseTo(0.3)
      expect(projectRadar(world(new Vector3(0, -30, 0)), origin, rotation, 100).height).toBeCloseTo(-0.3)
    })
  }

  it('clips far, vertical and diagonal contacts to a finite rim', () => {
    for (const point of [new Vector3(300, 0, -400), new Vector3(0, 500, 0), new Vector3(0, -500, 0), new Vector3(10, 500, 20)]) {
      const result = projectRadar(point, new Vector3(), new Quaternion(), 100)
      expect(result.clipped).toBe(true)
      expect(Math.hypot(result.x, result.y)).toBeCloseTo(1)
      expect(Number.isFinite(result.height)).toBe(true)
    }
    expect(projectRadar(new Vector3(), new Vector3(), new Quaternion(), 100)).toEqual({ x: 0, y: 0, height: 0, distance: 0, clipped: false })
    expect(projectRadar(new Vector3(100, 0, 0), new Vector3(), new Quaternion(), 100).clipped).toBe(false)
  })

  it('is translation invariant and leaves inputs unchanged', () => {
    const point = new Vector3(24, 50, -48)
    const rotation = new Quaternion().setFromEuler(new Euler(0.3, 0.9, 1.4))
    const copies = [point.clone(), origin.clone(), rotation.clone()]
    const result = projectRadar(point, origin, rotation, 100)
    const offset = new Vector3(8000, -7000, 6000)
    expect(projectRadar(point.clone().add(offset), origin.clone().add(offset), rotation, 100)).toEqual(result)
    expect([point, origin, rotation]).toEqual(copies)
  })

  it('rejects invalid display ranges', () => {
    for (const range of [0, -1, NaN, Infinity]) expect(() => projectRadar(origin, origin, new Quaternion(), range)).toThrow(RangeError)
  })

  it('projects and selects 500 contacts within a 10 ms median budget', () => {
    const points = Array.from({ length: 500 }, (_, i) => new Vector3(i - 250, i % 60, -i))
    const rotation = new Quaternion().setFromEuler(new Euler(0.4, 0.8, 1.2))
    const durations = []
    for (let run = 0; run < 21; run++) {
      const start = performance.now()
      const contacts = points.map((point, i) => ({ ...projectRadar(point, origin, rotation, 300), key: `${i}`, priority: 0, selected: i === 499 }))
      expect(selectRadarContacts(contacts, 128).length).toBeLessThanOrEqual(128)
      durations.push(performance.now() - start)
    }
    const median = durations.sort((a, b) => a - b)[10]
    console.info(`Radar 500-contact projection + selection median: ${median.toFixed(3)} ms (budget 10 ms)`)
    expect(median).toBeLessThan(10)
  })
})

it('caps markers, retains distant landmarks and gives the selected target first place', () => {
  const contacts = Array.from({ length: 500 }, (_, i) => ({ x: 0, y: -1, height: 0, distance: i, clipped: i > 300, key: `${i}`, priority: i === 498 ? 1 : 0, selected: i === 499 }))
  const result = selectRadarContacts(contacts, 128)
  expect(result).toHaveLength(128)
  expect(result[0].key).toBe('499')
  expect(result[1].key).toBe('498')
  expect(result.slice(2).every((contact) => !contact.clipped)).toBe(true)
  expect(contacts[0].key).toBe('0')
  expect(selectRadarContacts(contacts, 0)).toEqual([])
})
