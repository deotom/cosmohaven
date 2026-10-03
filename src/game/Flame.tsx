import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { gameStats } from './gameState'

// Base at the origin, tip along +Z (the ship's tail), so scaling Z stretches the plume
const PLUME = new THREE.ConeGeometry(1, 1, 18, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2)
const NOZZLE = new THREE.CylinderGeometry(0.17, 0.24, 0.16, 20, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.07)
const NOZZLE_MATERIAL = new THREE.MeshStandardMaterial({ color: '#3a414d', metalness: 0.9, roughness: 0.35, side: THREE.DoubleSide })

/** Colours above 1 so the bloom pass makes the plume glow */
const OUTER = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.1, 0.25), transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide })
const INNER = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 3.2, 4.5), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide })

const MAX_LENGTH = 2.4

/**
 * An engine nozzle on a rear-facing hull face, with a flickering exhaust plume that grows with the
 * ship's main-engine throttle. Place it at the centre of the face it points out of.
 */
export function Engine({ position }: { position: [number, number, number] }) {
  const outer = useRef<THREE.Mesh>(null)
  const inner = useRef<THREE.Mesh>(null)
  const level = useRef(0)

  useFrame(({ clock }, dt) => {
    // Ease towards the throttle so the plume swells and dies away instead of snapping
    const target = gameStats.thrustLevel
    level.current += (target - level.current) * Math.min(1, dt * 10)
    const l = level.current
    const flicker = 1 + Math.sin(clock.elapsedTime * 38) * 0.08 + Math.sin(clock.elapsedTime * 23) * 0.06
    for (const [mesh, length, width] of [
      [outer.current, MAX_LENGTH, 0.2],
      [inner.current, MAX_LENGTH * 0.55, 0.11],
    ] as const) {
      if (!mesh) continue
      mesh.visible = l > 0.02
      mesh.scale.set(width * (0.6 + 0.4 * l), width * (0.6 + 0.4 * l), length * l * flicker)
    }
  })

  return (
    <group position={position}>
      <mesh geometry={NOZZLE} material={NOZZLE_MATERIAL} castShadow />
      <mesh ref={outer} geometry={PLUME} material={OUTER} visible={false} />
      <mesh ref={inner} geometry={PLUME} material={INNER} visible={false} />
    </group>
  )
}
