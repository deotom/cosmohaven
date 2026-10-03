import { useSphere } from '@react-three/cannon'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { gameStats } from './gameState'
import { Atmosphere } from './Atmosphere'
import { mulberry32 } from './rng'
import type { PlanetSpec } from './sector'
import { targetHandlers } from './targetScreen'
import { createCloudTexture } from './textures'
import { planetRef } from './targets'

/** Paints oceans, continents and polar caps onto an equirectangular canvas. */
function createSurfaceTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 512
  const ctx = canvas.getContext('2d')!
  const rand = mulberry32(2050)

  const ocean = ctx.createLinearGradient(0, 0, 0, canvas.height)
  ocean.addColorStop(0, '#2a6fb5')
  ocean.addColorStop(0.5, '#1654a0')
  ocean.addColorStop(1, '#2a6fb5')
  ctx.fillStyle = ocean
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Continents: clusters of overlapping blobs, drawn at three x offsets so they wrap seamlessly
  for (let c = 0; c < 9; c++) {
    const cx = rand() * canvas.width
    const cy = 90 + rand() * 330
    for (let i = 0; i < 28; i++) {
      const x = cx + (rand() - 0.5) * 190
      const y = cy + (rand() - 0.5) * 110
      const r = 14 + rand() * 38
      ctx.fillStyle = rand() < 0.3 ? '#8fb85a' : rand() < 0.5 ? '#3f9a4a' : '#2e7d3c'
      for (const dx of [-canvas.width, 0, canvas.width]) {
        ctx.beginPath()
        ctx.arc(x + dx, y, r, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.fillRect(0, 0, canvas.width, 22)
  ctx.fillRect(0, canvas.height - 22, canvas.width, 22)

  // Wispy clouds
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  for (let i = 0; i < 160; i++) {
    ctx.beginPath()
    ctx.ellipse(rand() * canvas.width, rand() * canvas.height, 20 + rand() * 60, 3 + rand() * 7, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/**
 * The destination planet. It is solid: touching down on it gently (under 12 u/s) wins the game, and the
 * HUD counts down the altitude to its surface.
 */
export function Earth({ body, shipPosition }: { body: PlanetSpec; shipPosition: RefObject<THREE.Vector3> }) {
  useSphere(() => ({ type: 'Static', args: [body.radius], position: body.position }))
  const planet = useRef<THREE.Mesh>(null)
  const cloudLayer = useRef<THREE.Mesh>(null)
  const texture = useMemo(() => createSurfaceTexture(), [])
  const clouds = useMemo(() => createCloudTexture(2050, 0.5), [])
  const center = useMemo(() => new THREE.Vector3(...body.position), [body])

  useFrame((_, dt) => {
    if (planet.current) planet.current.rotation.y += dt * 0.02
    if (cloudLayer.current) cloudLayer.current.rotation.y += dt * 0.032 // clouds drift faster than the ground
    if (gameStats.victory) return
    gameStats.distanceToEarth = Math.max(0, shipPosition.current.distanceTo(center) - body.radius)
  })

  return (
    <group position={body.position}>
      <mesh ref={planet} receiveShadow {...targetHandlers(planetRef(body.name))}>
        <sphereGeometry args={[body.radius, 96, 96]} />
        <meshStandardMaterial map={texture} emissiveMap={texture} emissive="#ffffff" emissiveIntensity={0.22} roughness={0.75} />
      </mesh>
      <mesh ref={cloudLayer}>
        <sphereGeometry args={[body.radius * 1.008, 96, 64]} />
        <meshStandardMaterial map={clouds} transparent depthWrite={false} roughness={1} />
      </mesh>
      <Atmosphere radius={body.radius} color="#6cb8ff" scale={1.12} power={2.4} intensity={3} />
      <pointLight intensity={1500000} distance={2500} color="#9fd4ff" />
    </group>
  )
}
