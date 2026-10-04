import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { MAX_PROPS, PROPS_RANGE, propsAround } from './surfaceDetail'
import { shipState } from './shipState'
import type { PlanetSpec } from './sector'

const REBUILD_DISTANCE = 15 // re-pick the rocks once the ship has moved this far along the ground
const UP = new THREE.Vector3(0, 1, 0)

/**
 * Loose rocks (or ice blocks) scattered on the ground near the ship, so the surface has things to judge speed and
 * height by. Placement is a pure function of the planet's name and the cell, capped at MAX_PROPS, and visual only:
 * there is no collider. The planet's group does not rotate, so props stay put under the landed ship.
 */
export function GroundProps({ body, ice }: { body: PlanetSpec; ice: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const last = useRef<THREE.Vector3 | null>(null)
  const scratch = useMemo(() => ({ dir: new THREE.Vector3(), normal: new THREE.Vector3(), q: new THREE.Quaternion(), yaw: new THREE.Quaternion(), m: new THREE.Matrix4(), s: new THREE.Vector3(), p: new THREE.Vector3(), c: new THREE.Color() }), [])
  const geometry = useMemo(() => new THREE.IcosahedronGeometry(1, 0), [])
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#ffffff',
        emissive: ice ? '#2a4a6a' : '#000000',
        roughness: ice ? 0.35 : 0.95,
        flatShading: true,
      }),
    [ice],
  )
  const baseColor = useMemo(() => (ice ? new THREE.Color(body.color).lerp(new THREE.Color('#e6f4ff'), 0.7) : new THREE.Color(body.color).multiplyScalar(0.55)), [body.color, ice])

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  useFrame(() => {
    const target = mesh.current
    if (!target) return
    const { dir, normal, q, yaw, m, s, p, c } = scratch
    dir.set(shipState.position.x - body.position[0], shipState.position.y - body.position[1], shipState.position.z - body.position[2])
    const length = dir.length()
    if (length < 1e-6) return
    dir.multiplyScalar(1 / length)
    if (last.current && last.current.angleTo(dir) * body.radius < REBUILD_DISTANCE) return
    last.current = (last.current ?? new THREE.Vector3()).copy(dir)

    const props = propsAround(body.name, body.radius, [dir.x, dir.y, dir.z], PROPS_RANGE, MAX_PROPS)
    props.forEach((prop, i) => {
      normal.set(prop.dir[0], prop.dir[1], prop.dir[2])
      q.setFromUnitVectors(UP, normal)
      yaw.setFromAxisAngle(UP, prop.yaw)
      q.multiply(yaw)
      const flat = prop.shape === 0 ? 0.55 : prop.shape === 1 ? 1.35 : 0.9
      s.set(prop.size * (prop.shape === 2 ? 1.1 : 1), prop.size * flat, prop.size)
      p.copy(normal).multiplyScalar(body.radius - prop.size * 0.25)
      m.compose(p, q, s)
      target.setMatrixAt(i, m)
      c.copy(baseColor).multiplyScalar(0.7 + prop.tint * 0.6)
      target.setColorAt(i, c)
    })
    target.count = props.length
    target.instanceMatrix.needsUpdate = true
    if (target.instanceColor) target.instanceColor.needsUpdate = true
  })

  return <instancedMesh ref={mesh} args={[geometry, material, MAX_PROPS]} frustumCulled={false} count={0} />
}
