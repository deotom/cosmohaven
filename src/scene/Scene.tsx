import { Physics } from '@react-three/cannon'
import { Environment } from '@react-three/drei/core/Environment.js'
import { Lightformer } from '@react-three/drei/core/Lightformer.js'
import { OrbitControls } from '@react-three/drei/core/OrbitControls.js'
import { Stars } from '@react-three/drei/core/Stars.js'
import { useFrame, useThree } from '@react-three/fiber'
import { Fragment, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import * as THREE from 'three'
import { Asteroids } from '../game/Asteroids'
import { Ship } from '../game/Ship'
import { SpaceStation } from '../game/SpaceStation'
import { Earth } from '../game/Earth'
import { Effects } from '../game/Effects'
import { Nebula } from '../game/Nebula'
import { SunDisc, SunLight } from '../game/Sun'
import { EventManager } from '../game/EventManager'
import { ReentryEffects } from '../game/ReentryEffects'
import { shipState } from '../game/shipState'
import { TargetTracker } from '../game/TargetSystem'
import { useSector } from '../game/sector'
import { Planet } from '../game/Planet'
import { ScrapField } from '../game/ScrapField'
import type { CameraView, GameMode, PlaceableBlockType } from '../game/types'

type ControlsLike = { target: THREE.Vector3 }

/** Where the chase camera sits relative to the ship, in ship space (behind and above the nose at -Z). */
const CHASE_OFFSET = new THREE.Vector3(0, 3, 9)
const CHASE_STIFFNESS = 5

const WORLD_UP = new THREE.Vector3(0, 1, 0)

/** Re-entry rattles the camera: a small random nudge each frame. */
function shakeCamera(camera: THREE.Camera, amount: number) {
  camera.position.x += (Math.random() - 0.5) * amount
  camera.position.y += (Math.random() - 0.5) * amount
  camera.position.z += (Math.random() - 0.5) * amount
}

/** Changing the near plane has to be followed by a projection update. */
function setNearPlane(camera: THREE.PerspectiveCamera, near: number) {
  camera.near = near
  camera.updateProjectionMatrix()
}

/** Where the interior camera starts, relative to the crew member in ship space, and the default exterior offset. */
const INTERIOR_OFFSET = new THREE.Vector3(0.45, 0.2, 0.85)
const EXTERIOR_OFFSET = new THREE.Vector3(6, 5, 9)

type CameraRigProps = {
  /** True for the third-person chase camera; false hands the camera to the orbit controls */
  chasing: boolean
  /** Interior view: the orbit camera is centred on the crew member instead of the ship */
  interior: boolean
  /** Docked in a drydock: the camera snaps to the assembly view inside the hangar */
  docked: boolean
  position: RefObject<THREE.Vector3>
  quaternion: RefObject<THREE.Quaternion>
  crewWorld: RefObject<THREE.Vector3>
}

/**
 * Orbit (build mode, or pilot mode with the orbit view): the user's orbit controls drive the
 * camera and it rides along with the ship, keeping their angle and zoom.
 * Chase (pilot mode): a smoothed third-person camera behind the ship that rolls with it.
 */
function CameraRig({ chasing, interior, docked, position, quaternion, crewWorld }: CameraRigProps) {
  const controls = useThree((s) => s.controls) as unknown as ControlsLike | null
  const camera = useThree((s) => s.camera)
  const scratch = useMemo(() => new THREE.Vector3(), [])
  const shipUp = useMemo(() => new THREE.Vector3(), [])
  const wasInterior = useRef(false)
  const wasDocked = useRef(false)

  useFrame((_, dt) => {
    if (!controls) return
    const step = Math.min(dt, 0.1)
    const focus = interior ? crewWorld.current : position.current

    // Entering or leaving the interior view: reposition the camera and set a near plane that suits
    // being a metre from things
    if (wasDocked.current !== docked) {
      wasDocked.current = docked
      if (docked) {
        camera.position.copy(EXTERIOR_OFFSET).add(position.current)
        controls.target.copy(focus)
      }
    }

    if (wasInterior.current !== interior) {
      wasInterior.current = interior
      setNearPlane(camera as THREE.PerspectiveCamera, interior ? 0.03 : 0.1)
      if (interior) camera.position.copy(INTERIOR_OFFSET).applyQuaternion(quaternion.current).add(crewWorld.current)
      else camera.position.copy(EXTERIOR_OFFSET).add(position.current)
      controls.target.copy(focus)
    }

    if (chasing) {
      scratch.copy(CHASE_OFFSET).applyQuaternion(quaternion.current).add(position.current)
      // After a Space-Fold the ship is hundreds of units from where the camera was: snap, don't glide
      if (camera.position.distanceToSquared(scratch) > 150 * 150) camera.position.copy(scratch)
      else camera.position.lerp(scratch, 1 - Math.exp(-CHASE_STIFFNESS * step))
      // Follow the ship's own "up" so pitching or rolling never flips the view at the poles
      shipUp.copy(WORLD_UP).applyQuaternion(quaternion.current)
      camera.up.lerp(shipUp, 1 - Math.exp(-CHASE_STIFFNESS * step)).normalize()
      camera.lookAt(position.current)
      // Re-entry rattles the camera
      if (shipState.heat > 0.05) shakeCamera(camera, shipState.heat * 0.18)
    } else {
      // The orbit controls assume a world-up camera, so ease back to it after chasing
      camera.up.lerp(WORLD_UP, 1 - Math.exp(-8 * step)).normalize()
      scratch.copy(focus).sub(controls.target)
      camera.position.add(scratch)
    }
    // Keeping the orbit target on the ship (or the crew) makes switching views seamless
    controls.target.copy(focus)
  })

  return null
}

/** Keeps the star dome centred on the camera so it never runs out when flying thousands of units. */
function FollowCamera({ children }: { children: ReactNode }) {
  const group = useRef<THREE.Group>(null)
  useFrame(({ camera }) => group.current?.position.copy(camera.position))
  return <group ref={group}>{children}</group>
}

type SceneProps = {
  onBlockCountChange: (n: number) => void
  selectedType: PlaceableBlockType
  mode: GameMode
  cameraView: CameraView
  /** Interior view: watch the crew from inside the ship */
  interior: boolean
  docked: boolean
  /** Freezes the whole physics world */
  paused: boolean
  onVictory: () => void
}

export default function Scene({ onBlockCountChange, selectedType, mode, cameraView, interior, docked, paused, onVictory }: SceneProps) {
  const chasing = mode === 'pilot' && cameraView === 'chase' && !interior
  const shipPosition = useRef(new THREE.Vector3())
  const shipQuaternion = useRef(new THREE.Quaternion())
  const crewWorld = useRef(new THREE.Vector3())
  const sector = useSector()
  const earth = sector.planets.find((p) => p.legendary)
  // Two nebula colours per sector: the system's accent, and its hue shifted round the wheel
  const nebula = useMemo(() => {
    const a = new THREE.Color(sector.accent)
    const hsl = { h: 0, s: 0, l: 0 }
    a.getHSL(hsl)
    const b = new THREE.Color().setHSL((hsl.h + 0.18) % 1, 0.75, 0.5)
    return { a: `#${a.getHexString()}`, b: `#${b.getHexString()}` }
  }, [sector.accent])

  return (
    <>
      <color attach="background" args={[sector.sky]} />
      {/* The sky travels with the camera so it is always infinitely far away */}
      <FollowCamera>
        <Nebula base={sector.sky} colorA={nebula.a} colorB={nebula.b} seed={sector.id + 3} />
        <Stars radius={250} depth={80} count={7000} factor={5} saturation={0} fade speed={0.5} />
        <SunDisc />
      </FollowCamera>

      <ambientLight intensity={0.2} />
      <hemisphereLight args={[sector.accent, '#05060a', 0.3]} />
      <SunLight target={shipPosition} />
      {/* A small studio-style environment (generated locally, no downloads) so metal has something to reflect */}
      <Environment resolution={64} frames={1} environmentIntensity={0.55}>
        <Lightformer form="rect" intensity={3} position={[6, 5, 4]} scale={[10, 6, 1]} color="#fff1dd" />
        <Lightformer form="rect" intensity={1.4} position={[-6, 2, -4]} scale={[8, 6, 1]} color={sector.accent} />
        <Lightformer form="rect" intensity={1} position={[0, -6, 0]} rotation-x={Math.PI / 2} scale={[12, 12, 1]} color="#5a6f99" />
      </Environment>

      {/* Everything below belongs to the current sector and is rebuilt from scratch when the ship folds */}
      <ScrapField key={`scrap-${sector.id}`} sector={sector} shipPosition={shipPosition} mode={mode} />

      {/* Victory lets the ship glide to rest, then freezes the physics world (ship, meteors, asteroids) */}
      <Physics gravity={[0, 0, 0]} allowSleep={false} isPaused={paused}>
        <Ship
          positionOut={shipPosition}
          quaternionOut={shipQuaternion}
          mode={mode}
          onBlockCountChange={onBlockCountChange}
          selectedType={selectedType}
          crewWorldOut={crewWorld}
          onVictory={onVictory}
        />
        <Fragment key={sector.id}>
          {earth && <Earth body={earth} shipPosition={shipPosition} />}
          {sector.stations.map((station) => (
            <SpaceStation key={station.name} station={station} />
          ))}
          {sector.planets
            .filter((p) => !p.legendary)
            .map((p) => (
              <Planet key={p.name} body={p} />
            ))}
          <Asteroids field={sector.asteroids} />
          <EventManager shipPosition={shipPosition} />
        </Fragment>
      </Physics>

      {/* Left-drag rotates, wheel zooms; panning is off because the camera stays centred on the ship */}
      <OrbitControls
        makeDefault
        enabled={!chasing}
        enablePan={false}
        minDistance={interior ? 0.4 : 4}
        maxDistance={interior ? 12 : docked ? 16 : 60}
      />
      <TargetTracker shipPosition={shipPosition} />
      <ReentryEffects shipPosition={shipPosition} />
      <CameraRig chasing={chasing} interior={interior} docked={docked} position={shipPosition} quaternion={shipQuaternion} crewWorld={crewWorld} />
      <Effects />
    </>
  )
}
