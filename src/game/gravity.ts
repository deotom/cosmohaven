import * as THREE from 'three'
import { CELESTIAL_BODIES, type CelestialBody } from './gameState'

/** Outer fraction of a gravity well over which the pull fades in, so crossing the edge isn't a jolt. */
const EDGE_FADE = 0.2
/**
 * Outer fraction of a well over which the ship's flight damping fades out (space has no air). Kept
 * narrow: a gradual fade bleeds off a fly-by's sideways speed before gravity can capture it.
 */
const FREEDOM_FADE = 0.01

export type GravitySample = {
  /** Total gravitational acceleration at the sampled point, in units/s² */
  accel: THREE.Vector3
  /** 0 outside every well → 1 deep inside one; scales damping from "arcade" down to "space" */
  freedom: number
  /** 0 outside every atmosphere → 1 at the surface */
  atmosphere: number
  /** The body pulling hardest, if any */
  dominant: { body: CelestialBody; distance: number; accel: number } | null
}

export const createGravitySample = (): GravitySample => ({
  accel: new THREE.Vector3(),
  freedom: 0,
  atmosphere: 0,
  dominant: null,
})

const smoothstep = (t: number) => {
  const x = Math.max(0, Math.min(1, t))
  return x * x * (3 - 2 * x)
}

const toBody = new THREE.Vector3()

/**
 * Newtonian gravity from every celestial body whose well contains `position`: an acceleration of
 * gm / r² towards the centre (so orbits are real conic sections), faded in over the well's outer
 * edge. Fills `out` in place; no allocations.
 */
export function sampleGravity(position: THREE.Vector3, out: GravitySample): GravitySample {
  out.accel.set(0, 0, 0)
  out.freedom = 0
  out.atmosphere = 0
  out.dominant = null

  for (const body of CELESTIAL_BODIES) {
    toBody.set(...body.position).sub(position)
    const distance = toBody.length()
    if (distance >= body.wellRadius || distance === 0) continue

    // Inside the planet the pull stops growing; there's no singularity to fall into
    const r = Math.max(distance, body.radius)
    const accel = (body.gm / (r * r)) * smoothstep((body.wellRadius - distance) / (body.wellRadius * EDGE_FADE))
    out.accel.addScaledVector(toBody, accel / distance)

    out.freedom = Math.max(out.freedom, smoothstep((body.wellRadius - distance) / (body.wellRadius * FREEDOM_FADE)))
    if (body.atmosphereHeight > 0) {
      out.atmosphere = Math.max(out.atmosphere, smoothstep((body.radius + body.atmosphereHeight - distance) / body.atmosphereHeight))
    }
    if (!out.dominant || accel > out.dominant.accel) out.dominant = { body, distance, accel }
  }
  return out
}
