import { useSphere, type Triplet } from '@react-three/cannon'
import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, useState, type RefObject } from 'react'
import * as THREE from 'three'
import { gameStats, meteorTracks, type MeteorTrack } from './gameState'
import { targetHandlers } from './targetScreen'
import { meteorRef } from './targets'
import { hazardStats } from './types'
import { DIFFICULTY_PROFILES } from './difficulty'
import { getDock } from './dock'
import {
  MAX_ACTIVE_METEORS,
  PALETTES,
  firstMeteorDelay,
  meteorTrajectory,
  nextMeteorGap,
  planMeteorEvent,
  type MeteorSpec,
  type Vec3,
} from './meteorField'
import { disposeMeteorGeometries, getMeteorGeometry, meteorColliderRadius, meteorDetail } from './meteorGeometry'

const METEOR_LIFETIME_MS = 20_000

type MeteorData = { id: number; position: Triplet; velocity: Triplet; spec: MeteorSpec }

type MeteorProps = MeteorData & { onExpire: (id: number) => void }

function Meteor({ id, position, velocity, spec, onExpire }: MeteorProps) {
  const [ref] = useSphere<THREE.Mesh>(() => ({
    mass: spec.mass,
    args: [meteorColliderRadius(spec.radius)],
    position,
    velocity,
    angularVelocity: spec.spin,
    linearDamping: 0, // keep it on course
    angularDamping: 0,
  }))

  // Publish position and velocity for the auto-pilot's collision prediction. Position comes from the
  // mesh, which cannon updates every frame, and velocity from how far it moved since the last frame.
  // (Subscribing to the physics worker instead crashes it when a meteor's body is removed.)
  const track = useRef<MeteorTrack>({ position: [...position], velocity: [...velocity] })
  const remainingLifetime = useRef(METEOR_LIFETIME_MS / 1000)
  useEffect(() => {
    meteorTracks.set(id, track.current)
    return () => {
      meteorTracks.delete(id)
    }
  }, [id])

  useFrame((_, dt) => {
    remainingLifetime.current -= Math.min(dt, 0.1)
    if (remainingLifetime.current <= 0) {
      remainingLifetime.current = Number.POSITIVE_INFINITY
      onExpire(id)
      return
    }
    const mesh = ref.current
    if (!mesh || mesh.matrixAutoUpdate) return // cannon hasn't placed it yet
    const e = mesh.matrix.elements
    const t = track.current
    const step = Math.max(dt, 1 / 240)
    t.velocity = [(e[12] - t.position[0]) / step, (e[13] - t.position[1]) / step, (e[14] - t.position[2]) / step]
    t.position = [e[12], e[13], e[14]]
  })

  const palette = PALETTES[spec.palette % PALETTES.length]
  // The physics mesh stays unscaled (cannon owns its matrix); the visible rock is a scaled child.
  return (
    <mesh ref={ref} {...targetHandlers(meteorRef(id))}>
      <mesh geometry={getMeteorGeometry(spec.variant, meteorDetail(spec.radius))} scale={spec.radius} castShadow>
        <meshStandardMaterial
          color={palette.color}
          emissive={palette.emissive}
          emissiveIntensity={spec.emissiveIntensity}
          roughness={1}
          flatShading
        />
      </mesh>
    </mesh>
  )
}

type Pending = { at: number; spec: MeteorSpec }

/**
 * Spawns meteors at irregular intervals (occasionally a shower of small ones) with varied size, speed and aim.
 * Nothing spawns while the ship is docked. All tuning lives in meteorField.ts and the difficulty profiles.
 */
export function EventManager({ shipPosition }: { shipPosition: RefObject<THREE.Vector3> }) {
  const [meteors, setMeteors] = useState<MeteorData[]>([])
  const nextId = useRef(0)
  const clock = useRef(0)
  const nextEventAt = useRef(firstMeteorDelay(Math.random))
  const pending = useRef<Pending[]>([])
  const active = useRef(0)

  useFrame((_, dt) => {
    if (gameStats.victory || getDock().phase === 'docked') return
    clock.current += Math.min(dt, 0.1)

    if (clock.current >= nextEventAt.current) {
      const event = planMeteorEvent(Math.random)
      for (const { delay, spec } of event.meteors) pending.current.push({ at: clock.current + delay, spec })
      const lastDelay = event.meteors[event.meteors.length - 1].delay
      nextEventAt.current = clock.current + lastDelay + nextMeteorGap(Math.random, DIFFICULTY_PROFILES[gameStats.difficulty].meteorGap)
    }

    const due = pending.current.filter((p) => p.at <= clock.current)
    if (due.length === 0) return
    pending.current = pending.current.filter((p) => p.at > clock.current)

    const target = shipPosition.current.toArray() as Vec3
    const room = Math.max(0, MAX_ACTIVE_METEORS - active.current)
    const spawned = due.slice(0, room).map(({ spec }): MeteorData => {
      const { position, velocity } = meteorTrajectory(target, spec)
      return { id: nextId.current++, position, velocity, spec }
    })
    if (spawned.length === 0) return
    active.current += spawned.length
    setMeteors((prev) => [...prev, ...spawned])
  })

  useEffect(() => {
    hazardStats.meteors = meteors.length
    active.current = meteors.length
  }, [meteors.length])

  useEffect(() => disposeMeteorGeometries, [])

  const [expire] = useState(() => (id: number) => setMeteors((prev) => prev.filter((m) => m.id !== id)))

  return (
    <>
      {meteors.map((m) => (
        <Meteor key={m.id} {...m} onExpire={expire} />
      ))}
    </>
  )
}