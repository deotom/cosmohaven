import type { Triplet } from '@react-three/cannon'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type ReactElement } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { glow } from './glow'
import { getFloorTexture, getScreenTexture } from './textures'
import type { Exposure } from './exposure'
import type { BlockType } from './types'

// ---------- Shared geometry ----------

const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z)
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1)
const UNIT_CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 24)
const UNIT_SPHERE = new THREE.SphereGeometry(1, 16, 12)

const FRAME_THICKNESS = 0.07
const EDGE = 0.5 - FRAME_THICKNESS / 2

/** The 12 edges of the cube as structural beams, merged into one mesh. */
const FRAME = (() => {
  const bars: THREE.BufferGeometry[] = []
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      bars.push(box(1, FRAME_THICKNESS, FRAME_THICKNESS, 0, a * EDGE, b * EDGE))
      bars.push(box(FRAME_THICKNESS, 1, FRAME_THICKNESS, a * EDGE, 0, b * EDGE))
      bars.push(box(FRAME_THICKNESS, FRAME_THICKNESS, 1, a * EDGE, b * EDGE, 0))
    }
  }
  return mergeGeometries(bars)
})()

/** A window frame for the +Z face; the other faces rotate it into place. */
const WINDOW_FRAME = mergeGeometries([
  box(0.9, 0.08, 0.035, 0, 0.41, 0.47),
  box(0.9, 0.08, 0.035, 0, -0.41, 0.47),
  box(0.08, 0.74, 0.035, 0.41, 0, 0.47),
  box(0.08, 0.74, 0.035, -0.41, 0, 0.47),
])
const WINDOW_GLASS = new THREE.PlaneGeometry(0.74, 0.74).translate(0, 0, 0.48)

const SIDE_FACES: { key: 'px' | 'nx' | 'pz' | 'nz'; rotation: Triplet }[] = [
  { key: 'pz', rotation: [0, 0, 0] },
  { key: 'nz', rotation: [0, Math.PI, 0] },
  { key: 'px', rotation: [0, Math.PI / 2, 0] },
  { key: 'nx', rotation: [0, -Math.PI / 2, 0] },
]

// ---------- Shared materials ----------

const METAL = new THREE.MeshStandardMaterial({ color: '#b4bece', metalness: 0.5, roughness: 0.45 })
const DARK_METAL = new THREE.MeshStandardMaterial({ color: '#566175', metalness: 0.5, roughness: 0.5 })
/** Smoked glass: a ceiling you can still see through from above */
const CEILING_GLASS = new THREE.MeshStandardMaterial({ color: '#1b2638', metalness: 0.3, roughness: 0.2, transparent: true, opacity: 0.42, depthWrite: false })
const GLASS = new THREE.MeshStandardMaterial({
  color: '#a8dcff',
  metalness: 0.1,
  roughness: 0.05,
  transparent: true,
  opacity: 0.17,
  side: THREE.DoubleSide,
  depthWrite: false,
})

let floorMaterial: THREE.MeshStandardMaterial | null = null
const floor = () =>
  (floorMaterial ??= new THREE.MeshStandardMaterial({ map: getFloorTexture(), metalness: 0.7, roughness: 0.5 }))

const screenCache = new Map<string, THREE.MeshStandardMaterial>()
function screen(kind: 'console' | 'food' | 'arcade', hue: number, intensity = 1.8) {
  const key = `${kind}-${hue}`
  let material = screenCache.get(key)
  if (!material) {
    const texture = getScreenTexture(kind, hue)
    material = new THREE.MeshStandardMaterial({
      color: '#000000',
      map: texture,
      emissive: '#ffffff',
      emissiveMap: texture,
      emissiveIntensity: intensity,
      toneMapped: false,
    })
    screenCache.set(key, material)
  }
  return material
}

// ---------- Small building helpers ----------

type PartProps = { position?: Triplet; rotation?: Triplet; size: Triplet; material: THREE.Material; shadow?: boolean }

function Box({ position, rotation, size, material, shadow = true }: PartProps) {
  return <mesh geometry={UNIT_BOX} material={material} position={position} rotation={rotation} scale={size} castShadow={shadow} receiveShadow={shadow} />
}

function Cylinder({ position, rotation, size, material, shadow = true }: PartProps) {
  // size = [radius, height, radius]
  return <mesh geometry={UNIT_CYLINDER} material={material} position={position} rotation={rotation} scale={size} castShadow={shadow} receiveShadow={shadow} />
}

function Ball({ position, radius, material }: { position: Triplet; radius: number; material: THREE.Material }) {
  return <mesh geometry={UNIT_SPHERE} material={material} position={position} scale={radius} />
}

// ---------- Props for each block type ----------

const CYAN = '#38e8ff'

