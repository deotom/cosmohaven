import { describe, expect, it } from 'vitest'
import { DIFFICULTY_PROFILES, DIFFICULTY_ORDER } from './difficulty'
import {
  DIRECT_HIT_CHANCE,
  FIRST_METEOR_DELAY,
  MAX_MISS_DISTANCE,
  MAX_RADIUS,
  MAX_SPAWN_DISTANCE,
  MAX_SPEED,
  MAX_SPIN,
  METEOR_VARIANTS,
  MIN_RADIUS,
  MIN_SPAWN_DISTANCE,
  MIN_SPEED,
  MIN_SPIN,
  PALETTES,
  SHOWER_COUNT,
  firstMeteorDelay,
  meteorMass,
  meteorTrajectory,
  nextMeteorGap,
  planMeteorEvent,
  randomRadius,
  type MeteorSpec,
  type Vec3,
} from './meteorField'
import { mulberry32 } from './rng'

const N = 20_000
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const fraction = (xs: number[], test: (x: number) => boolean) => xs.filter(test).length / xs.length
const len = (v: Vec3) => Math.hypot(...v)

describe('meteor gaps', () => {
  const expectedMean = { relaxed: 100, standard: 50, challenging: 25 }

  for (const difficulty of DIFFICULTY_ORDER) {
    it(`${difficulty}: mean near target, never below the minimum, with long quiet spells`, () => {
      const profile = DIFFICULTY_PROFILES[difficulty].meteorGap
      const rand = mulberry32(11)
      const gaps = Array.from({ length: N }, () => nextMeteorGap(rand, profile))
      expect(mean(gaps)).toBeGreaterThan(expectedMean[difficulty] * 0.95)
      expect(mean(gaps)).toBeLessThan(expectedMean[difficulty] * 1.05)
      expect(Math.min(...gaps)).toBeGreaterThanOrEqual(profile.min)
      // exponential tail: P(gap > min + 2*(mean-min)) = e^-2 ~ 13.5%
      const quiet = fraction(gaps, (g) => g > profile.min + 2 * (profile.mean - profile.min))
      expect(quiet).toBeGreaterThan(0.11)
      expect(quiet).toBeLessThan(0.16)
    })
  }

  it('standard averages 45-60 s and is slower than the old 15-20 s', () => {
    expect(DIFFICULTY_PROFILES.standard.meteorGap.mean).toBeGreaterThanOrEqual(45)
    expect(DIFFICULTY_PROFILES.standard.meteorGap.mean).toBeLessThanOrEqual(60)
  })

  it('first meteor comes in the configured window', () => {
    const rand = mulberry32(3)
    const delays = Array.from({ length: 2000 }, () => firstMeteorDelay(rand))
    expect(Math.min(...delays)).toBeGreaterThanOrEqual(FIRST_METEOR_DELAY[0])
    expect(Math.max(...delays)).toBeLessThanOrEqual(FIRST_METEOR_DELAY[1])
  })
})

