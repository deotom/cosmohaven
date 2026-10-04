import { useCompoundBody, type CollideEvent, type Quad, type Triplet } from '@react-three/cannon'
import { Edges } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import * as THREE from 'three'
import { Crew } from './Crew'
import { Engine } from './Flame'
import { exposureOf } from './exposure'
import { BlockModel } from './ShipBlocks'
import {
  HARVEST_SCAN_RANGE,
  INFLUENCE_FRACTION,
  LAND_ALTITUDE,
  SAFE_LANDING_SPEED,
  createAutopilotOutput,
  manualDescent,
  runAutopilot,
  type AutopilotInput,
} from './autopilot'
import { currentHarvester } from './upgrades'
import { createTargetState, resolveTarget, stationEntrance } from './targets'
import { shipState } from './shipState'
import { advanceFold, requestFold } from './fold'
import {
  addCredits,
  addThrustUsed,
  CELESTIAL_BODIES,
  EARTH_2,
  damageHull,
  declareVictory,
  gameStats,
  hullThrustFactor,
  getBlockCost,
  notify,
  reportWell,
  requestArrival,
  setArrival,
  setAutopilot,
  setConstruction,
  setShipModules,
  setThrustLevel,
  trySpendCredits,
} from './gameState'
import { createGravitySample, sampleGravity } from './gravity'
import { gridKey, type Block, type BlockType, type GameMode, type GridPos, type PlaceableBlockType } from './types'
import { useKeyboard } from './useKeyboard'
import { useMouseLook } from './useMouseLook'
import { getControlCode, getMouseSensitivity } from '../input/preferences'
import { currentRole, currentSpecies } from './crewProfile'
import { engineThrustMultiplier, shieldDamageFactor } from './shipModules'
import { construction, dockInfo, dockRequests, getDock } from './dock'
import { useDocking } from './docking'
import { PendingBlock } from './Holograms'
import { getSector } from './sector'
import { obstaclesFor } from './pathPlanner'
import { canRemove, pickRemovable } from './shipGraph'
import { stationPose } from './station'

const BLOCK_STYLES: Record<BlockType, { color: string; emissive: string; emissiveIntensity: number; edge: string }> = {
  core: { color: '#1fb6ff', emissive: '#0a5cff', emissiveIntensity: 0.8, edge: '#bfefff' },
  hull: { color: '#8a93a6', emissive: '#000000', emissiveIntensity: 0, edge: '#2b3140' },
  food: { color: '#2ecc71', emissive: '#0f8f43', emissiveIntensity: 0.7, edge: '#c8ffd9' },
  arcade: { color: '#c026d3', emissive: '#a21caf', emissiveIntensity: 0.8, edge: '#ffb3ff' },
  engine: { color: '#e87a2d', emissive: '#ff6b1a', emissiveIntensity: 1.2, edge: '#ffd0a3' },
  shield: { color: '#1c86ad', emissive: '#22c7ff', emissiveIntensity: 1, edge: '#a9efff' },
  repair: { color: '#bd9630', emissive: '#ffdc49', emissiveIntensity: 0.8, edge: '#fff0a6' },
}

/** Any of these held means the pilot wants the controls back from the auto-pilot. */
const MANUAL_CONTROLS = [
  'thrustForward',
  'thrustBackward',
  'yawLeft',
  'yawRight',
  'rollLeft',
  'rollRight',
  'pitchDown',
  'pitchUp',
  'strafeUp',
  'strafeDown',
] as const

/** Seconds a shipyard drone needs to assemble each kind of block (before the role's build-speed bonus) */
const BUILD_TIME: Record<PlaceableBlockType, number> = { hull: 1.6, food: 2.6, arcade: 2.6, engine: 3, shield: 3, repair: 3 }

const BLOCK_SIZE = 1
const BLOCK_MASS = 1
// Thrust scales with block count so a bigger ship isn't hopelessly slow on the long trip to Earth 2.0
const THRUST_PER_BLOCK = 8
// Target angular acceleration (rad/s²) for pitch, yaw and roll. Torque is scaled by the ship's
// moment of inertia so that big, long ships turn as readily as small ones.
const ANGULAR_ACCEL = 4