/** Ship core: a glowing reactor with orbiting energy rings, flanked by two control consoles. */
function CoreProps() {
  const ringA = useRef<THREE.Mesh>(null)
  const ringB = useRef<THREE.Mesh>(null)
  const core = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (ringA.current) {
      ringA.current.position.y = -0.08 + Math.sin(t * 1.3) * 0.22
      ringA.current.rotation.z = t * 1.5
    }
    if (ringB.current) {
      ringB.current.position.y = -0.08 + Math.sin(t * 1.3 + Math.PI) * 0.22
      ringB.current.rotation.z = -t * 2.1
    }
    const material = core.current?.material as THREE.MeshStandardMaterial | undefined
    if (material) material.emissiveIntensity = 3.2 + Math.sin(t * 5) * 0.5
  })

  return (
    <group>
      <group position={[0, 0, -0.27]}>
        <Cylinder size={[0.2, 0.05, 0.2]} position={[0, -0.43, 0]} material={DARK_METAL} />
        <Cylinder size={[0.15, 0.04, 0.15]} position={[0, 0.43, 0]} material={DARK_METAL} />
        <Cylinder size={[0.12, 0.8, 0.12]} position={[0, 0, 0]} material={GLASS} shadow={false} />
        <mesh ref={core} position={[0, 0, 0]} scale={[0.07, 0.72, 0.07]} geometry={UNIT_CYLINDER}>
          <meshStandardMaterial color="#021014" emissive={CYAN} emissiveIntensity={3.2} toneMapped={false} />
        </mesh>
        <mesh ref={ringA} geometry={RING} material={glow(CYAN, 2.8)} />
        <mesh ref={ringB} geometry={RING} material={glow('#7affc9', 2.8)} />
        <pointLight color={CYAN} intensity={1.6} distance={4} decay={2} />
      </group>

      {/* Two angled control consoles with live screens */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.33, -0.2, -0.05]} rotation={[0, -side * 0.45, 0]}>
          <Box size={[0.1, 0.5, 0.34]} position={[0, 0, 0]} material={DARK_METAL} />
          <Box size={[0.12, 0.05, 0.36]} position={[0, 0.27, 0]} material={METAL} />
          <mesh position={[side * -0.056, 0.1, 0]} rotation={[0, -side * (Math.PI / 2), 0]} material={screen('console', side > 0 ? 0.5 : 0.35)}>
            <planeGeometry args={[0.28, 0.2]} />
          </mesh>
          <Ball position={[side * -0.056, 0.0, 0.1]} radius={0.016} material={glow('#ffd34d', 3)} />
          <Ball position={[side * -0.056, 0.0, -0.1]} radius={0.016} material={glow('#ff5d7a', 3)} />
        </group>
      ))}
    </group>
  )
}

const ARCADE_BODY = new THREE.MeshStandardMaterial({ color: '#2a1238', metalness: 0.5, roughness: 0.4 })
const RING = new THREE.TorusGeometry(0.17, 0.014, 8, 40).rotateX(Math.PI / 2)

/** Food dispenser: a cabinet against the back wall with a glowing menu display, dispensing alcove and tray. */
function FoodProps() {
  return (
    <group position={[0, 0, -0.34]}>
      <Box size={[0.58, 0.8, 0.26]} position={[0, -0.07, 0]} material={DARK_METAL} />
      <Box size={[0.62, 0.06, 0.3]} position={[0, 0.36, 0]} material={METAL} />
      {/* Menu display and indicator lights */}
      <mesh position={[0, 0.12, 0.131]} material={screen('food', 0.33, 2.2)}>
        <planeGeometry args={[0.38, 0.24]} />
      </mesh>
      {[-0.1, 0, 0.1].map((x, i) => (
        <Ball key={x} position={[x, 0.27, 0.133]} radius={0.017} material={glow(['#4dff88', '#ffd34d', '#4dd0ff'][i], 3.5)} />
      ))}
      {/* Dispensing alcove with a green under-glow, and the tray */}
      <Box size={[0.3, 0.16, 0.1]} position={[0, -0.13, 0.095]} material={DARK_METAL} shadow={false} />
      <Box size={[0.26, 0.012, 0.012]} position={[0, -0.055, 0.15]} material={glow('#4dff88', 3.2)} shadow={false} />
      <Box size={[0.34, 0.025, 0.16]} position={[0, -0.235, 0.2]} material={METAL} />
      <Box size={[0.12, 0.05, 0.1]} position={[0.07, -0.205, 0.2]} material={glow('#fff2c4', 1.4)} shadow={false} />
    </group>
  )
}

/** Brightness flicker shared by every arcade screen (they are one material). */
function flickerArcadeScreen(t: number) {
  screen('arcade', 0.8, 2.2).emissiveIntensity = 2.0 + Math.sin(t * 23) * 0.18 + Math.sin(t * 7) * 0.12
}