describe('meteor events', () => {
  const rand = mulberry32(2026)
  const events = Array.from({ length: N }, () => planMeteorEvent(rand))
  const singles = events.filter((e) => e.kind === 'single')
  const showers = events.filter((e) => e.kind === 'shower')
  const allSpecs: MeteorSpec[] = events.flatMap((e) => e.meteors.map((m) => m.spec))
  const singleSpecs = singles.map((e) => e.meteors[0].spec)

  it('about 12% of events are showers of 3-6 small rocks with increasing delays', () => {
    const share = showers.length / events.length
    expect(share).toBeGreaterThan(0.1)
    expect(share).toBeLessThan(0.14)
    for (const shower of showers) {
      expect(shower.meteors.length).toBeGreaterThanOrEqual(SHOWER_COUNT[0])
      expect(shower.meteors.length).toBeLessThanOrEqual(SHOWER_COUNT[1])
      expect(shower.meteors[0].delay).toBe(0)
      shower.meteors.forEach((m, i) => {
        expect(m.spec.radius).toBeLessThanOrEqual(1)
        if (i > 0) expect(m.delay).toBeGreaterThan(shower.meteors[i - 1].delay)
      })
    }
  })

  it('shower rocks come from nearly the same direction', () => {
    for (const shower of showers.slice(0, 200)) {
      const first = shower.meteors[0].spec.direction
      for (const { spec } of shower.meteors) {
        const dot = first[0] * spec.direction[0] + first[1] * spec.direction[1] + first[2] * spec.direction[2]
        expect(Math.acos(Math.min(1, dot))).toBeLessThan(0.55)
      }
    }
  })

  it('sizes are heavy-tailed, bounded and mostly small', () => {
    const radii = singleSpecs.map((s) => s.radius)
    expect(median(radii)).toBeGreaterThan(0.8)
    expect(median(radii)).toBeLessThan(1.2)
    expect(Math.min(...radii)).toBeGreaterThanOrEqual(MIN_RADIUS)
    expect(Math.max(...radii)).toBeLessThanOrEqual(MAX_RADIUS)
    const big = fraction(radii, (r) => r > 2.5)
    expect(big).toBeGreaterThan(0.03)
    expect(big).toBeLessThan(0.1)
    expect(fraction(radii, (r) => r < 1)).toBeGreaterThan(0.45)
  })

  it('randomRadius alone obeys the same bounds', () => {
    const r = mulberry32(5)
    for (let i = 0; i < 2000; i++) {
      const radius = randomRadius(r)
      expect(radius).toBeGreaterThanOrEqual(MIN_RADIUS)
      expect(radius).toBeLessThanOrEqual(MAX_RADIUS)
    }
  })

  it('mass follows volume and keeps the old anchor', () => {
    expect(meteorMass(1.3)).toBeCloseTo(40)
    expect(meteorMass(2.6)).toBeCloseTo(320)
    for (const s of allSpecs.slice(0, 500)) expect(s.mass).toBeCloseTo(meteorMass(s.radius))
  })

  it('speed stays in range and big rocks are slower than small ones', () => {
    for (const s of allSpecs) {
      expect(s.speed).toBeGreaterThanOrEqual(MIN_SPEED)
      expect(s.speed).toBeLessThanOrEqual(MAX_SPEED)
    }
    const small = singleSpecs.filter((s) => s.radius < 0.7).map((s) => s.speed)
    const large = singleSpecs.filter((s) => s.radius > 2).map((s) => s.speed)
    expect(mean(small)).toBeGreaterThan(mean(large) + 8)
  })

  it('spin, spawn distance, variants and looks vary within range', () => {
    for (const s of allSpecs) {
      expect(len(s.spin)).toBeGreaterThanOrEqual(MIN_SPIN - 1e-9)
      expect(len(s.spin)).toBeLessThanOrEqual(MAX_SPIN + 1e-9)
      expect(s.spawnDistance).toBeGreaterThanOrEqual(MIN_SPAWN_DISTANCE)
      expect(s.spawnDistance).toBeLessThanOrEqual(MAX_SPAWN_DISTANCE)
      expect(len(s.direction)).toBeCloseTo(1, 6)
      expect(s.variant).toBeGreaterThanOrEqual(0)
      expect(s.variant).toBeLessThan(METEOR_VARIANTS)
      expect(s.palette).toBeLessThan(PALETTES.length)
    }
    expect(new Set(allSpecs.map((s) => s.variant)).size).toBe(METEOR_VARIANTS)
    expect(new Set(allSpecs.map((s) => s.palette)).size).toBe(PALETTES.length)
  })

  it('miss distance: a share are direct hits, the rest spread up to the maximum', () => {
    const misses = allSpecs.map((s) => s.missDistance)
    const direct = fraction(misses, (m) => m === 0)
    expect(direct).toBeGreaterThan(DIRECT_HIT_CHANCE - 0.02)
    expect(direct).toBeLessThan(DIRECT_HIT_CHANCE + 0.02)
    expect(Math.max(...misses)).toBeLessThanOrEqual(MAX_MISS_DISTANCE)
    expect(fraction(misses, (m) => m > 0 && m < 10)).toBeGreaterThan(0.2)
    expect(fraction(misses, (m) => m >= 10 && m < 20)).toBeGreaterThan(0.2)
    expect(fraction(misses, (m) => m >= 20)).toBeGreaterThan(0.2)
  })

  it('the trajectory passes the ship at exactly the planned miss distance', () => {
    const ship: Vec3 = [100, -40, 7]
    for (const s of allSpecs.slice(0, 1000)) {
      const { position, velocity } = meteorTrajectory(ship, s)
      expect(len(velocity)).toBeCloseTo(s.speed, 6)
      const rel: Vec3 = [position[0] - ship[0], position[1] - ship[1], position[2] - ship[2]]
      const t = -(rel[0] * velocity[0] + rel[1] * velocity[1] + rel[2] * velocity[2]) / s.speed ** 2
      expect(t).toBeGreaterThan(0)
      const closest = len([rel[0] + velocity[0] * t, rel[1] + velocity[1] * t, rel[2] + velocity[2] * t])
      expect(closest).toBeCloseTo(s.missDistance, 4)
    }
  })

  it('is reproducible for the same seed', () => {
    expect(planMeteorEvent(mulberry32(9))).toEqual(planMeteorEvent(mulberry32(9)))
  })
})
