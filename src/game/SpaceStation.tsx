import type { Triplet } from '@react-three/cannon'
import { useCompoundBody } from '@react-three/cannon'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { construction } from './dock'
import { glow } from './glow'
import { BAY, RING_RADIUS, RING_Z, SLOT_LOCAL, SPINE_LENGTH, WALL, stationCollisionShapes, type StationSpec } from './station'
import { targetHandlers } from './targetScreen'
import { stationRef } from './targets'
import { getGridTexture, getHazardTexture } from './textures'

// ---------- Layout (station-local units; the hangar opens towards +Z) ----------

const HALF_W = BAY.width / 2
const HALF_H = BAY.height / 2

const HULL = new THREE.MeshStandardMaterial({ color: '#6f7a8c', metalness: 0.45, roughness: 0.55 })
const DARK = new THREE.MeshStandardMaterial({ color: '#3a4352', metalness: 0.5, roughness: 0.55 })
const CYAN = '#38e8ff'
const ORANGE = '#ff9a2b'

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1)
const UNIT_CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 24)
const UNIT_SPHERE = new THREE.SphereGeometry(1, 20, 14)

type PartProps = { position?: Triplet; rotation?: Triplet; size: Triplet; material: THREE.Material; shadow?: boolean }

function Box({ position, rotation, size, material, shadow = true }: PartProps) {
  return <mesh geometry={UNIT_BOX} material={material} position={position} rotation={rotation} scale={size} castShadow={shadow} receiveShadow={shadow} />
}

function Ball({ position, radius, material }: { position: Triplet; radius: number; material: THREE.Material }) {
  return <mesh geometry={UNIT_SPHERE} material={material} position={position} scale={radius} />
}

// ---------- Hangar ----------

/** A translucent holographic grid on a surface, so the drydock reads as a place where things get designed. */
function GridPlane({ size, position, rotation, repeat, color, opacity }: { size: [number, number]; position: Triplet; rotation: Triplet; repeat: [number, number]; color: [number, number, number]; opacity: number }) {
  const texture = useMemo(() => getGridTexture(repeat[0], repeat[1]), [repeat])
  return (
    <mesh position={position} rotation={rotation} raycast={() => null}>
      <planeGeometry args={size} />
      <meshBasicMaterial map={texture} color={color} transparent opacity={opacity} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
    </mesh>
  )
}

