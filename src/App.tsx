import { Physics } from '@react-three/cannon'
import { Environment, Lightformer, OrbitControls, Stars } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import * as THREE from 'three'
import { Asteroids } from './game/Asteroids'
import { Ship } from './game/Ship'
import { CrewRegistration } from './CrewRegistration'
import { ROLES, crewProfile, setCrewProfile } from './game/crewProfile'
import { SPECIES } from './game/species'
import { dockInfo, requestDockToggle, useDock } from './game/dock'
import { SpaceStation } from './game/SpaceStation'
import { Earth } from './game/Earth'
import { Effects } from './game/Effects'
import { Nebula } from './game/Nebula'
import { SunDisc, SunLight } from './game/Sun'
import { EventManager } from './game/EventManager'
import { TASK_LABELS, nextTask, nextWaypoint, setTask, toggleAutopilot } from './game/autopilot'
import { ReentryEffects } from './game/ReentryEffects'
import { shipState } from './game/shipState'
import { actionsFor, closeContextMenu, runAction } from './game/targetActions'
import { cycleTarget, shipPositionRef } from './game/targetScreen'
import { ContextMenu, TargetReticle, TargetTracker } from './game/TargetSystem'
import { requestFold } from './game/fold'
import { BLOCK_COSTS, CELESTIAL_BODIES, FOLD_COST, REPAIR_COST, RELICS_NEEDED, emergencyRepair, gameStats, meteorTracks, notify, readGameStats, requestArrival } from './game/gameState'
import { getSector, useSector } from './game/sector'
import { Planet } from './game/Planet'
import { ScrapField } from './game/ScrapField'
import { AUTOPILOT_TIERS, HARVESTER_TIERS, upgrade } from './game/upgrades'
import { usePointerLock } from './game/usePointerLock'
import { crewStats, hazardStats, type CameraView, type GameMode, type PlaceableBlockType } from './game/types'

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

