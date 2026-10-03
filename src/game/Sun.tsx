import { useFrame } from '@react-three/fiber'
import { useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { sunColor, sunDirection } from './sunState'

const SUN_DISTANCE = 4000
const SHADOW_EXTENT = 22 // the shadow camera covers this much around the ship in every direction
const LIGHT_DISTANCE = 70

/** The sun as seen in the sky: a blazing disc and a soft corona. Place it inside the camera-following group. */
export function SunDisc() {
  const group = useRef<THREE.Group>(null)

  useFrame(() => {
    group.current?.position.copy(sunDirection).multiplyScalar(SUN_DISTANCE)
    group.current?.lookAt(0, 0, 0)
  })

  return (
    <group ref={group}>
      {/* Colours above 1 are what the bloom pass turns into a glare */}
      <mesh raycast={() => null}>
        <sphereGeometry args={[110, 32, 24]} />
        <meshBasicMaterial color={[6, 5, 3.4]} toneMapped={false} />
      </mesh>
      <mesh raycast={() => null}>
        <sphereGeometry args={[210, 32, 24]} />
        <meshBasicMaterial color={[1.3, 0.85, 0.4]} transparent opacity={0.28} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  )
}

/**
 * The sun's light: a directional light with shadows. Its shadow camera is tight around the ship, so
 * the light follows the ship, always coming from the same direction.
 */
export function SunLight({ target }: { target: RefObject<THREE.Vector3> }) {
  const light = useRef<THREE.DirectionalLight>(null)

  useFrame(() => {
    const l = light.current
    if (!l) return
    const p = target.current
    l.position.copy(p).addScaledVector(sunDirection, LIGHT_DISTANCE)
    l.target.position.copy(p)
    l.target.updateMatrixWorld()
    l.color.copy(sunColor)
  })

  return (
    <directionalLight
      ref={light}
      intensity={2.6}
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-SHADOW_EXTENT}
      shadow-camera-right={SHADOW_EXTENT}
      shadow-camera-top={SHADOW_EXTENT}
      shadow-camera-bottom={-SHADOW_EXTENT}
      shadow-camera-near={1}
      shadow-camera-far={LIGHT_DISTANCE * 2}
      shadow-bias={-0.0004}
      shadow-normalBias={0.03}
    />
  )
}
