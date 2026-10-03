import { useSphere } from '@react-three/cannon'
import type * as THREE from 'three'
import type { AsteroidSpec } from './sector'

function Asteroid({ position, radius, spin }: AsteroidSpec) {
  const [ref] = useSphere<THREE.Mesh>(() => ({
    mass: radius ** 3 * 2,
    args: [radius],
    position,
    angularVelocity: spin,
    linearDamping: 0.05,
    angularDamping: 0.05,
  }))

  return (
    <mesh ref={ref} castShadow receiveShadow>
      <icosahedronGeometry args={[radius, 0]} />
      <meshStandardMaterial color="#6b5d52" roughness={0.95} flatShading />
    </mesh>
  )
}

/** The sector's free-floating physics rocks, to give a sense of motion and something to bump into. */
export function Asteroids({ field }: { field: readonly AsteroidSpec[] }) {
  return (
    <>
      {field.map((a, i) => (
        <Asteroid key={i} {...a} />
      ))}
    </>
  )
}