function Scene({ onBlockCountChange, selectedType, mode, cameraView, interior, docked, paused, onVictory }: SceneProps) {
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

const hudStyle: CSSProperties = {
  position: 'absolute',
  top: 16,
  left: 16,
  padding: '12px 16px',
  color: '#cfe8ff',
  font: '13px/1.6 ui-monospace, Consolas, monospace',
  background: 'rgba(5, 10, 25, 0.6)',
  border: '1px solid rgba(80, 160, 255, 0.3)',
  borderRadius: 8,
  pointerEvents: 'none',
  userSelect: 'none',
}

const buttonStyle: CSSProperties = {
  ...hudStyle,
  position: 'static',
  pointerEvents: 'auto',
  cursor: 'pointer',
  fontWeight: 700,
  letterSpacing: 2,
}

const panelStyle: CSSProperties = { ...hudStyle, position: 'static', top: undefined, left: undefined, minWidth: 260 }

const upgradeButtonStyle: CSSProperties = {
  marginTop: 4,
  padding: '3px 8px',
  border: '1px solid rgba(160,210,255,0.35)',
  borderRadius: 4,
  cursor: 'pointer',
  pointerEvents: 'auto',
}

const BLOCK_LABELS: Record<PlaceableBlockType, string> = { hull: 'Hull', food: 'Food Dispenser', arcade: 'Arcade' }
const BLOCK_COLORS: Record<PlaceableBlockType, string> = { hull: '#fff', food: '#4dffb8', arcade: '#f08cff' }
const BLOCK_ORDER: PlaceableBlockType[] = ['hull', 'food', 'arcade']

function Bar({ label, value }: { label: string; value: number }) {
  const color = value < 25 ? '#ff5d5d' : value < 50 ? '#ffc94d' : '#4dffb8'
  return (
    <div style={{ marginTop: 4 }}>
      {label} <span style={{ float: 'right' }}>{Math.round(value)}</span>
      <div style={{ height: 6, background: 'rgba(255,255,255,0.12)', borderRadius: 3 }}>
        <div style={{ width: `${value}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
    </div>
  )
}

/** Samples a per-frame mutable object a few times a second so React doesn't re-render at 60fps. */
function useSampled<T>(read: () => T, intervalMs = 200): T {
  const [snapshot, setSnapshot] = useState<T>(read)

  useEffect(() => {
    const id = setInterval(() => setSnapshot(read()), intervalMs)
    return () => clearInterval(id)
  }, [read, intervalMs])

  return snapshot
}

const readCrew = () => ({ ...crewStats })
const readHazards = () => ({ ...hazardStats })

function SystemsPanel() {
  const game = useSampled(readGameStats)
  const harvester = HARVESTER_TIERS[game.harvesterTier - 1]
  const nextHarvester = HARVESTER_TIERS[game.harvesterTier]
  const autopilot = AUTOPILOT_TIERS[game.autopilotTier - 1]
  const nextAutopilot = AUTOPILOT_TIERS[game.autopilotTier]
  const ap = game.autopilot

  const upgradeButton = (system: 'harvester' | 'autopilot', key: string, next?: { name: string; cost: number }) => (
    <div
      role="button"
      onClick={() => upgrade(system)}
      style={{ ...upgradeButtonStyle, color: next && game.scrap < next.cost ? '#ff8a8a' : '#cfe8ff' }}
    >
      {next ? `[${key}] Upgrade → ${next.name} · ${next.cost} Scrap` : 'Max tier'}
    </div>
  )

  return (
    <div style={panelStyle}>
      <div style={{ fontWeight: 700, letterSpacing: 2, color: '#9dff9d' }}>SYSTEMS</div>

      <div style={{ marginTop: 6, color: harvester.beamColor, fontWeight: 700 }}>
        Harvester: {harvester.name} (T{game.harvesterTier})
      </div>
      <div style={{ opacity: 0.8 }}>
        Range {harvester.range} u · {harvester.collectTime}s per scrap{harvester.autoRange > 0 && ` · auto-pull ${harvester.autoRange} u`}
      </div>
      <div>{game.harvest.text}</div>
      {game.harvest.progress > 0 && <Bar label="Beam" value={game.harvest.progress * 100} />}
      {upgradeButton('harvester', 'U', nextHarvester)}

      <div style={{ marginTop: 10, fontWeight: 700, color: ap.engaged ? '#4dffb8' : '#cfe8ff' }}>
        Auto-Pilot: [{TASK_LABELS[ap.task]}] {ap.engaged ? 'ENGAGED' : 'OFF'} [P]
      </div>
      <div style={{ display: 'flex', gap: 6, margin: '4px 0' }}>
        {(['nav', 'harvest', 'hold', 'evac'] as const).map((task) => (
          <div
            key={task}
            role="button"
            onClick={() => setTask(task, { intent: 'choose' })}
            style={{
              pointerEvents: 'auto',
              cursor: 'pointer',
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 700,
              color: ap.task === task ? '#021014' : '#cfe8ff',
              background: ap.task === task ? '#4dffb8' : 'transparent',
              border: '1px solid rgba(160,210,255,0.4)',
            }}
          >
            {TASK_LABELS[task]}
          </div>
        ))}
      </div>
      <div style={{ opacity: 0.65, fontSize: 11 }}>Shift+P cycle task · T / middle-click: lock target</div>
      {(ap.task === 'nav' || ap.task === 'orbit' || ap.task === 'land') && (
        <div>
          Destination: <span style={{ color: '#fff' }}>{CELESTIAL_BODIES[ap.destination]?.name ?? '—'}</span> [N]
        </div>
      )}
      <div>
        Intelligence: <span style={{ color: '#fff' }}>{autopilot.name} (T{game.autopilotTier})</span>
      </div>
      <div style={{ opacity: 0.8 }}>{autopilot.blurb}</div>
      {ap.engaged && (
        <div>
          Auto-Pilot: <span style={{ color: '#4dffb8' }}>[{TASK_LABELS[ap.task]}] {ap.status}</span>
        </div>
      )}
      {upgradeButton('autopilot', 'I', nextAutopilot)}

      <div style={{ marginTop: 10, fontWeight: 700, color: '#d6a8ff' }}>Fold Drive [J]</div>
      <div style={{ opacity: 0.8 }}>Space-Fold to a new star system · {FOLD_COST} Scrap</div>
      <div>
        {game.fold.phase === 'charging'
          ? `Charging ${Math.round(game.fold.charge * 100)}%`
          : game.fold.phase === 'arriving'
            ? 'Arriving…'
            : 'Ready (pilot mode)'}
      </div>

      <div style={{ marginTop: 8, opacity: 0.8 }}>Thrust used: {game.thrustUsed.toFixed(1)} s</div>
    </div>
  )
}

function CrewPanel() {
  const snapshot = useSampled(readCrew)
  const hazards = useSampled(readHazards)

  return (
    <div style={panelStyle}>
      <div style={{ fontWeight: 700, letterSpacing: 2, color: '#ffb36b' }}>
        CREW · {crewProfile.name} ({SPECIES[crewProfile.species].name} {ROLES[crewProfile.role].name})
      </div>
      {SPECIES[crewProfile.species].hungerImmune ? (
        <div style={{ marginTop: 4, color: '#4dffb8' }}>Hunger: IMMUNE</div>
      ) : (
        <Bar label="Hunger" value={snapshot.hunger} />
      )}
      <Bar label="Sanity" value={snapshot.sanity} />
      {SPECIES[crewProfile.species].photosynthesis && (
        <div style={{ marginTop: 4, color: snapshot.lit ? '#a6ff5a' : '#8aa' }}>
          Photosynthesis: {snapshot.lit ? 'basking, regrowing' : 'in the dark'}
        </div>
      )}
      {SPECIES[crewProfile.species].shipRepair > 0 && <div style={{ marginTop: 4, color: '#7fe3ff' }}>Bioluminescent: mending the hull</div>}
      <div style={{ marginTop: 8 }}>
        Action: <span style={{ color: '#fff' }}>{snapshot.action}</span>
      </div>
      <div style={{ marginTop: 8, color: hazards.meteors > 0 ? '#ff7a4d' : undefined }}>
        Meteors in range: {hazards.meteors}
      </div>
      {SPECIES[crewProfile.species].meteorWarning && <MeteorWarnings />}
    </div>
  )
}

type ShipPanelProps = {
  mode: GameMode
  cameraView: CameraView
  interior: boolean
  mouseLocked: boolean
  selectedType: PlaceableBlockType
  blockCount: number
}

function ShipPanel({ mode, cameraView, interior, mouseLocked, selectedType, blockCount }: ShipPanelProps) {
  const game = useSampled(readGameStats)
  const sector = useSector()
  const cost = BLOCK_COSTS[selectedType]
  const notice = game.notice

  return (
    <div style={hudStyle}>
      <div style={{ fontWeight: 700, letterSpacing: 2, color: '#7fd4ff' }}>COSMOHAVEN · SHIPYARD</div>
      <div>Blocks: {blockCount} · Mass: {blockCount} t</div>
      <div style={{ color: '#ffd633' }}>Scrap Metal: {game.scrap}</div>
      <div style={{ color: '#d6a8ff' }}>Sector: {sector.name}</div>
      <div style={{ color: '#5ff0ff' }}>
        Signal Relics: {game.relics}/{RELICS_NEEDED}
        {game.relicDistance !== null && ` · beacon ${Math.round(game.relicDistance).toLocaleString()} u`}
      </div>
      {game.relics >= RELICS_NEEDED && Number.isFinite(game.distanceToEarth) === false && (
        <div style={{ color: '#9fd4ff', fontWeight: 700 }}>EARTH 2.0 DECODED: fold [J] to reach it</div>
      )}
      {Number.isFinite(game.distanceToEarth) && <div>Earth 2.0: {Math.round(game.distanceToEarth).toLocaleString()} u away</div>}
      {game.well && (
        <div style={{ color: '#7fe3ff', fontSize: 12 }}>
          <div style={{ fontWeight: 700 }}>GRAVITY WELL DETECTED: {game.well.name}</div>
          <div style={{ opacity: 0.85 }}>
            Alt {Math.round(game.well.altitude).toLocaleString()} u · Speed {Math.round(game.well.speed)} · Orbit speed{' '}
            {Math.round(game.well.orbitSpeed)} u/s
          </div>
          {game.well.inAtmosphere && <div style={{ color: '#ffb36b', fontWeight: 700 }}>ATMOSPHERE: drag &amp; turbulence</div>}
        </div>
      )}
      <div style={{ color: game.hull < 35 ? '#ff5d5d' : game.hull < 70 ? '#ffc94d' : '#4dffb8' }}>Hull Integrity: {Math.round(game.hull)}%</div>
      <div>
        Status: <span style={{ color: mode === 'pilot' ? '#ffcc33' : '#7fd4ff' }}>{mode === 'pilot' ? 'IN FLIGHT' : 'DOCKED · SHIPYARD'}</span>
      </div>
      {interior && (
        <div>
          Camera: <span style={{ color: '#ffb36b' }}>INTERIOR (crew)</span> · drag to look, scroll to zoom
        </div>
      )}
      {mode === 'pilot' && !interior && (
        <div>
          Camera: <span style={{ color: '#ffcc33' }}>{cameraView === 'chase' ? 'CHASE' : 'ORBIT'}</span> · Mouse:{' '}
          <span style={{ color: mouseLocked ? '#4dffb8' : '#ffcc33' }}>
            {mouseLocked ? 'STEERING' : cameraView === 'chase' ? 'CLICK TO CAPTURE' : 'OFF (ORBIT)'}
          </span>
        </div>
      )}
      {mode === 'build' && (
        <div>
          Build: <span style={{ color: BLOCK_COLORS[selectedType] }}>{BLOCK_LABELS[selectedType]}</span> ·{' '}
          <span style={{ color: game.scrap < cost ? '#ff5d5d' : '#ffd633' }}>Cost: {cost} Scrap</span>
        </div>
      )}
      <div style={{ marginTop: 8, opacity: 0.8 }}>
        V — interior view: watch the crew up close
        <br />
        U / I — upgrade Harvester / Auto-Pilot
        <br />
        {mode === 'build' ? (
          <>
            Click a block face — queue a block (drones build it)
            <br />
            Shift+click a block — dismantle it (50% back)
            <br />
            1 / 2 / 3 / Q — Hull / Food / Arcade / cycle
            <br />
            Drag — orbit camera · Scroll — zoom
            <br />
            E — undock and depart
          </>
        ) : (
          <>
            Mouse — steer: left / right yaw, up / down pitch
            <br />
            (click to capture, Esc to release)
            <br />
            W / S — thrust forward / back
            <br />
            A / D — yaw left / right
            <br />
            ↑ / ↓ — pitch nose down / up
            <br />
            Q / E — roll left / right
            <br />
            Space / Shift — strafe up / down
            <br />
            C — chase / orbit camera{cameraView === 'orbit' && ' (drag to look around)'}
            <br />
            F — hold to harvest Scrap with the beam
            <br />
            P — auto-pilot on / off · N — next waypoint
            <br />
            J — Space-Fold to a new star system ({FOLD_COST} Scrap)
            <br />
            E — dock when near a station
            <br />
            R — emergency hull repair ({REPAIR_COST} Scrap)
            <br />
            Ships can only be built at a drydock!
            <br />
            Find 5 Signal Relics to unlock Earth 2.0!
          </>
        )}
      </div>
      {notice && (
        <div
          style={{
            marginTop: 8,
            fontWeight: 700,
            color: notice.kind === 'warning' ? '#ff5d5d' : '#ffd633',
          }}
        >
          {notice.text}
        </div>
      )}
    </div>
  )
}

/** The arrival choice, orbital insertion, and landing telemetry, shown while the ship is inside a planet's sphere of influence. */
function ArrivalPanel() {
  const game = useSampled(readGameStats, 100)
  const a = game.arrival
  const body = CELESTIAL_BODIES[a.body]
  if (a.phase === 'none' || !body) return null

  const well = game.well
  const altitude = well?.altitude ?? 0
  const vertical = well?.radialSpeed ?? 0
  const orbitSpeed = well?.orbitSpeed ?? 0
  const safe = -vertical <= 12
  const box: CSSProperties = {
    position: 'absolute',
    top: 16,
    left: '50%',
    transform: 'translateX(-50%)',
    minWidth: 360,
    padding: '12px 20px',
    textAlign: 'center',
    font: '14px/1.55 ui-monospace, Consolas, monospace',
    color: '#dff6ff',
    background: 'rgba(6, 16, 34, 0.85)',
    border: '1px solid rgba(80, 200, 255, 0.55)',
    borderRadius: 12,
    boxShadow: '0 0 28px rgba(60, 170, 255, 0.25)',
  }
  const choiceButton = (key: string, label: string, color: string, onClick: () => void) => (
    <div
      role="button"
      onClick={onClick}
      style={{ pointerEvents: 'auto', cursor: 'pointer', padding: '8px 16px', borderRadius: 8, fontWeight: 700, color, border: `1px solid ${color}`, background: 'rgba(255,255,255,0.05)' }}
    >
      [{key}] {label}
    </div>
  )

  const title = (text: string, color = '#7fe3ff') => <div style={{ fontWeight: 800, letterSpacing: 3, color }}>{text}</div>

  return (
    <div style={box}>
      {a.phase === 'choice' && (
        <>
          {title(`SPHERE OF INFLUENCE: ${body.name.toUpperCase()}`)}
          <div style={{ opacity: 0.85 }}>
            Altitude {Math.round(altitude).toLocaleString()} u · Speed {Math.round(well?.speed ?? 0)} u/s · Circular orbit here: {Math.round(orbitSpeed)} u/s
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 8 }}>
            {choiceButton('O', 'ENTER ORBIT', '#4dffb8', () => requestArrival('orbit'))}
            {choiceButton('L', 'INITIATE LANDING', '#ffb347', () => requestArrival('land'))}
          </div>
        </>
      )}
      {a.phase === 'insertion' && (
        <>
          {title('ORBITAL INSERTION', '#4dffb8')}
          <div>{game.autopilot.status}</div>
          <div style={{ opacity: 0.8 }}>Target orbit speed {Math.round(orbitSpeed)} u/s · any control input cancels</div>
        </>
      )}
      {a.phase === 'orbiting' && (
        <>
          {title('ORBIT LOCKED', '#4dffb8')}
          <div>
            {body.name} · altitude {Math.round(altitude).toLocaleString()} u · {Math.round(well?.speed ?? 0)} u/s · engine off
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 6 }}>
            {choiceButton('L', 'DE-ORBIT AND LAND', '#ffb347', () => requestArrival('land'))}
          </div>
        </>
      )}
      {a.phase === 'deorbit' && (
        <>
          {title('DE-ORBIT BURN', '#ffb347')}
          <div>{game.autopilot.status}</div>
        </>
      )}
      {a.phase === 'descent' && (
        <>
          {title(well?.inAtmosphere ? 'ATMOSPHERIC RE-ENTRY' : 'DESCENT', well?.inAtmosphere ? '#ff8a4d' : '#ffb347')}
          <div>
            Altitude <b>{Math.round(altitude).toLocaleString()}</b> u · Vertical{' '}
            <b style={{ color: safe ? '#4dff88' : '#ff5d5d' }}>{vertical.toFixed(1)}</b> u/s{' '}
            <span style={{ color: safe ? '#4dff88' : '#ff5d5d' }}>{safe ? '(safe)' : '(TOO FAST: under 12 to land)'}</span>
          </div>
          <div>
            Throttle lever <b>{Math.round(a.lever * 100)}%</b>{game.autopilot.engaged ? ' · AUTO-LANDING' : ''}
          </div>
          <div style={{ opacity: 0.75, fontSize: 12 }}>Space / Shift: throttle up / down · touch down under 12 u/s</div>
        </>
      )}
      {a.phase === 'landed' && (
        <>
          {title(`LANDED ON ${body.name.toUpperCase()}`, '#4dff88')}
          <div style={{ opacity: 0.8 }}>Thrust away to lift off</div>
        </>
      )}
    </div>
  )
}

type Warning = { id: number; eta: number; miss: number }

/** Felinian whisker-sense: meteors that will pass close, and how long until they do. Looks 20 s ahead. */
function readWarnings(): Warning[] {
  const ship = shipPositionRef.current
  const warnings: Warning[] = []
  for (const [id, track] of meteorTracks) {
    const relX = track.position[0] - ship.x
    const relY = track.position[1] - ship.y
    const relZ = track.position[2] - ship.z
    const vx = track.velocity[0] - shipState.velocity.x
    const vy = track.velocity[1] - shipState.velocity.y
    const vz = track.velocity[2] - shipState.velocity.z
    const speedSq = vx * vx + vy * vy + vz * vz
    if (speedSq < 1e-3) continue
    const eta = -(relX * vx + relY * vy + relZ * vz) / speedSq
    if (eta < 0 || eta > 20) continue
    const miss = Math.hypot(relX + vx * eta, relY + vy * eta, relZ + vz * eta)
    if (miss < 30) warnings.push({ id, eta, miss })
  }
  return warnings.sort((a, b) => a.eta - b.eta).slice(0, 3)
}

function MeteorWarnings() {
  const warnings = useSampled(readWarnings, 250)
  if (warnings.length === 0) return <div style={{ marginTop: 4, color: '#8aa' }}>Whiskers: all quiet</div>
  return (
    <div style={{ marginTop: 6, color: '#ffb36b', fontWeight: 700 }}>
      {warnings.map((w) => (
        <div key={w.id}>
          ⚠ Meteor in {w.eta.toFixed(0)} s (passes {w.miss.toFixed(0)} u {w.miss < 12 ? '- DIRECT HIT' : 'away'})
        </div>
      ))}
    </div>
  )
}

const readDock = () => ({ ...dockInfo })

/** The "Press [E] to Dock" prompt that appears near a station, and a warning when going too fast. */
function DockPrompt() {
  const info = useSampled(readDock, 100)
  if (!info.prompt) return null
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 96,
        transform: 'translateX(-50%)',
        padding: '12px 26px',
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: 18,
        fontWeight: 700,
        letterSpacing: 2,
        color: info.canDock ? '#4dffb8' : '#ffc94d',
        background: 'rgba(5, 14, 30, 0.8)',
        border: `1px solid ${info.canDock ? '#4dffb8' : '#ffc94d'}`,
        borderRadius: 10,
        boxShadow: `0 0 24px ${info.canDock ? 'rgba(77,255,184,0.35)' : 'rgba(255,201,77,0.3)'}`,
        pointerEvents: 'none',
      }}
    >
      {info.stationName && <div style={{ fontSize: 12, opacity: 0.75, letterSpacing: 3 }}>{info.stationName.toUpperCase()}</div>}
      {info.prompt}
    </div>
  )
}

/** Undock when docked; dock when a station is in range. */
function DockButton() {
  const dock = useDock()
  const info = useSampled(readDock, 150)
  if (dock.phase === 'docked') {
    return (
      <div role="button" onClick={requestDockToggle} style={buttonStyle}>
        UNDOCK [E]
      </div>
    )
  }
  if (dock.phase === 'free' && info.canDock) {
    return (
      <div role="button" onClick={requestDockToggle} style={{ ...buttonStyle, color: '#4dffb8' }}>
        DOCK AT SHIPYARD [E]
      </div>
    )
  }
  return null
}

/** The shipyard's assembly panel: pick a block to build and watch the drones work through the queue. */
function ShipyardPanel({ selectedType, onSelect }: { selectedType: PlaceableBlockType; onSelect: (type: PlaceableBlockType) => void }) {
  const game = useSampled(readGameStats)
  const dock = useDock()
  const station = getSector().stations[dock.stationId]

  return (
    <div style={{ ...hudStyle, top: undefined, bottom: 90, width: 270 }}>
      <div style={{ fontWeight: 700, letterSpacing: 2, color: '#ffb347' }}>SHIPYARD ASSEMBLY</div>
      <div style={{ opacity: 0.75, fontSize: 12 }}>{station?.name ?? 'Drydock'} · bay 1</div>

      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {BLOCK_ORDER.map((type, i) => (
          <div
            key={type}
            role="button"
            onClick={() => onSelect(type)}
            style={{
              pointerEvents: 'auto',
              cursor: 'pointer',
              padding: '5px 10px',
              borderRadius: 6,
              display: 'flex',
              justifyContent: 'space-between',
              border: type === selectedType ? `1px solid ${BLOCK_COLORS[type]}` : '1px solid rgba(255,255,255,0.12)',
              background: type === selectedType ? 'rgba(255,255,255,0.1)' : 'transparent',
              color: BLOCK_COLORS[type],
            }}
          >
            <span>
              [{i + 1}] {BLOCK_LABELS[type]}
            </span>
            <span style={{ color: game.scrap < BLOCK_COSTS[type] ? '#ff5d5d' : '#ffd633' }}>{BLOCK_COSTS[type]}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 8 }}>
        Assembly queue: {game.construction.length === 0 ? <span style={{ opacity: 0.6 }}>idle</span> : game.construction.length}
      </div>
      {game.construction.slice(0, 4).map((item, i) => (
        <div key={i} style={{ marginTop: 3 }}>
          <div style={{ fontSize: 12, opacity: 0.85 }}>
            {i === 0 ? 'Building' : 'Queued'}: {BLOCK_LABELS[item.type]}
          </div>
          {i === 0 && <Bar label="" value={item.progress * 100} />}
        </div>
      ))}
    </div>
  )
}

const readFold = () => ({ ...gameStats.fold })

/** A violet-white flash that builds while the fold drive charges and fades out on arrival. */
function FoldOverlay() {
  const fold = useSampled(readFold, 50)
  const opacity = fold.phase === 'charging' ? fold.charge ** 2 * 0.92 : fold.phase === 'arriving' ? 1 - fold.charge : 0

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        opacity,
        transition: 'opacity 0.1s linear',
        background:
          'radial-gradient(circle at center, rgba(255,255,255,0.95) 0%, rgba(190,150,255,0.85) 35%, rgba(60,20,130,0.92) 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 'clamp(20px, 4vw, 48px)',
        fontWeight: 800,
        letterSpacing: 6,
        textShadow: '0 0 24px #8a5cff',
      }}
    >
      {fold.phase === 'charging' && `SPACE-FOLD ${Math.round(fold.charge * 100)}%`}
    </div>
  )
}

function VictoryOverlay() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        padding: 24,
        textAlign: 'center',
        background: 'radial-gradient(circle, rgba(2,10,30,0.55) 0%, rgba(0,0,0,0.92) 100%)',
        animation: 'fade-in 2.5s ease-out both',
        color: '#e8f6ff',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div
        style={{
          fontSize: 'clamp(32px, 6vw, 84px)',
          fontWeight: 800,
          lineHeight: 1.1,
          textShadow: '0 0 30px #3a8dff, 0 0 80px #3fd07a',
          animation: 'fade-in 2s ease-out 1.2s both',
        }}
      >
        Victory: Colony Established on Earth 2.0!
      </div>
      <div style={{ fontSize: 'clamp(14px, 2vw, 22px)', opacity: 0.85, animation: 'fade-in 2s ease-out 2.2s both' }}>
        The crew of the CosmoHaven has found a new home.
      </div>
      <div
        role="button"
        onClick={() => window.location.reload()}
        style={{
          padding: '12px 28px',
          border: '1px solid rgba(160,210,255,0.6)',
          borderRadius: 8,
          cursor: 'pointer',
          letterSpacing: 2,
          fontWeight: 700,
          animation: 'fade-in 2s ease-out 3s both',
        }}
      >
        PLAY AGAIN
      </div>
    </div>
  )
}

export default function App() {
  const [blockCount, setBlockCount] = useState(1)
  const [selectedType, setSelectedType] = useState<PlaceableBlockType>('hull')
  const [started, setStarted] = useState(false)
  // Building is only possible docked at a drydock, so the mode follows the docking state
  const dock = useDock()
  const mode: GameMode = dock.phase === 'docked' ? 'build' : 'pilot'
  const [cameraView, setCameraView] = useState<CameraView>('chase')
  const [interior, setInterior] = useState(false)
  const [victory, setVictory] = useState(false)
  // Physics keeps running briefly after victory so the ship (now heavily damped) glides to a stop
  const [frozen, setFrozen] = useState(false)
  useEffect(() => {
    if (!victory) return
    const id = setTimeout(() => setFrozen(true), 2500)
    return () => clearTimeout(id)
  }, [victory])

  // Mouse steering grabs the pointer in pilot mode; orbit view needs the cursor for drag-to-look
  const mouseLocked = usePointerLock(mode === 'pilot' && cameraView === 'chase' && !interior && !victory)

  const toggleCameraView = () => setCameraView((v) => (v === 'chase' ? 'orbit' : 'chase'))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || !started || (e.target as HTMLElement | null)?.tagName === 'INPUT') return
      if (e.code === 'KeyM') notify('Ships can only be modified while docked at a drydock', 'warning', 3000)
      else if (e.code === 'KeyE') requestDockToggle()
      else if (e.code === 'KeyV') setInterior((v) => !v)
      else if (e.code === 'KeyU') upgrade('harvester')
      else if (e.code === 'KeyI') upgrade('autopilot')
      else if (e.code === 'KeyN') nextWaypoint()
      else if (mode === 'pilot') {
        // Q / E are roll controls while flying, so block selection only applies in build mode
        if (e.code === 'KeyC') setCameraView((v) => (v === 'chase' ? 'orbit' : 'chase'))
        else if (e.code === 'KeyP' && !victory) {
          if (e.shiftKey) nextTask()
          else toggleAutopilot()
        } else if (e.code === 'KeyT') cycleTarget()
        else if (e.code === 'KeyO') requestArrival('orbit')
        else if (e.code === 'KeyL') requestArrival('land')
        else if (e.code === 'Escape') closeContextMenu()
        else if (/^Digit[1-4]$/.test(e.code)) {
          // The locked target's contextual actions, by number
          const target = gameStats.target
          const action = target ? actionsFor(target.kind)[Number(e.code.slice(5)) - 1] : undefined
          if (target && action) runAction(action.id, target)
        }
        else if (e.code === 'KeyJ' && !victory) requestFold()
        else if (e.code === 'KeyR' && !victory) emergencyRepair()
      } else if (e.code === 'Digit1') setSelectedType('hull')
      else if (e.code === 'Digit2') setSelectedType('food')
      else if (e.code === 'Digit3') setSelectedType('arcade')
      else if (e.code === 'KeyQ') setSelectedType((t) => BLOCK_ORDER[(BLOCK_ORDER.indexOf(t) + 1) % BLOCK_ORDER.length])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, victory, started])

  if (!started) {
    return (
      <CrewRegistration
        onStart={(profile) => {
          setCrewProfile(profile)
          setStarted(true)
        }}
      />
    )
  }

  return (
    <>
      {/* flat: no built-in tone mapping, the post-processing stack does it after the bloom */}
      <Canvas shadows flat gl={{ antialias: false }} onPointerMissed={() => closeContextMenu()} camera={{ position: [6, 5, 9], fov: 60, far: 10000 }} dpr={[1, 2]}>
        <Scene
          onBlockCountChange={setBlockCount}
          selectedType={selectedType}
          mode={mode}
          cameraView={cameraView}
          interior={interior}
          docked={mode === 'build'}
          paused={frozen}
          onVictory={() => setVictory(true)}
        />
      </Canvas>

      <ShipPanel mode={mode} cameraView={cameraView} interior={interior} mouseLocked={mouseLocked} selectedType={selectedType} blockCount={blockCount} />

      <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <CrewPanel />
        <SystemsPanel />
      </div>

      {mode === 'build' && <ShipyardPanel selectedType={selectedType} onSelect={setSelectedType} />}
      <DockPrompt />
      <ArrivalPanel />
      <TargetReticle />
      <ContextMenu />

      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 20,
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 12,
        }}
      >
        <DockButton />
        <div role="button" onClick={() => setInterior((v) => !v)} style={buttonStyle}>
          VIEW: {interior ? 'INTERIOR' : 'EXTERIOR'} [V]
        </div>
        {mode === 'pilot' && !interior && (
          <div role="button" onClick={toggleCameraView} style={buttonStyle}>
            CAMERA: {cameraView === 'chase' ? 'CHASE' : 'ORBIT'} [C]
          </div>
        )}
      </div>

      <FoldOverlay />

      {victory && <VictoryOverlay />}
    </>
  )
}