// Mouse steering works like a virtual joystick: movement pushes a stick (-1..1) that drifts back to centre
const MOUSE_SENSITIVITY = 0.006 // stick deflection per pixel, so ~170px is full deflection
const MOUSE_RETURN_RATE = 3 // how quickly the stick recentres, per second
const INVERT_MOUSE_Y = false // false: mouse up = nose up
// Not realistic for space, but keeps the prototype controllable. Gravity wells fade it towards
// WELL_DAMPING so orbits can persist; atmospheres add drag on top.
const LINEAR_DAMPING = 0.3
const WELL_DAMPING = 0 // any drag at all makes orbits spiral into the planet within a lap or two
const VICTORY_DAMPING = 0.9 // per second; a ship at 10 u/s is effectively stopped within ~1.5s
const ATMOSPHERE_DRAG = 0.35 // extra damping at the surface: terminal fall speed there is about gravity / this
const TURBULENCE = 0.6 // fraction of ANGULAR_ACCEL thrown around at the surface at speed
const ANGULAR_DAMPING = 0.8

/**
 * Moment of inertia about each local axis, matching how cannon-es models a compound body:
 * a solid box the size of the ship's bounding box.
 */
function shipInertia(blocks: readonly Block[]): Triplet {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const { pos } of blocks) {
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], pos[a])
      max[a] = Math.max(max[a], pos[a])
    }
  }
  const [lx, ly, lz] = [0, 1, 2].map((a) => (max[a] - min[a] + 1) * BLOCK_SIZE)
  const m = blocks.length * BLOCK_MASS
  return [(m / 12) * (ly * ly + lz * lz), (m / 12) * (lx * lx + lz * lz), (m / 12) * (lx * lx + ly * ly)]
}

/**
 * Centre of mass in ship space (grid coordinates). Every block weighs the same, so it's the mean block
 * position. The physics body's origin sits here so the ship pivots about it, not about the core block.
 */
function centerOfMass(blocks: readonly Block[]): Triplet {
  const sum: Triplet = [0, 0, 0]
  for (const { pos } of blocks) for (let a = 0; a < 3; a++) sum[a] += pos[a]
  return [sum[0] / blocks.length, sum[1] / blocks.length, sum[2] / blocks.length]
}

/** The grid cell adjacent to `p` on the face that was hit by the pointer. */
function neighborCell(p: GridPos, e: ThreeEvent<PointerEvent | MouseEvent>): GridPos | null {
  // face.normal is in the mesh's local space, which matches ship-local space since blocks are never rotated
  const n = e.face?.normal
  if (!n) return null
  return [p[0] + Math.round(n.x), p[1] + Math.round(n.y), p[2] + Math.round(n.z)]
}

/** The ship starts docked, so its first position is the home drydock's slot. */
function initialPosition(): Triplet {
  const station = getSector().stations[0]
  return station ? (stationPose(station).slot.toArray() as Triplet) : [0, 0, 0]
}

type Pending = { pos: GridPos; type: PlaceableBlockType; total: number }

type ShipProps = {
  /** Written every frame with the ship's world position and orientation, for the camera and hazards. */
  positionOut: RefObject<THREE.Vector3>
  quaternionOut: RefObject<THREE.Quaternion>
  /** Building is only possible in build mode; thrust only in pilot mode. */
  mode: GameMode
  onBlockCountChange?: (count: number) => void
  /** Type of block placed on click. */
  selectedType: PlaceableBlockType
  /** Written every frame with the crew member's position in world space, for the interior camera. */
  crewWorldOut: RefObject<THREE.Vector3>
  /** A safe touchdown on Earth 2.0 wins the game */
  onVictory: () => void
}