function Hangar() {
  const hazard = useMemo(() => getHazardTexture(), [])
  const lamp = useRef<THREE.Group>(null)

  useFrame(({ clock }) => {
    // The guide lights along the floor chase towards the back of the bay
    lamp.current?.children.forEach((child, i) => {
      const mesh = child as THREE.Mesh
      const on = Math.sin(clock.elapsedTime * 3 - i * 0.7) > 0.2
      mesh.visible = on
    })
  })

  const guideLights = useMemo(() => {
    const lights: Triplet[] = []
    for (let i = 0; i < 9; i++) for (const x of [-4.5, 4.5]) lights.push([x, -HALF_H + 0.04, -2.5 - i * 3])
    return lights
  }, [])

  return (
    <group>
      {/* Shell: floor, ceiling, side walls and the back wall */}
      <Box size={[BAY.width + WALL * 2, WALL, BAY.depth + WALL]} position={[0, -HALF_H - WALL / 2, -BAY.depth / 2 - WALL / 2 + 0.01]} material={HULL} />
      <Box size={[BAY.width + WALL * 2, WALL, BAY.depth + WALL]} position={[0, HALF_H + WALL / 2, -BAY.depth / 2 - WALL / 2 + 0.01]} material={HULL} />
      {[-1, 1].map((side) => (
        <Box key={side} size={[WALL, BAY.height + WALL * 2, BAY.depth + WALL]} position={[side * (HALF_W + WALL / 2), 0, -BAY.depth / 2 - WALL / 2 + 0.01]} material={HULL} />
      ))}
      <Box size={[BAY.width + WALL * 2, BAY.height + WALL * 2, WALL]} position={[0, 0, -BAY.depth - WALL / 2]} material={DARK} />

      {/* Glowing frame around the entrance */}
      <Box size={[BAY.width + WALL * 2, 0.7, 0.7]} position={[0, HALF_H + 0.4, 0.2]} material={glow(CYAN, 2.6)} shadow={false} />
      <Box size={[BAY.width + WALL * 2, 0.7, 0.7]} position={[0, -HALF_H - 0.4, 0.2]} material={glow(CYAN, 2.6)} shadow={false} />
      {[-1, 1].map((side) => (
        <Box key={side} size={[0.7, BAY.height + 1.8, 0.7]} position={[side * (HALF_W + 0.4), 0, 0.2]} material={glow(CYAN, 2.6)} shadow={false} />
      ))}

      {/* Hazard stripes across the threshold */}
      <mesh position={[0, -HALF_H + 0.03, -1.4]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[BAY.width, 1.6]} />
        <meshBasicMaterial map={hazard} toneMapped={false} />
      </mesh>

      {/* Ceiling light bars and the chasing floor guide lights */}
      {[-6, -15, -24].map((z) => (
        <Box key={z} size={[BAY.width - 4, 0.22, 1.4]} position={[0, HALF_H - 0.12, z]} material={glow('#e9f6ff', 2.4)} shadow={false} />
      ))}
      <group ref={lamp}>
        {guideLights.map((position, i) => (
          <mesh key={i} geometry={UNIT_BOX} material={glow(ORANGE, 3.2)} position={position} scale={[0.35, 0.06, 1.3]} />
        ))}
      </group>
      <pointLight position={[0, HALF_H - 2, -8]} color="#dff4ff" intensity={150} distance={34} decay={2} />
      <pointLight position={[0, HALF_H - 2, -22]} color="#ffd9a8" intensity={120} distance={34} decay={2} />

      {/* The docking cradle: a glowing ring on the floor beneath the ship, with four clamp pylons */}
      <group position={[SLOT_LOCAL[0], -HALF_H + 0.06, SLOT_LOCAL[2]]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={glow(ORANGE, 2.8)} raycast={() => null}>
          <torusGeometry args={[5.2, 0.12, 8, 64]} />
        </mesh>
        {[-1, 1].flatMap((x) => [-1, 1].map((z) => [x, z] as const)).map(([x, z]) => (
          <group key={`${x}${z}`} position={[x * 4.2, 0, z * 4.2]}>
            <Box size={[0.9, 1.2, 0.9]} position={[0, 0.6, 0]} material={DARK} />
            <Ball position={[0, 1.35, 0]} radius={0.22} material={glow(CYAN, 3.4)} />
          </group>
        ))}
      </group>

      {/* Holographic gridlines on the floor and walls */}
      <GridPlane size={[BAY.width, BAY.depth]} position={[0, -HALF_H + 0.03, -BAY.depth / 2]} rotation={[-Math.PI / 2, 0, 0]} repeat={[BAY.width / 3, BAY.depth / 3]} color={[0.15, 0.7, 0.9]} opacity={0.22} />
      <GridPlane size={[BAY.depth, BAY.height]} position={[-HALF_W + 0.03, 0, -BAY.depth / 2]} rotation={[0, Math.PI / 2, 0]} repeat={[BAY.depth / 3, BAY.height / 3]} color={[0.12, 0.55, 0.8]} opacity={0.1} />
      <GridPlane size={[BAY.depth, BAY.height]} position={[HALF_W - 0.03, 0, -BAY.depth / 2]} rotation={[0, -Math.PI / 2, 0]} repeat={[BAY.depth / 3, BAY.height / 3]} color={[0.12, 0.55, 0.8]} opacity={0.1} />
      <GridPlane size={[BAY.width, BAY.height]} position={[0, 0, -BAY.depth + 0.03]} rotation={[0, 0, 0]} repeat={[BAY.width / 3, BAY.height / 3]} color={[0.12, 0.55, 0.8]} opacity={0.1} />
    </group>
  )
}

// ---------- Robotic arms and drones ----------

const ARM_BASES: { position: Triplet; phase: number }[] = [
  { position: [-HALF_W + 0.4, HALF_H - 2, -9], phase: 0 },
  { position: [-HALF_W + 0.4, HALF_H - 2, -19], phase: 1.7 },
  { position: [HALF_W - 0.4, HALF_H - 2, -9], phase: 3.1 },
  { position: [HALF_W - 0.4, HALF_H - 2, -19], phase: 4.4 },
]
const SEGMENT_1 = 5.5
const SEGMENT_2 = 5

/**
 * A ceiling-mounted robotic arm. It points at whatever the shipyard is working on, or sways gently
 * over the docked ship when idle, reaching less far the closer its target is.
 */
function RoboticArm({ position, phase }: { position: Triplet; phase: number }) {
  const aim = useRef<THREE.Group>(null)
  const segment1 = useRef<THREE.Mesh>(null)
  const elbow = useRef<THREE.Group>(null)
  const segment2 = useRef<THREE.Mesh>(null)
  const wrist = useRef<THREE.Group>(null)
  const clawA = useRef<THREE.Mesh>(null)
  const clawB = useRef<THREE.Mesh>(null)
  const tip = useRef<THREE.Mesh>(null)
  const target = useMemo(() => new THREE.Vector3(), [])
  const origin = useMemo(() => new THREE.Vector3(), [])

  useFrame(({ clock }) => {
    const base = aim.current
    if (!base?.parent) return
    const t = clock.elapsedTime + phase

    if (construction.active) {
      target.copy(construction.position)
    } else {
      target.set(SLOT_LOCAL[0] + Math.sin(t * 0.6) * 2.5, SLOT_LOCAL[1] + Math.sin(t * 0.9) * 1.5, SLOT_LOCAL[2] + Math.cos(t * 0.5) * 3)
      base.parent.localToWorld(target)
    }
    base.lookAt(target)
    const reach = THREE.MathUtils.clamp((base.getWorldPosition(origin).distanceTo(target) - 1.8) / (SEGMENT_1 + SEGMENT_2), 0.3, 1)

    if (segment1.current) {
      segment1.current.scale.z = SEGMENT_1 * reach
      segment1.current.position.z = (SEGMENT_1 * reach) / 2
    }
    if (elbow.current) {
      elbow.current.position.z = SEGMENT_1 * reach
      elbow.current.rotation.x = 0.35 + Math.sin(t * 1.3) * 0.25
    }
    if (segment2.current) {
      segment2.current.scale.z = SEGMENT_2 * reach
      segment2.current.position.z = (SEGMENT_2 * reach) / 2
    }
    if (wrist.current) wrist.current.position.z = SEGMENT_2 * reach
    const open = construction.active ? 0.15 + Math.abs(Math.sin(t * 6)) * 0.2 : 0.3 + Math.sin(t * 1.7) * 0.15
    if (clawA.current) clawA.current.position.x = 0.2 + open
    if (clawB.current) clawB.current.position.x = -0.2 - open
    if (tip.current) tip.current.visible = construction.active
  })

  return (
    <group position={position}>
      <mesh geometry={UNIT_CYLINDER} material={DARK} scale={[0.9, 0.6, 0.9]} />
      <group ref={aim}>
        <Ball position={[0, 0, 0]} radius={0.6} material={HULL} />
        <mesh ref={segment1} geometry={UNIT_BOX} material={HULL} scale={[0.55, 0.55, SEGMENT_1]} castShadow />
        <group ref={elbow}>
          <Ball position={[0, 0, 0]} radius={0.45} material={DARK} />
          <mesh ref={segment2} geometry={UNIT_BOX} material={HULL} scale={[0.4, 0.4, SEGMENT_2]} castShadow />
          <group ref={wrist}>
            <Ball position={[0, 0, 0]} radius={0.32} material={DARK} />
            <mesh ref={clawA} geometry={UNIT_BOX} material={DARK} position={[0.35, 0, 0.35]} scale={[0.14, 0.4, 0.7]} />
            <mesh ref={clawB} geometry={UNIT_BOX} material={DARK} position={[-0.35, 0, 0.35]} scale={[0.14, 0.4, 0.7]} />
            {/* A welding spark when it is working */}
            <mesh ref={tip} geometry={UNIT_SPHERE} material={glow('#ffb347', 6)} position={[0, 0, 0.8]} scale={0.16} visible={false} />
          </group>
        </group>
      </group>
    </group>
  )
}

const DRONE_COUNT = 4
const BEAM = new THREE.CylinderGeometry(0.05, 0.05, 1, 6, 1, true)
const UP = new THREE.Vector3(0, 1, 0)

/** Small maintenance drones: they patrol around the docked ship and swarm the block being built, beaming it into existence. */
function Drones() {
  const drones = useRef<(THREE.Group | null)[]>([])
  const beams = useRef<(THREE.Mesh | null)[]>([])
  const ring = useRef<(THREE.Mesh | null)[]>([])
  const wanted = useMemo(() => new THREE.Vector3(), [])
  const aimAt = useMemo(() => new THREE.Vector3(), [])
  const direction = useMemo(() => new THREE.Vector3(), [])
  const parentRef = useRef<THREE.Group>(null)

  useFrame(({ clock }, dt) => {
    const parent = parentRef.current
    if (!parent) return
    const t = clock.elapsedTime
    for (let i = 0; i < DRONE_COUNT; i++) {
      const drone = drones.current[i]
      if (!drone) continue
      const phase = (i / DRONE_COUNT) * Math.PI * 2
      if (construction.active) {
        // Swarm: circle the block being built
        aimAt.copy(construction.position)
        parent.worldToLocal(aimAt)
        wanted.set(aimAt.x + Math.cos(t * 1.8 + phase) * 2.6, aimAt.y + Math.sin(t * 2.3 + phase) * 1.4 + 1, aimAt.z + Math.sin(t * 1.8 + phase) * 2.6)
      } else {
        // Patrol: slow loops around the ship
        const radius = 7 + Math.sin(t * 0.4 + phase) * 1.5
        wanted.set(SLOT_LOCAL[0] + Math.cos(t * 0.35 + phase) * radius, SLOT_LOCAL[1] + 1 + Math.sin(t * 0.6 + phase * 2) * 3, SLOT_LOCAL[2] + Math.sin(t * 0.35 + phase) * radius)
      }
      drone.position.lerp(wanted, 1 - Math.exp(-2.5 * Math.min(dt, 0.1)))
      drone.rotation.y = t * 0.5 + phase

      const spin = ring.current[i]
      if (spin) spin.rotation.z = t * 9

      // The construction beam from the drone to the block
      const beam = beams.current[i]
      if (beam) {
        beam.visible = construction.active
        if (construction.active) {
          direction.copy(aimAt).sub(drone.position)
          const length = direction.length()
          beam.position.copy(drone.position).addScaledVector(direction, 0.5)
          beam.quaternion.setFromUnitVectors(UP, direction.divideScalar(length || 1))
          beam.scale.set(1 + Math.sin(t * 30 + i) * 0.4, length, 1 + Math.sin(t * 30 + i) * 0.4)
        }
      }
    }
  })

  return (
    <group ref={parentRef}>
      {Array.from({ length: DRONE_COUNT }, (_, i) => (
        <group key={i}>
          <group ref={(el) => void (drones.current[i] = el)} position={[0, 2, -10]}>
            <Ball position={[0, 0, 0]} radius={0.38} material={HULL} />
            <Ball position={[0, 0, 0.3]} radius={0.14} material={glow(CYAN, 5)} />
            <mesh ref={(el) => void (ring.current[i] = el)} material={DARK}>
              <torusGeometry args={[0.6, 0.05, 6, 24]} />
            </mesh>
          </group>
          <mesh ref={(el) => void (beams.current[i] = el)} geometry={BEAM} material={glow(ORANGE, 5)} visible={false} />
        </group>
      ))}
    </group>
  )
}

// ---------- Station exterior ----------

const WINDOW_COUNT = 56

function HabitatRing() {
  const ring = useRef<THREE.Group>(null)
  const windows = useMemo(() => {
    const items: { position: Triplet; angle: number }[] = []
    for (let i = 0; i < WINDOW_COUNT; i++) {
      const angle = (i / WINDOW_COUNT) * Math.PI * 2
      items.push({ position: [Math.cos(angle) * (RING_RADIUS + 2.6), Math.sin(angle) * (RING_RADIUS + 2.6), 0], angle })
    }
    return items
  }, [])

  useFrame((_, dt) => {
    if (ring.current) ring.current.rotation.z += dt * 0.08
  })

  return (
    <group position={[0, 0, RING_Z]}>
      <group ref={ring}>
        <mesh material={HULL} castShadow receiveShadow>
          <torusGeometry args={[RING_RADIUS, 2.6, 16, 72]} />
        </mesh>
        {windows.map(({ position, angle }, i) => (
          <mesh key={i} geometry={UNIT_BOX} material={glow(i % 7 === 0 ? '#9fd8ff' : '#ffd9a0', 2.2)} position={position} rotation={[0, 0, angle]} scale={[0.5, 1.5, 3.2]} />
        ))}
        {[0, 1, 2, 3].map((i) => (
          <Box key={i} size={[2, RING_RADIUS - 4, 2]} position={[0, 0, 0]} rotation={[0, 0, (i * Math.PI) / 2]} material={DARK} shadow={false} />
        ))}
      </group>
    </group>
  )
}

const BEACON_POSITIONS: { position: Triplet; color: string }[] = [
  { position: [-HALF_W - 1.4, HALF_H + 1.6, 0.5], color: '#ff3b3b' },
  { position: [HALF_W + 1.4, HALF_H + 1.6, 0.5], color: '#4dff88' },
  { position: [-HALF_W - 1.4, -HALF_H - 1.6, 0.5], color: '#4dff88' },
  { position: [HALF_W + 1.4, -HALF_H - 1.6, 0.5], color: '#ff3b3b' },
  { position: [0, 0, -SPINE_LENGTH - BAY.depth - 3], color: '#ffffff' },
]
const BEACON_ON = BEACON_POSITIONS.map((b) => glow(b.color, 6))
const BEACON_OFF = BEACON_POSITIONS.map((b) => glow(b.color, 0.4))

/** The approach: a runway of lights leading out from the hangar mouth, pulsing towards the bay. */
const RUNWAY = Array.from({ length: 8 }, (_, i) => 12 + i * 8)

function Lights() {
  const runway = useRef<THREE.Group>(null)
  const beacons = useRef<THREE.Group>(null)

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    runway.current?.children.forEach((child, i) => {
      const mesh = child as THREE.Mesh
      const phase = (t * 2.2 + (RUNWAY.length - i) * 0.35) % 2
      mesh.material = phase < 0.5 ? glow('#4dff88', 5) : glow('#4dff88', 0.6)
    })
    beacons.current?.children.forEach((child, i) => {
      const mesh = child as THREE.Mesh
      mesh.material = (Math.floor(t * 1.2 + i * 0.4) % 2 === 0 ? BEACON_ON : BEACON_OFF)[i]
    })
  })

  return (
    <>
      <group ref={runway}>
        {RUNWAY.map((z, i) => (
          <mesh key={z} geometry={UNIT_BOX} material={glow('#4dff88', 0.6)} position={[0, SLOT_LOCAL[1], z]} scale={[1.6, 0.1, 2.4]} name={`runway-${i}`} />
        ))}
      </group>
      <group ref={beacons}>
        {BEACON_POSITIONS.map((b, i) => (
          <mesh key={i} geometry={UNIT_SPHERE} material={BEACON_OFF[i]} position={b.position} scale={0.6} />
        ))}
      </group>
    </>
  )
}

