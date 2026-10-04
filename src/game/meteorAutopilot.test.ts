import * as THREE from 'three'
import { afterEach, describe, expect, it } from 'vitest'
import { createAutopilotOutput, runAutopilot, type AutopilotInput } from './autopilot'
import { CELESTIAL_BODIES, meteorTracks, type CelestialBody } from './gameState'
import { meteorTrajectory, planMeteorEvent, type MeteorSpec, type Vec3 } from './meteorField'
import { mulberry32 } from './rng'

const destination: CelestialBody = {
  name: 'Test World',
  position: [0, 0, -1000],
  radius: 100,
  gm: 10_000,
  wellRadius: 400,
  atmosphereHeight: 20,
}

function pilotInput(): AutopilotInput {
  return {
    tier: 2,
    task: 'nav',
    destination,
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
  }
}

/** A meteor from the new generator, published the way EventManager does, 3 s before its closest approach. */
function publishMeteor(spec: MeteorSpec) {
  const { position, velocity } = meteorTrajectory([0, 0, 0], spec)
  const toClosest = -(position[0] * velocity[0] + position[1] * velocity[1] + position[2] * velocity[2]) / spec.speed ** 2
  const t = Math.max(0, toClosest - 3)
  const now = position.map((p, i) => p + velocity[i] * t) as Vec3
  meteorTracks.set(1, { position: now, velocity })
}

describe('autopilot with varied meteors', () => {
  afterEach(() => {
    meteorTracks.clear()
    CELESTIAL_BODIES.length = 0
  })

  const specs = Array.from({ length: 400 }, (_, i) => planMeteorEvent(mulberry32(i + 1)).meteors[0].spec)

  it('dodges meteors aimed at or grazing the ship', () => {
    const threats = specs.filter((s) => s.missDistance < 8)
    expect(threats.length).toBeGreaterThan(50)
    for (const spec of threats) {
      meteorTracks.clear()
      publishMeteor(spec)
      const out = runAutopilot(pilotInput(), createAutopilotOutput())
      expect(out.status).toBe('Evading meteor')
      expect(out.maneuverAccel.length()).toBeGreaterThan(0)
    }
  })

  it('does not dodge meteors that pass well clear', () => {
    const clear = specs.filter((s) => s.missDistance > 20)
    expect(clear.length).toBeGreaterThan(50)
    for (const spec of clear) {
      meteorTracks.clear()
      publishMeteor(spec)
      const out = runAutopilot(pilotInput(), createAutopilotOutput())
      expect(out.status).not.toBe('Evading meteor')
    }
  })
})
