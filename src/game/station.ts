import type { Triplet } from '@react-three/cannon'
import * as THREE from 'three'
import type { ServiceId } from './services'

/** A Space Station with a drydock: the only place the ship can be built or modified. */
export type StationSpec = {
  id: number
  name: string
  position: Triplet
  /** Rotation about the vertical axis; the hangar opens towards the station's local +Z */
  yaw: number
  /** What the station offers; leave out for a full drydock hub (every service) */
  services?: ServiceId[]
}

/** The hangar bay's clear interior, in station-local units; it opens at z = 0 and runs back to z = -depth. */
export const BAY = { width: 18, height: 14, depth: 30 }
/** Where the ship's centre of mass rests when docked, and the point just outside the opening it flies through. */
export const SLOT_LOCAL: Triplet = [0, -3.5, -13]
export const ENTRANCE_LOCAL: Triplet = [0, -3.5, 8]

/** How close to the entrance, and how slowly, the ship must be to dock. */
export const DOCK_RANGE = 50
export const DOCK_MAX_SPEED = 20
export const DOCK_TIME = 3 // seconds the docking manoeuvre takes
export const UNDOCK_TIME = 2.2

// ---------- Layout (station-local units; the hangar opens towards +Z) ----------

/** Thickness of the hangar walls */
export const WALL = 1.5
export const RING_Z = -57
export const RING_RADIUS = 22
export const SPINE_LENGTH = 52
/** Habitat ring tube radius, and where the solar arrays sit (centre x, half span, half width) */
export const RING_TUBE = 2.6
export const SOLAR_ARRAY = { x: 22, halfSpan: 11, halfWidth: 4.5, z: -BAY.depth - SPINE_LENGTH + 4 }

export type StationShape = { type: 'Box'; args: Triplet; position: Triplet; rotation?: Triplet }

/** Static physics shapes: the hangar shell, the spine and the habitat ring. The hangar itself is empty space. */
export function stationCollisionShapes(): StationShape[] {
  const halfW = BAY.width / 2
  const halfH = BAY.height / 2
  const shapes: StationShape[] = [
    { type: 'Box', args: [BAY.width + WALL * 2, WALL, BAY.depth + WALL], position: [0, -halfH - WALL / 2, -BAY.depth / 2 - WALL / 2] },
    { type: 'Box', args: [BAY.width + WALL * 2, WALL, BAY.depth + WALL], position: [0, halfH + WALL / 2, -BAY.depth / 2 - WALL / 2] },
    { type: 'Box', args: [WALL, BAY.height + WALL * 2, BAY.depth + WALL], position: [-halfW - WALL / 2, 0, -BAY.depth / 2 - WALL / 2] },
    { type: 'Box', args: [WALL, BAY.height + WALL * 2, BAY.depth + WALL], position: [halfW + WALL / 2, 0, -BAY.depth / 2 - WALL / 2] },
    { type: 'Box', args: [BAY.width + WALL * 2, BAY.height + WALL * 2, WALL], position: [0, 0, -BAY.depth - WALL / 2] },
    { type: 'Box', args: [8.4, 8.4, SPINE_LENGTH], position: [0, 0, -BAY.depth - SPINE_LENGTH / 2] },
  ]
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2
    shapes.push({
      type: 'Box',
      args: [(2 * Math.PI * RING_RADIUS) / 12 + 1, 5.4, 5.4],
      position: [Math.cos(angle) * RING_RADIUS, Math.sin(angle) * RING_RADIUS, RING_Z],
      rotation: [0, 0, angle + Math.PI / 2],
    })
  }
  return shapes
}
/** No asteroids or scrap are generated this close to a station's centre. */
export const STATION_KEEP_OUT = 85

/** How far from the station's centre the farthest part (the solar array corners, the beacon) reaches */
export const STATION_EXTENT = Math.max(
  Math.hypot(SOLAR_ARRAY.x + SOLAR_ARRAY.halfSpan, SOLAR_ARRAY.z - SOLAR_ARRAY.halfWidth),
  BAY.depth + SPINE_LENGTH + 3,
)
/** The auto-pilot routes round a sphere of this radius: the whole structure plus a margin for the ship and its drift */
export const STATION_AVOID_RADIUS = Math.ceil(STATION_EXTENT) + 10

export type StationPose = {
  quaternion: THREE.Quaternion
  departureQuaternion: THREE.Quaternion
  slot: THREE.Vector3
  entrance: THREE.Vector3
  /** Unit vector pointing out of the hangar, in world space */
  outward: THREE.Vector3
}

/** The station's frame in world space. Allocates, so call it on state changes, not every frame. */
export function stationPose(station: StationSpec): StationPose {
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, station.yaw, 0))
  const departureQuaternion = quaternion
    .clone()
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI))
  const origin = new THREE.Vector3(...station.position)
  const toWorld = (local: Triplet) => new THREE.Vector3(...local).applyQuaternion(quaternion).add(origin)
  return {
    quaternion,
    departureQuaternion,
    slot: toWorld(SLOT_LOCAL),
    entrance: toWorld(ENTRANCE_LOCAL),
    outward: new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion),
  }
}