export function Ship({ positionOut, quaternionOut, mode, onBlockCountChange, selectedType, crewWorldOut, onVictory }: ShipProps) {
  const [blocks, setBlocks] = useState<Block[]>(() => shipState.blocks.map((block) => ({ ...block, pos: [...block.pos] as GridPos })))
  const [ghost, setGhost] = useState<GridPos | null>(null)
  const occupied = useMemo(() => new Set(blocks.map((b) => gridKey(b.pos))), [blocks])
  const keys = useKeyboard(mode === 'pilot')
  const takeMouseMovement = useMouseLook()
  const stick = useRef({ x: 0, y: 0 })
  const inertia = useMemo(() => shipInertia(blocks), [blocks])
  const com = useMemo(() => centerOfMass(blocks), [blocks])
  const exposures = useMemo(
    () => blocks.map((b) => exposureOf(b.pos, (x, y, z) => occupied.has(gridKey([x, y, z])))),
    [blocks, occupied],
  )
  const group = useRef<THREE.Group>(null)
  /** The centre of mass the current physics body was built around (ship space) */
  const bodyCom = useRef<Triplet>(com)

  // Latest physics state, mirrored from the worker so the body can be rebuilt
  // (when blocks change) without teleporting or losing momentum
  const physics = useRef({
    position: shipState.hasSavedTransform ? shipState.position.toArray() as Triplet : initialPosition(),
    quaternion: shipState.hasSavedTransform ? shipState.quaternion.toArray() as Quad : [0, 0, 0, 1] as Quad,
    velocity: shipState.velocity.toArray() as Triplet,
    angularVelocity: shipState.angularVelocity.toArray() as Triplet,
  })

  // Blocks the shipyard drones are still assembling, in order; the first is being built now
  const [pending, setPending] = useState<Pending[]>(() =>
    shipState.pending.map(({ pos, type, total }) => ({ pos: [...pos] as GridPos, type, total })),
  )
  const pendingRef = useRef<Pending[]>([])
  const buildProgress = useRef(shipState.pending[0]?.progress ?? 0)
  const busy = useRef(false)
  const shipMass = useRef(1)
  const lastHit = useRef(0)
  useEffect(() => {
    pendingRef.current = pending
    busy.current = pending.length > 0
    shipState.pending = pending.map((item, index) => ({
      ...item,
      pos: [...item.pos] as GridPos,
      progress: index === 0 ? buildProgress.current : 0,
    }))
  }, [pending])
  useEffect(() => {
    shipState.blocks = blocks.map((block) => ({ ...block, pos: [...block.pos] as GridPos }))
  }, [blocks])
  useEffect(() => {
    shipMass.current = blocks.length * BLOCK_MASS
  }, [blocks.length])
  const occupiedAll = useMemo(() => new Set([...blocks.map((b) => gridKey(b.pos)), ...pending.map((p) => gridKey(p.pos))]), [blocks, pending])

  /** Collisions hurt: the hull takes damage, and a severe one tears a block off (never the core, never splitting the ship). */
  const handleImpact = (impact: number) => {
    if (getDock().phase !== 'free') return
    const now = performance.now()
    if (now - lastHit.current < 500 || impact < SAFE_LANDING_SPEED) return
    lastHit.current = now
    const rawDamage = Math.min(60, (impact - SAFE_LANDING_SPEED) * 1.6)
    const damage = rawDamage * shieldDamageFactor(blocks)
    damageHull(damage)
    notify(`Impact! Hull -${Math.round(damage)}%`, 'warning', 1800)
    if (impact > 30) {
      setBlocks((prev) => {
        const lost = pickRemovable(prev)
        if (!lost) return prev
        notify('A block was torn off in the impact!', 'warning', 2500)
        return prev.filter((b) => b !== lost)
      })
    }
  }

  const [ref, api] = useCompoundBody<THREE.Group>(
    () => {
      const s = physics.current
      // Where the ship is right now. The rendered matrix is the freshest source; the mirrored
      // worker state can be a frame behind
      const position = new THREE.Vector3(...s.position)
      const orientation = new THREE.Quaternion(...s.quaternion)
      if (group.current && !group.current.matrixAutoUpdate) {
        group.current.matrix.decompose(position, orientation, new THREE.Vector3())
      }

      // Adding a block moves the centre of mass within the ship. Move the body origin with it (so the
      // blocks stay exactly where they are on screen) and give that new point the velocity the same
      // spot on the rigid ship already had: v + ω × r
      const shift = new THREE.Vector3(com[0] - bodyCom.current[0], com[1] - bodyCom.current[1], com[2] - bodyCom.current[2]).applyQuaternion(orientation)
      const velocity = new THREE.Vector3(...s.velocity).add(new THREE.Vector3(...s.angularVelocity).cross(shift))
      position.add(shift)
      bodyCom.current = com

      const euler = new THREE.Euler().setFromQuaternion(orientation)
      return {
        // Docked, docking and undocking ships are held by the shipyard: zero mass means nothing can push them
        mass: getDock().phase === 'free' ? blocks.length * BLOCK_MASS : 0,
        // cannon picks the body type from the mass at construction; without this a mass-0 body is STATIC
        // for good and api.mass.set() on undock never makes it move again
        type: 'Dynamic' as const,
        onCollide: (e: CollideEvent) => handleImpact(Math.abs(e.contact.impactVelocity)),
        position: position.toArray(),
        rotation: [euler.x, euler.y, euler.z],
        velocity: velocity.toArray(),
        angularVelocity: s.angularVelocity,
        linearDamping: LINEAR_DAMPING,
        angularDamping: ANGULAR_DAMPING,
        shapes: blocks.map(({ pos }) => ({
          type: 'Box' as const,
          args: [BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE] as Triplet,
          position: [pos[0] - com[0], pos[1] - com[1], pos[2] - com[2]] as Triplet,
        })),
      }
    },
    group,
    [blocks],
  )

  // Re-subscribe whenever the body is rebuilt
  useEffect(() => {
    const s = physics.current
    const unsubscribe = [
      api.position.subscribe((v) => (s.position = v)),
      api.quaternion.subscribe((v) => (s.quaternion = v)),
      api.velocity.subscribe((v) => (s.velocity = v)),
      api.angularVelocity.subscribe((v) => (s.angularVelocity = v)),
    ]
    return () => unsubscribe.forEach((u) => u())
  }, [api, blocks])

  useEffect(() => {
    onBlockCountChange?.(blocks.length)
    setShipModules({
      engines: blocks.filter((block) => block.type === 'engine').length,
      shields: blocks.filter((block) => block.type === 'shield').length,
      repairBays: blocks.filter((block) => block.type === 'repair').length,
    })
  }, [blocks, onBlockCountChange])

  const velocityRef = useMemo(() => ({ get current() { return physics.current.velocity } }), [])
  useDocking({ api, positionOut, quaternionOut, velocity: velocityRef, shipMass, busy })

  // The body is recreated when blocks change, which resets its damping to the initial value
  const appliedDamping = useRef(LINEAR_DAMPING)
  useEffect(() => {
    appliedDamping.current = LINEAR_DAMPING
  }, [api, blocks])

  // On victory the ship is braked by heavy damping so it glides to rest instead of stopping dead
  const settling = useRef(false)

  const gravity = useMemo(() => createGravitySample(), [])
  const autopilotOut = useMemo(() => createAutopilotOutput(), [])
  const apScratch = useMemo(() => ({ velocity: new THREE.Vector3(), angularVelocity: new THREE.Vector3() }), [])
  const turbulence = useRef(new THREE.Vector3())
  const targetScratch = useMemo(() => createTargetState(), [])
  const torque = useMemo(() => new THREE.Vector3(), [])
  const orientation = useMemo(() => new THREE.Quaternion(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, dt) => {
    // @react-three/cannon writes the body's transform straight into `matrix` (and turns off
    // matrixAutoUpdate), so `position`/`quaternion` on the group stay at their initial values
    ref.current?.matrix.decompose(positionOut.current, quaternionOut.current, scale)
    shipState.position.copy(positionOut.current)
    shipState.quaternion.copy(quaternionOut.current)
    shipState.velocity.fromArray(physics.current.velocity)
    shipState.angularVelocity.fromArray(physics.current.angularVelocity)
    shipState.hasSavedTransform = true

    setThrustLevel(0) // set again below on frames where the engine fires

    // Space-Fold: on the frame the drive fires, the ship is moved to the new sector's arrival point
    if (advanceFold(Math.min(dt, 0.1))) {
      api.position.set(0, 0, 0)
      api.velocity.set(0, 0, 0)
      api.angularVelocity.set(0, 0, 0)
      physics.current.position = [0, 0, 0]
      physics.current.velocity = [0, 0, 0]
      physics.current.angularVelocity = [0, 0, 0]
      positionOut.current.set(0, 0, 0)
      shipState.position.set(0, 0, 0)
      shipState.velocity.set(0, 0, 0)
      shipState.angularVelocity.set(0, 0, 0)
    }

    // Shipyard: while docked, drones assemble the queued blocks one at a time
    const queue = pendingRef.current
    if (getDock().phase === 'docked' && queue.length > 0) {
      buildProgress.current += dt / queue[0].total
      if (ref.current) {
        ref.current.updateWorldMatrix(true, false)
        construction.position.set(queue[0].pos[0] - com[0], queue[0].pos[1] - com[1], queue[0].pos[2] - com[2])
        ref.current.localToWorld(construction.position)
      }
      construction.active = true
      construction.progress = Math.min(1, buildProgress.current)
      setConstruction(queue.map((q, i) => ({ type: q.type, progress: i === 0 ? construction.progress : 0 })))
      shipState.pending = queue.map((item, index) => ({
        ...item,
        pos: [...item.pos] as GridPos,
        progress: index === 0 ? construction.progress : 0,
      }))
      if (buildProgress.current >= 1) {
        const done = queue[0]
        buildProgress.current = 0
        setBlocks((prev) => [...prev, { pos: done.pos, type: done.type }])
        setPending((prev) => prev.slice(1))
      }
    } else if (construction.active || gameStats.construction.length > 0) {
      construction.active = false
      buildProgress.current = 0
      shipState.pending = []
      setConstruction([])
    }

    // Held by the shipyard: no flying, no gravity, no autopilot
    if (getDock().phase !== 'free') {
      takeMouseMovement()
      stick.current.x = stick.current.y = 0
      reportWell(null)
      if (gameStats.autopilot.engaged) setAutopilot({ engaged: false, status: 'Off' })
      return
    }

    // Gravity wells and atmospheres (Physics is paused on victory, so skip then)
    if (!gameStats.victory) {
      sampleGravity(positionOut.current, gravity)
      const mass = blocks.length * BLOCK_MASS
      const v = physics.current.velocity
      const speed = Math.hypot(v[0], v[1], v[2])

      // Cannon clears forces after every fixed 1/60s substep, so scale by frame time to keep the
      // pull (and therefore orbits) the same at 30, 60 or 144 fps
      const frameScale = mass * Math.min(dt, 0.1) * 60
      if (gravity.dominant) {
        api.applyForce([gravity.accel.x * frameScale, gravity.accel.y * frameScale, gravity.accel.z * frameScale], [0, 0, 0])
      }

      const damping = LINEAR_DAMPING + (WELL_DAMPING - LINEAR_DAMPING) * gravity.freedom + ATMOSPHERE_DRAG * gravity.atmosphere
      if (Math.abs(damping - appliedDamping.current) > 0.005) {
        appliedDamping.current = damping
        api.linearDamping.set(damping)
      }

      // Turbulence: smoothed random torque, stronger deeper in the atmosphere and the faster you go
      if (gravity.atmosphere > 0) {
        const shake = gravity.atmosphere * Math.min(1, speed / 20) * TURBULENCE * ANGULAR_ACCEL
        const t = turbulence.current
        const blend = Math.min(1, dt * 8)
        t.x += (Math.random() * 2 - 1 - t.x) * blend
        t.y += (Math.random() * 2 - 1 - t.y) * blend
        t.z += (Math.random() * 2 - 1 - t.z) * blend
        torque
          .set(t.x * inertia[0], t.y * inertia[1], t.z * inertia[2])
          .multiplyScalar(shake)
          .applyQuaternion(quaternionOut.current)
        api.applyTorque(torque.toArray() as Triplet)
      }

      shipState.velocity.set(...v)
      shipState.heat = Math.min(1, gravity.atmosphere * Math.min(1, speed / 25))

      if (gravity.dominant) {
        const { body, distance } = gravity.dominant
        const toShip = new THREE.Vector3(...physics.current.position).sub(new THREE.Vector3(...body.position)).normalize()
        reportWell({
          radialSpeed: toShip.dot(shipState.velocity),
          name: body.name,
          altitude: Math.max(0, distance - body.radius),
          pull: gravity.dominant.accel,
          speed,
          // Circular orbit speed from the pull actually felt here (gravity fades in over the edge of a well)
          orbitSpeed: Math.sqrt(gravity.dominant.accel * Math.max(distance, body.radius)),
          inAtmosphere: gravity.atmosphere > 0,
        })
      } else {
        reportWell(null)
      }
    } else if (!settling.current) {
      settling.current = true
      api.linearDamping.set(VICTORY_DAMPING)
      api.angularDamping.set(VICTORY_DAMPING)
    }

    // --- Arrival at a planet ---
    const dominant = gravity.dominant
    const arrivalNow = gameStats.arrival
    if (dominant && !gameStats.victory) {
      const index = CELESTIAL_BODIES.indexOf(dominant.body)
      const altitude = dominant.distance - dominant.body.radius
      const inside = dominant.distance < dominant.body.wellRadius * INFLUENCE_FRACTION

      // Crossing into the sphere of influence: offer the choice (or carry out what the pilot already asked for)
      if (arrivalNow.phase === 'none' && inside && mode === 'pilot') {
        setArrival({ phase: 'choice', body: index, orbitRadius: 0, lever: 0 })
        const intent = gameStats.autopilot.intent
        if (intent === 'orbit' || intent === 'land') {
          setAutopilot({ intent: 'choose' })
          requestArrival(intent)
        } else {
          notify(`Entering ${dominant.body.name}'s sphere of influence: [O] orbit or [L] land`, 'gain', 6000)
        }
      }

      // Touchdown: slow enough is a landing (on Earth 2.0, the end of the journey); faster is a crash, which the
      // collision damage already handles
      if (altitude < LAND_ALTITUDE && arrivalNow.phase !== 'landed' && arrivalNow.phase !== 'none') {
        const v = physics.current.velocity
        const radial = new THREE.Vector3(...v).dot(
          new THREE.Vector3(...physics.current.position).sub(new THREE.Vector3(...dominant.body.position)).normalize(),
        )
        if (-radial <= SAFE_LANDING_SPEED) {
          setArrival({ phase: 'landed', body: index })
          setAutopilot({ engaged: false, status: 'Off' })
          if (dominant.body.name === EARTH_2.name) {
            notify('Touchdown! Colony site secured', 'gain', 4000)
            declareVictory()
            onVictory()
          } else {
            notify(`Landed on ${dominant.body.name}`, 'gain', 3500)
          }
        }
      }
      // Lifting off again
      if (arrivalNow.phase === 'landed' && altitude > 40) setArrival({ phase: 'choice' })
    }
    if (arrivalNow.phase !== 'none' && (!dominant || dominant.distance >= dominant.body.wellRadius)) {
      setArrival({ phase: 'none', body: -1, orbitRadius: 0 })
    }

    // The pilot's skill and the hull's condition both change how hard the engines push
    const thrustFactor = currentRole().shipSpeed * hullThrustFactor() * engineThrustMultiplier(blocks)

    // Automatic flying: the selected auto-pilot task, plus the arrival burns (orbital insertion, de-orbit) the pilot asked for
    const canFly = mode === 'pilot' && !gameStats.victory
    if (!canFly) {
      if (gameStats.autopilot.engaged) setAutopilot({ engaged: false, status: 'Off' })
      if (gameStats.arrival.phase === 'insertion' || gameStats.arrival.phase === 'deorbit') setArrival({ phase: 'choice' })
    }

    const descending = gameStats.arrival.phase === 'descent'
    const held = keys.current
    // While landing, Space and Shift are the throttle lever rather than an override
    const manualKeys = MANUAL_CONTROLS.map(getControlCode)
    const overrideKeys = descending
      ? manualKeys.filter((key) => key !== getControlCode('strafeUp') && key !== getControlCode('strafeDown'))
      : manualKeys
    if (canFly && overrideKeys.some((key) => held.has(key))) {
      if (gameStats.autopilot.engaged) {
        setAutopilot({ engaged: false, status: 'Manual override' })
        notify('Auto-pilot disengaged: manual override', 'warning')
      }
      if (gameStats.arrival.phase === 'insertion' || gameStats.arrival.phase === 'deorbit') {
        setArrival({ phase: 'choice' })
        notify('Manoeuvre cancelled: manual override', 'warning')
      }
    }
    if (canFly && descending && gameStats.autopilot.engaged && (held.has('Space') || held.has('ShiftLeft') || held.has('ShiftRight'))) {
      setAutopilot({ engaged: false, status: 'Manual landing' })
      setArrival({ lever: gameStats.arrival.lever })
    }

    const autoPhase = gameStats.arrival.phase === 'insertion' || gameStats.arrival.phase === 'deorbit'
    const manualDescentNow = canFly && descending && !gameStats.autopilot.engaged
    if (canFly && (gameStats.autopilot.engaged || autoPhase || manualDescentNow)) {
      takeMouseMovement() // automatic flight ignores the mouse
      const ap = gameStats.autopilot

      // The locked target, if it still exists. Docking aims for the hangar mouth, not the station's centre
      let target: typeof targetScratch | null = null
      if (gameStats.target && resolveTarget(gameStats.target, targetScratch)) {
        target = targetScratch
        if (ap.task === 'dock' && gameStats.target.kind === 'station') {
          const entrance = stationEntrance(gameStats.target.name)
          if (entrance) targetScratch.position.copy(entrance)
        }
      }

      const input: AutopilotInput = {
        tier: gameStats.autopilotTier,
        task: ap.task,
        destination: CELESTIAL_BODIES[ap.destination] ?? CELESTIAL_BODIES[0],
        target,
        engaged: ap.engaged,
        position: positionOut.current,
        velocity: apScratch.velocity.set(...physics.current.velocity),
        quaternion: quaternionOut.current,
        angularVelocity: apScratch.angularVelocity.set(...physics.current.angularVelocity),
        gravity: gravity.accel,
        dt: Math.min(dt, 0.1),
        mainAccel: THRUST_PER_BLOCK * thrustFactor,
        harvestRange: currentHarvester().range,
        scanRange: HARVEST_SCAN_RANGE * currentSpecies().scanRange,
        hull: gameStats.hull,
        obstacles: obstaclesFor(getSector()),
      }

      let out
      if (manualDescentNow) {
        // Lever: Space opens it, Shift closes it
        const change = ((held.has('Space') ? 1 : 0) - (held.has('ShiftLeft') || held.has('ShiftRight') ? 1 : 0)) * 0.8 * dt
        const lever = Math.max(0, Math.min(1, gameStats.arrival.lever + change))
        if (lever !== gameStats.arrival.lever) setArrival({ lever })
        out = manualDescent(input, lever, autopilotOut)
      } else {
        out = runAutopilot(input, autopilotOut)
      }

      const mass = blocks.length * BLOCK_MASS
      if (out.throttle > 0) {
        api.applyLocalForce([0, 0, -out.throttle * THRUST_PER_BLOCK * thrustFactor * blocks.length], [0, 0, 0])
        addThrustUsed(out.throttle * dt)
        setThrustLevel(out.throttle)
      }
      if (out.maneuverAccel.lengthSq() > 0) {
        const scaleToForce = mass * Math.min(dt, 0.1) * 60 // same frame-rate compensation as gravity
        api.applyForce(
          [out.maneuverAccel.x * scaleToForce, out.maneuverAccel.y * scaleToForce, out.maneuverAccel.z * scaleToForce],
          [0, 0, 0],
        )
      }
      const meanInertia = (inertia[0] + inertia[1] + inertia[2]) / 3
      torque.copy(out.angularAccel).multiplyScalar(meanInertia)
      api.applyTorque(torque.toArray() as Triplet)

      setAutopilot({ status: out.status, distance: out.distance })
      if (out.requestFold) requestFold('auto')
      if (out.requestDock) dockRequests.toggle = true
      return
    }

    const s = stick.current
    if (mode !== 'pilot' || gameStats.victory) {
      takeMouseMovement() // discard anything captured while not flying
      s.x = s.y = 0
      return
    }

    // Fold this frame's mouse movement into the stick, then let it drift back to centre
    const clamp = (v: number) => Math.max(-1, Math.min(1, v))
    const moved = takeMouseMovement()
    s.x = clamp(s.x + moved.x * MOUSE_SENSITIVITY * getMouseSensitivity())
    s.y = clamp(s.y + moved.y * MOUSE_SENSITIVITY * getMouseSensitivity())
    const mouseYaw = -s.x // mouse right = nose right
    const mousePitch = INVERT_MOUSE_Y ? s.y : -s.y // movementY is negative when the mouse moves up
    const recentre = Math.exp(-MOUSE_RETURN_RATE * Math.min(dt, 0.1))
    s.x *= recentre
    s.y *= recentre

    const k = keys.current
    const axis = (pos: boolean, neg: boolean) => (pos ? 1 : 0) - (neg ? 1 : 0)
    const forward = axis(k.has(getControlCode('thrustForward')), k.has(getControlCode('thrustBackward')))
    const lift = axis(k.has(getControlCode('strafeUp')), k.has(getControlCode('strafeDown')) || k.has('ShiftRight'))
    // Rotation inputs, as torque about the ship's local axes (+X right, +Y up, +Z backwards)
    const yaw = clamp(axis(k.has(getControlCode('yawLeft')), k.has(getControlCode('yawRight'))) + mouseYaw) // +Y: nose swings left
    const pitch = clamp(axis(k.has(getControlCode('pitchUp')), k.has(getControlCode('pitchDown'))) + mousePitch) // +X: nose up
    // E docks when a station is in range, so it only rolls the ship when there's nothing to dock with
    const roll = axis(k.has(getControlCode('rollLeft')), dockInfo.canDock ? false : k.has(getControlCode('rollRight'))) // +Z: left wing down

    // Ship-local thrust: -Z is the ship's nose
    if (forward || lift) {
      const thrust = THRUST_PER_BLOCK * thrustFactor * blocks.length
      api.applyLocalForce([0, lift * thrust, -forward * thrust], [0, 0, 0])
      addThrustUsed(Math.max(Math.abs(forward), Math.abs(lift)) * dt)
      setThrustLevel(Math.max(forward, Math.abs(lift) * 0.4, 0))
    }

    // applyTorque expects world space, so rotate the local torque by the ship's orientation
    if (pitch || yaw || roll) {
      torque
        .set(pitch * inertia[0], yaw * inertia[1], roll * inertia[2])
        .multiplyScalar(ANGULAR_ACCEL)
        .applyQuaternion(orientation.set(...physics.current.quaternion))
      api.applyTorque(torque.toArray() as Triplet)
    }
  })

  const updateGhost = (e: ThreeEvent<PointerEvent>, p: GridPos) => {
    e.stopPropagation()
    if (mode !== 'build' || getDock().phase !== 'docked') return
    const target = neighborCell(p, e)
    const next = target && !occupiedAll.has(gridKey(target)) ? target : null
    if (gridKey(next ?? [NaN, NaN, NaN]) !== gridKey(ghost ?? [NaN, NaN, NaN])) setGhost(next)
  }

  const placeBlock = (e: ThreeEvent<MouseEvent>, p: GridPos) => {
    e.stopPropagation()
    // Building and modifying the ship is only possible docked at a drydock
    if (mode !== 'build' || getDock().phase !== 'docked' || gameStats.victory) return
    // Ignore clicks that were really camera drags
    if (e.delta > 4) return

    // Shift+click takes a block apart (half its HC cost back), unless that would cut the ship in two
    if (e.nativeEvent.shiftKey) {
      const block = blocks.find((b) => gridKey(b.pos) === gridKey(p))
      if (!block || !canRemove(blocks, block)) {
        notify(block?.type === 'core' ? 'The core cannot be removed' : 'Removing that would split the ship', 'warning')
        return
      }
      addCredits(Math.floor(getBlockCost(block.type as PlaceableBlockType) / 2))
      setBlocks((prev) => prev.filter((b) => b !== block))
      setGhost(null)
      return
    }

    const target = neighborCell(p, e)
    if (!target || occupiedAll.has(gridKey(target))) return
    if (!trySpendCredits(getBlockCost(selectedType))) return
    // The drones build it over time; an Engineer is quicker
    const total = BUILD_TIME[selectedType] / currentRole().buildSpeed
    setPending((prev) => [...prev, { pos: target, type: selectedType, total }])
    setGhost(null)
  }

  return (
    <group ref={ref}>
      {/* The body origin is the centre of mass, so the blocks are drawn offset from it */}
      <group position={[-com[0], -com[1], -com[2]]}>
        {blocks.map(({ pos, type }, i) => (
          <group key={gridKey(pos)} position={pos}>
            <BlockModel type={type} exposed={exposures[i]} />
            {/* An invisible, unit-sized pick target: placement clicks and the ghost preview use its faces */}
            <mesh
              onClick={(e) => placeBlock(e, pos)}
              onPointerMove={(e) => updateGhost(e, pos)}
              onPointerOut={() => setGhost(null)}
            >
              <boxGeometry args={[BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE]} />
              <meshBasicMaterial colorWrite={false} depthWrite={false} />
            </mesh>
            {/* An engine on every rear-facing wall */}
            {exposures[i].pz && <Engine position={[0, 0, 0.5]} />}
          </group>
        ))}

        {pending.map((q, i) => (
          <PendingBlock key={gridKey(q.pos)} pos={q.pos} active={i === 0} progress={buildProgress} />
        ))}

        <Crew blocks={blocks} worldOut={crewWorldOut} />

        {ghost && mode === 'build' && (
          // Preview of where the next block will go; excluded from raycasting
          <mesh position={ghost} raycast={() => null}>
            <boxGeometry args={[BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE]} />
            <meshBasicMaterial color={BLOCK_STYLES[selectedType].edge} transparent opacity={0.3} depthWrite={false} />
            <Edges color={BLOCK_STYLES[selectedType].edge} />
          </mesh>
        )}

        {/* Nose marker so the forward (-Z) direction is visible */}
        <mesh position={[0, 0, -0.62]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
          <coneGeometry args={[0.15, 0.25, 12]} />
          <meshBasicMaterial color="#ffcc33" />
        </mesh>
      </group>
    </group>
  )
}
