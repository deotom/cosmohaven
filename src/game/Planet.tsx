import { useSphere } from '@react-three/cannon'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Atmosphere } from './Atmosphere'
import type { PlanetSpec } from './sector'
import { targetHandlers } from './targetScreen'
import { planetRef } from './targets'
import { createCloudTexture, createPlanetTextures, createRingTexture, radialRingUVs, type PlanetKind } from './textures'

function hashString(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Decides what a planet looks like from its name, so a given planet always looks the same. */
function planetLook(body: PlanetSpec) {
  const hash = hashString(body.name)
  const roll = (hash % 1000) / 1000
  const kind: PlanetKind = roll < 0.3 ? 'gas' : roll < 0.7 ? 'rocky' : 'ice'
  return {
    kind,
    seed: hash % 100000,
    clouds: kind !== 'gas' && (hash >> 3) % 10 < 7,
    ring: kind === 'gas' ? (hash >> 5) % 10 < 6 : (hash >> 5) % 10 < 1,
    ringTilt: 0.25 + ((hash >> 7) % 100) / 100 * 0.6,
  }
}

const RING_INNER = 1.4
const RING_OUTER = 2.4

/**
 * A solid planet with a procedural surface, rotating clouds, an optional ring system and a glowing
 * Fresnel atmosphere. The static collider means flying into the surface is a crash.
 */
export function Planet({ body }: { body: PlanetSpec }) {
  useSphere(() => ({ type: 'Static', args: [body.radius], position: body.position }))

  const look = useMemo(() => planetLook(body), [body])
  const surface = useMemo(() => createPlanetTextures(look.kind, look.seed, body.color), [look, body.color])
  const clouds = useMemo(() => (look.clouds ? createCloudTexture(look.seed, look.kind === 'ice' ? 0.45 : 0.55) : null), [look])
  const ring = useMemo(() => {
    if (!look.ring) return null
    const geometry = new THREE.RingGeometry(body.radius * RING_INNER, body.radius * RING_OUTER, 128, 1)
    radialRingUVs(geometry, body.radius * RING_INNER, body.radius * RING_OUTER)
    return { geometry, texture: createRingTexture(look.seed, body.color) }
  }, [look, body.radius, body.color])
  const glow = useMemo(() => `#${new THREE.Color(body.color).lerp(new THREE.Color('#8fc8ff'), 0.45).getHexString()}`, [body.color])

  // Free the GPU textures when the ship folds away
  useEffect(
    () => () => {
      surface.map.dispose()
      surface.bump?.dispose()
      clouds?.dispose()
      ring?.texture.dispose()
      ring?.geometry.dispose()
    },
    [surface, clouds, ring],
  )

  const planet = useRef<THREE.Mesh>(null)
  const cloudLayer = useRef<THREE.Mesh>(null)
  useFrame((_, dt) => {
    if (planet.current) planet.current.rotation.y += dt * 0.012
    if (cloudLayer.current) cloudLayer.current.rotation.y += dt * 0.02
  })

  return (
    <group position={body.position}>
      <mesh ref={planet} receiveShadow {...targetHandlers(planetRef(body.name))}>
        <sphereGeometry args={[body.radius, 96, 64]} />
        <meshStandardMaterial
          map={surface.map}
          bumpMap={surface.bump ?? undefined}
          bumpScale={body.radius * 0.02}
          roughness={look.kind === 'ice' ? 0.55 : 0.92}
          metalness={0}
          emissive={body.emissive}
          emissiveIntensity={0.7}
        />
      </mesh>

      {clouds && (
        <mesh ref={cloudLayer}>
          <sphereGeometry args={[body.radius * 1.012, 80, 56]} />
          <meshStandardMaterial map={clouds} transparent depthWrite={false} roughness={1} />
        </mesh>
      )}

      {ring && (
        <mesh geometry={ring.geometry} rotation={[Math.PI / 2 - look.ringTilt, 0.3, 0]}>
          <meshStandardMaterial
            map={ring.texture}
            emissiveMap={ring.texture}
            emissive="#ffffff"
            emissiveIntensity={0.25}
            transparent
            side={THREE.DoubleSide}
            depthWrite={false}
            roughness={0.9}
          />
        </mesh>
      )}

      <Atmosphere radius={body.radius} color={glow} scale={look.kind === 'gas' ? 1.06 : 1.1} intensity={look.kind === 'gas' ? 1.4 : 2.2} />
    </group>
  )
}
