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

/** No asteroids or scrap are generated this close to a station's centre. */
export const STATION_KEEP_OUT = 85

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
