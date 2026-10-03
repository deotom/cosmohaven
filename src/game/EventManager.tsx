import { useSphere, type Triplet } from '@react-three/cannon'
import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, useState, type RefObject } from 'react'
import * as THREE from 'three'
import { gameStats, meteorTracks, type MeteorTrack } from './gameState'
import { targetHandlers } from './targetScreen'
import { meteorRef } from './targets'
import { hazardStats } from './types'
import { DIFFICULTY_PROFILES } from './difficulty'

const FIRST_METEOR_DELAY = 6 // seconds; short so the first one shows up quickly
const SPAWN_DISTANCE = 80
const METEOR_SPEED = 18
const METEOR_RADIUS = 1.3
const METEOR_MASS = 40 // ships weigh a few units, so this really hurts
const METEOR_LIFETIME_MS = 20_000

type MeteorData = { id: number; position: Triplet; velocity: Triplet }

type MeteorProps = MeteorData & { onExpire: (id: number) => void }

function Meteor({ id, position, velocity, onExpire }: MeteorProps) {
  const [ref] = useSphere<THREE.Mesh>(() => ({
    mass: METEOR_MASS,
    args: [METEOR_RADIUS],
    position,
    velocity,
    angularVelocity: [1.2, 0.8, 0.5],
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

  return (
    <mesh ref={ref} castShadow {...targetHandlers(meteorRef(id))}>
      <icosahedronGeometry args={[METEOR_RADIUS, 1]} />
      <meshStandardMaterial color="#4a3a32" emissive="#ff5a1f" emissiveIntensity={0.6} roughness={1} flatShading />
    </mesh>
  )
}

const randomBetween = ([min, max]: [number, number]) => min + Math.random() * (max - min)

/** Spawns meteors at the active difficulty's interval, aimed at the ship's current position. */
export function EventManager({ shipPosition }: { shipPosition: RefObject<THREE.Vector3> }) {
  const [meteors, setMeteors] = useState<MeteorData[]>([])
  const nextId = useRef(0)
  const countdown = useRef(FIRST_METEOR_DELAY)

  useFrame((_, dt) => {
    if (gameStats.victory) return
    countdown.current -= Math.min(dt, 0.1)
    if (countdown.current > 0) return
    countdown.current = randomBetween(DIFFICULTY_PROFILES[gameStats.difficulty].meteorInterval)

    const target = shipPosition.current
    const direction = new THREE.Vector3(Math.random() - 0.5, (Math.random() - 0.5) * 0.6, Math.random() - 0.5).normalize()
    const spawn = target.clone().addScaledVector(direction, SPAWN_DISTANCE)
    const velocity = target.clone().sub(spawn).normalize().multiplyScalar(METEOR_SPEED)

    setMeteors((prev) => [
      ...prev,
      { id: nextId.current++, position: spawn.toArray(), velocity: velocity.toArray() },
    ])
  })

  useEffect(() => {
    hazardStats.meteors = meteors.length
  }, [meteors.length])

  const [expire] = useState(() => (id: number) => setMeteors((prev) => prev.filter((m) => m.id !== id)))

  return (
    <>
      {meteors.map((m) => (
        <Meteor key={m.id} {...m} onExpire={expire} />
      ))}
    </>
  )
}
