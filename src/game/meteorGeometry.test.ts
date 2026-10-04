import { afterEach, describe, expect, it } from 'vitest'
import { METEOR_VARIANTS } from './meteorField'
import {
  COLLIDER_FACTOR,
  DISPLACE,
  STRETCH,
  buildMeteorGeometry,
  disposeMeteorGeometries,
  getMeteorGeometry,
  meteorColliderRadius,
  meteorDetail,
  meteorGeometryCacheSize,
} from './meteorGeometry'

function reaches(geometry: ReturnType<typeof buildMeteorGeometry>) {
  const p = geometry.getAttribute('position')
  const lengths = Array.from({ length: p.count }, (_, i) => Math.hypot(p.getX(i), p.getY(i), p.getZ(i)))
  return { min: Math.min(...lengths), max: Math.max(...lengths) }
}

describe('meteor geometry', () => {
  afterEach(() => disposeMeteorGeometries())

  it('is lumpy but bounded: no point beyond the unit reach, none deeper than the bump + stretch allow', () => {
    const floor = ((1 - DISPLACE) * (1 - STRETCH)) / ((1 + DISPLACE) * (1 + STRETCH))
    for (let seed = 1; seed <= 12; seed++) {
      for (const detail of [1, 2]) {
        const { min, max } = reaches(buildMeteorGeometry(seed, detail))
        expect(max).toBeCloseTo(1, 6)
        expect(min).toBeGreaterThanOrEqual(floor - 1e-6)
        expect(min).toBeLessThan(0.97) // visibly not a ball
      }
    }
  })

  it('has a bounding sphere no more than 10% bigger than the collider', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const { max } = reaches(buildMeteorGeometry(seed, 2))
      for (const radius of [0.4, 1, 4]) {
        expect(max * radius).toBeLessThanOrEqual(meteorColliderRadius(radius) * 1.1)
      }
    }
    expect(COLLIDER_FACTOR).toBeLessThanOrEqual(1)
  })

  it('does not tear: corners shared by neighbouring faces move together', () => {
    const p = buildMeteorGeometry(3, 1).getAttribute('position')
    const unique = new Set<string>()
    for (let i = 0; i < p.count; i++) unique.add([p.getX(i), p.getY(i), p.getZ(i)].map((v) => v.toFixed(5)).join(','))
    // a closed triangle mesh has about one vertex per 2 corners (V = F/2 + 2)
    expect(unique.size).toBe(p.count / 6 + 2)
  })

  it('same seed gives the same shape, different seeds differ', () => {
    const a = buildMeteorGeometry(5, 1).getAttribute('position').array
    const b = buildMeteorGeometry(5, 1).getAttribute('position').array
    const c = buildMeteorGeometry(6, 1).getAttribute('position').array
    expect(Array.from(a)).toEqual(Array.from(b))
    expect(Array.from(a)).not.toEqual(Array.from(c))
  })

  it('caches by variant and detail instead of building one per meteor', () => {
    const first = getMeteorGeometry(2, 1)
    expect(getMeteorGeometry(2, 1)).toBe(first)
    expect(getMeteorGeometry(2 + METEOR_VARIANTS, 1)).toBe(first)
    expect(getMeteorGeometry(2, 2)).not.toBe(first)
    for (let i = 0; i < 100; i++) getMeteorGeometry(i, meteorDetail(i % 3))
    expect(meteorGeometryCacheSize()).toBeLessThanOrEqual(METEOR_VARIANTS * 2)
  })

  it('uses a coarser mesh for small rocks', () => {
    expect(meteorDetail(0.5)).toBeLessThan(meteorDetail(3))
  })
})