function Exterior() {
  return (
    <group>
      {/* The spine behind the hangar, and the habitat ring around it */}
      <mesh geometry={UNIT_CYLINDER} material={HULL} position={[0, 0, -BAY.depth - SPINE_LENGTH / 2]} rotation={[Math.PI / 2, 0, 0]} scale={[4.2, SPINE_LENGTH, 4.2]} castShadow receiveShadow />
      <HabitatRing />

      {/* Solar arrays on struts */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 22, 0, -BAY.depth - SPINE_LENGTH + 4]}>
          <Box size={[22, 0.3, 9]} position={[0, 0, 0]} material={new THREE.MeshStandardMaterial({ color: '#16264a', metalness: 0.8, roughness: 0.25, emissive: '#0a3a7a', emissiveIntensity: 0.6 })} />
          <Box size={[22, 0.34, 0.2]} position={[0, 0.02, 0]} material={glow('#4aa8ff', 1.4)} shadow={false} />
          <Box size={[1, 0.6, 1]} position={[side * -11.5, 0, 0]} rotation={[0, 0, 0]} material={DARK} />
        </group>
      ))}
      <Box size={[44, 0.8, 0.8]} position={[0, 0, -BAY.depth - SPINE_LENGTH + 4]} material={DARK} />

      {/* Antenna mast */}
      <Box size={[0.3, 9, 0.3]} position={[0, HALF_H + WALL + 4.5, -BAY.depth + 4]} material={DARK} />
    </group>
  )
}

// ---------- Colliders ----------

/** A drydock station: a hangar bay with robotic arms and drones, a habitat ring and a runway of guide lights. */
export function SpaceStation({ station }: { station: StationSpec }) {
  useCompoundBody(() => ({
    mass: 0,
    type: 'Static',
    position: station.position,
    rotation: [0, station.yaw, 0],
    shapes: stationCollisionShapes(),
  }))

  return (
    <group position={station.position} rotation={[0, station.yaw, 0]} {...targetHandlers(stationRef(station.name))}>
      <Hangar />
      {ARM_BASES.map((arm, i) => (
        <RoboticArm key={i} {...arm} />
      ))}
      <Drones />
      <Exterior />
      <Lights />
    </group>
  )
}