/** Arcade: a neon-lit cabinet with a pixel-art screen, joystick and buttons. */
function ArcadeProps() {
  useFrame(({ clock }) => flickerArcadeScreen(clock.elapsedTime))

  return (
    <group position={[0, 0, -0.3]}>
      <Box size={[0.44, 0.74, 0.34]} position={[0, -0.1, 0]} material={ARCADE_BODY} />
      {/* Glowing marquee on top */}
      <Box size={[0.44, 0.1, 0.3]} position={[0, 0.32, 0.005]} material={glow('#ff2bd6', 3)} shadow={false} />
      {/* Slanted screen */}
      <mesh position={[0, 0.08, 0.172]} rotation={[-0.22, 0, 0]} material={screen('arcade', 0.8, 2.2)}>
        <planeGeometry args={[0.34, 0.26]} />
      </mesh>
      {/* Control deck with joystick and buttons */}
      <group position={[0, -0.14, 0.2]} rotation={[0.28, 0, 0]}>
        <Box size={[0.44, 0.04, 0.16]} position={[0, 0, 0]} material={DARK_METAL} />
        <Cylinder size={[0.008, 0.07, 0.008]} position={[-0.1, 0.05, 0]} material={METAL} shadow={false} />
        <Ball position={[-0.1, 0.09, 0]} radius={0.022} material={glow('#ff3b3b', 3)} />
        {[0.02, 0.07, 0.12].map((x, i) => (
          <Ball key={x} position={[x, 0.025, 0.01 * (i % 2)]} radius={0.017} material={glow(['#38e8ff', '#ffd34d', '#4dff88'][i], 3.4)} />
        ))}
      </group>
      {/* Neon edge strips */}
      {[-1, 1].map((side) => (
        <Box key={side} size={[0.014, 0.76, 0.014]} position={[side * 0.228, -0.1, 0.172]} material={glow(side > 0 ? '#38e8ff' : '#ff2bd6', 3.2)} shadow={false} />
      ))}
    </group>
  )
}

/** Plain hull room: a wall panel with status lights and a pipe run along the ceiling. */
function HullProps() {
  return (
    <group>
      <Box size={[0.56, 0.34, 0.03]} position={[0, 0.02, -0.455]} material={DARK_METAL} />
      {[-0.18, -0.09, 0].map((x, i) => (
        <Ball key={x} position={[x, 0.06, -0.435]} radius={0.014} material={glow(['#4dff88', '#4dd0ff', '#ffd34d'][i], 3)} />
      ))}
      <Box size={[0.3, 0.03, 0.01]} position={[0.1, -0.06, -0.438]} material={glow('#38e8ff', 1.6)} shadow={false} />
      <Cylinder size={[0.028, 0.9, 0.028]} rotation={[0, 0, Math.PI / 2]} position={[0, 0.4, -0.4]} material={METAL} />
    </group>
  )
}

const PROPS: Record<BlockType, () => ReactElement> = {
  core: CoreProps,
  hull: HullProps,
  food: FoodProps,
  arcade: ArcadeProps,
}

/** Light colour of the ceiling strip, tinted per room type. */
const STRIP: Record<BlockType, string> = { core: '#bff6ff', hull: '#e9f4ff', food: '#d6ffdf', arcade: '#ffd0f4' }

type BlockModelProps = { type: BlockType; exposed: Exposure }

/**
 * One ship room: a structural frame, a tiled metal floor and a lit ceiling where the room meets open
 * space, glass windows on exposed sides, and the props for its type. Walls shared with a neighbouring
 * block are left open so rooms connect.
 */
export function BlockModel({ type, exposed }: BlockModelProps) {
  const Props = PROPS[type]
  const stripMaterial = useMemo(() => glow(STRIP[type], 2.4), [type])

  return (
    <group>
      <mesh geometry={FRAME} material={METAL} castShadow receiveShadow />

      {/* Ceiling with a light strip when the top is exposed; floor plating when the bottom is */}
      {exposed.py && (
        <>
          <Box size={[0.94, 0.03, 0.94]} position={[0, 0.485, 0]} material={CEILING_GLASS} shadow={false} />
          <Box size={[0.5, 0.012, 0.12]} position={[0, 0.455, 0]} material={stripMaterial} shadow={false} />
        </>
      )}
      {exposed.ny && <Box size={[0.96, 0.05, 0.96]} position={[0, -0.475, 0]} material={floor()} />}

      {SIDE_FACES.map(
        ({ key, rotation }) =>
          exposed[key] && (
            <group key={key} rotation={rotation}>
              <mesh geometry={WINDOW_FRAME} material={DARK_METAL} castShadow />
              <mesh geometry={WINDOW_GLASS} material={GLASS} />
            </group>
          ),
      )}

      <Props />
    </group>
  )
}
