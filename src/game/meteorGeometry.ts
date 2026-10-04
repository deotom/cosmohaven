import * as THREE from 'three'
import { mulberry32 } from './rng'
import { METEOR_VARIANTS } from './meteorField'

/** Max radial bump of a vertex, as a fraction of the radius, before the axis stretch */
export const DISPLACE = 0.3
/** Max stretch of each axis away from 1 */
export const STRETCH = 0.4
/** The physics collider is a sphere this fraction of the rock's size (its longest reach is exactly 1 before scaling). */
export const COLLIDER_FACTOR = 0.92

/** Radius of the physics sphere for a meteor drawn at `radius` */
export const meteorColliderRadius = (radius: number) => radius * COLLIDER_FACTOR

/** Small rocks get a coarser mesh than big ones */
export const meteorDetail = (radius: number) => (radius < 1.2 ? 1 : 2)

/**
 * A lumpy unit rock: an icosahedron whose points are pushed in and out by a smooth seeded wave field (a function of
 * position, so points shared by neighbouring faces move together and the surface stays closed), stretched unevenly per
 * axis, then scaled so its furthest point is exactly 1 from the centre.
 */
export function buildMeteorGeometry(seed: number, detail: number): THREE.BufferGeometry {
  const rand = mulberry32(seed * 7919 + 17)
  const waves = Array.from({ length: 6 }, () => ({
    k: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize().multiplyScalar(1.5 + rand() * 4),
    phase: rand() * Math.PI * 2,
    amp: 0.4 + rand() * 0.6,
  }))
  const spread = Math.sqrt(waves.reduce((sum, w) => sum + (w.amp * w.amp) / 2, 0)) * 1.5 // ~1.5 standard deviations
  const stretch = [0, 0, 0].map(() => 1 + (rand() * 2 - 1) * STRETCH)

  const geometry = new THREE.IcosahedronGeometry(1, detail)
  const position = geometry.getAttribute('position')
  const p = new THREE.Vector3()
  let furthest = 0
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i).normalize()
    let bump = 0
    for (const w of waves) bump += w.amp * Math.sin(w.k.dot(p) + w.phase)
    p.multiplyScalar(1 + Math.max(-1, Math.min(1, bump / spread)) * DISPLACE)
    p.set(p.x * stretch[0], p.y * stretch[1], p.z * stretch[2])
    furthest = Math.max(furthest, p.length())
    position.setXYZ(i, p.x, p.y, p.z)
  }
  for (let i = 0; i < position.count; i++) {
    position.setXYZ(i, position.getX(i) / furthest, position.getY(i) / furthest, position.getZ(i) / furthest)
  }
  position.needsUpdate = true
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

const cache = new Map<string, THREE.BufferGeometry>()

/** Shared geometry per (variant, detail): a handful exist for the whole session, never one per meteor. */
export function getMeteorGeometry(variant: number, detail: number): THREE.BufferGeometry {
  const v = ((Math.floor(variant) % METEOR_VARIANTS) + METEOR_VARIANTS) % METEOR_VARIANTS
  const key = `${v}:${detail}`
  let geometry = cache.get(key)
  if (!geometry) {
    geometry = buildMeteorGeometry(v + 1, detail)
    cache.set(key, geometry)
  }
  return geometry
}

export function disposeMeteorGeometries() {
  for (const geometry of cache.values()) geometry.dispose()
  cache.clear()
}

export const meteorGeometryCacheSize = () => cache.size
