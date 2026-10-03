import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { mulberry32 } from './rng'
import { shipState } from './shipState'

const PARTICLES = 140
const TRAIL = 12 // how far behind the ship a streak reaches, in units
const FORWARD = new THREE.Vector3(0, 0, 1)

// A cone of fire: base at the origin, tip trailing along +Z, so it can be pointed away from the direction of travel
const PLASMA = new THREE.ConeGeometry(1, 1, 20, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2)
const PLASMA_MATERIAL = new THREE.MeshBasicMaterial({
  color: new THREE.Color(3.4, 1.2, 0.3),
  transparent: true,
  opacity: 0.6,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
  side: THREE.DoubleSide,
})
const SPARK_MATERIAL = new THREE.PointsMaterial({
  color: new THREE.Color(4, 1.8, 0.5),
  size: 0.3,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
})

type Sparks = { ages: Float32Array; offsets: Float32Array; geometry: THREE.BufferGeometry }

/** Sparks stream backwards in the group's local space (+Z is behind); each is recycled when it reaches the end of the trail. */
function stepSparks(sparks: Sparks, heat: number, dt: number) {
  const positions = sparks.geometry.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < PARTICLES; i++) {
    sparks.ages[i] += dt * (0.9 + heat)
    if (sparks.ages[i] > 1) {
      sparks.ages[i] = 0
      sparks.offsets[i * 2] = (Math.random() - 0.5) * 2
      sparks.offsets[i * 2 + 1] = (Math.random() - 0.5) * 2
    }
    const age = sparks.ages[i]
    positions.setXYZ(i, sparks.offsets[i * 2] * (0.8 + age * 2.5), sparks.offsets[i * 2 + 1] * (0.8 + age * 2.5), age * TRAIL * (0.4 + heat))
  }
  positions.needsUpdate = true
}

/**
 * Atmospheric re-entry: a glowing plasma sheath and a stream of sparks trailing behind the ship, strongest
 * deep in the atmosphere at speed. Nothing renders when the heat is low.
 */
export function ReentryEffects({ shipPosition }: { shipPosition: RefObject<THREE.Vector3> }) {
  const group = useRef<THREE.Group>(null)
  const plasma = useRef<THREE.Mesh>(null)
  const light = useRef<THREE.PointLight>(null)
  const direction = useMemo(() => new THREE.Vector3(), [])

  // Each spark has an age (0-1) and a sideways offset; it streams from the ship to the end of the trail
  const sparks = useMemo(() => {
    const rand = mulberry32(7)
    const ages = new Float32Array(PARTICLES)
    const offsets = new Float32Array(PARTICLES * 2)
    for (let i = 0; i < PARTICLES; i++) {
      ages[i] = rand()
      offsets[i * 2] = (rand() - 0.5) * 2
      offsets[i * 2 + 1] = (rand() - 0.5) * 2
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PARTICLES * 3), 3))
    return { ages, offsets, geometry }
  }, [])

  useFrame((_, dt) => {
    const g = group.current
    if (!g) return
    const heat = shipState.heat
    g.visible = heat > 0.05
    if (!g.visible) return

    g.position.copy(shipPosition.current)
    // Point the plume away from where the ship is going
    direction.copy(shipState.velocity)
    if (direction.lengthSq() > 1e-4) {
      direction.normalize().multiplyScalar(-1)
      g.quaternion.setFromUnitVectors(FORWARD, direction)
    }

    if (plasma.current) {
      const flicker = 1 + Math.sin(performance.now() * 0.05) * 0.1
      plasma.current.scale.set(2.2 * (0.5 + heat), 2.2 * (0.5 + heat), TRAIL * heat * flicker)
    }
    if (light.current) light.current.intensity = 400 * heat

    stepSparks(sparks, heat, dt)
  })

  return (
    <group ref={group} visible={false}>
      <mesh ref={plasma} geometry={PLASMA} material={PLASMA_MATERIAL} />
      <points geometry={sparks.geometry} material={SPARK_MATERIAL} frustumCulled={false} />
      <pointLight ref={light} color="#ff8a3d" distance={30} decay={2} />
    </group>
  )
}
