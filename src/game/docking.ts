import type { Triplet } from '@react-three/cannon'
import { useFrame } from '@react-three/fiber'
import { useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { dockInfo, dockRequests, getDock, setDock } from './dock'
import { notify, repairHull, setAutopilot } from './gameState'
import { getSector } from './sector'
import { DOCK_MAX_SPEED, DOCK_RANGE, DOCK_TIME, UNDOCK_TIME, stationPose, type StationPose } from './station'

const smooth = (t: number) => t * t * (3 - 2 * t)

type Api = {
  position: { set: (x: number, y: number, z: number) => void }
  quaternion: { set: (x: number, y: number, z: number, w: number) => void }
  velocity: { set: (x: number, y: number, z: number) => void }
  angularVelocity: { set: (x: number, y: number, z: number) => void }
  mass: { set: (mass: number) => void }
}

type DockingArgs = {
  api: Api
  positionOut: RefObject<THREE.Vector3>
  quaternionOut: RefObject<THREE.Quaternion>
  /** Latest worker velocity, for the "slow down to dock" check */
  velocity: RefObject<Triplet>
  /** Mass to give the body when it is released, as the block count can change while docked */
  shipMass: RefObject<number>
  /** True while blocks are still being assembled; the ship can't leave until they're done */
  busy: RefObject<boolean>
}

/**
 * Drives the docking state machine every frame: finds a station in range, shows the prompt, and on request
 * flies the ship along a curve into the hangar slot (docking) or back out of the bay (undocking). While
 * docked, undocking or docking the ship's mass is zero so it can't be pushed, and the controller sets its pose.
 */
export function useDocking({ api, positionOut, quaternionOut, velocity, shipMass, busy }: DockingArgs) {
  const anim = useRef({
    t: 0,
    pose: null as StationPose | null,
    startPosition: new THREE.Vector3(),
    startQuaternion: new THREE.Quaternion(),
    exit: new THREE.Vector3(),
    scratch: new THREE.Vector3(),
    q: new THREE.Quaternion(),
  })

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const dock = getDock()
    const a = anim.current
    const requested = dockRequests.toggle
    dockRequests.toggle = false

    if (dock.phase === 'free') {
      // Is there a station close enough, and are we slow enough?
      const stations = getSector().stations
      let nearest = -1
      let nearestDistance = Infinity
      for (let i = 0; i < stations.length; i++) {
        const entrance = stationPose(stations[i]).entrance
        const distance = positionOut.current.distanceTo(entrance)
        if (distance < nearestDistance) {
          nearest = i
          nearestDistance = distance
        }
      }
      const speed = Math.hypot(...velocity.current)
      const inRange = nearest >= 0 && nearestDistance < DOCK_RANGE
      dockInfo.canDock = inRange && speed < DOCK_MAX_SPEED
      dockInfo.stationName = inRange ? stations[nearest].name : ''
      dockInfo.prompt = !inRange ? '' : speed < DOCK_MAX_SPEED ? 'Press [E] to Dock at Shipyard' : `Slow down to dock (${Math.round(speed)} / ${DOCK_MAX_SPEED} u/s)`

      if (requested && dockInfo.canDock) {
        const station = stations[nearest]
        a.pose = stationPose(station)
        a.t = 0
        a.startPosition.copy(positionOut.current)
        a.startQuaternion.copy(quaternionOut.current)
        api.mass.set(0)
        setAutopilot({ engaged: false, status: 'Off' })
        setDock({ phase: 'docking', stationId: nearest })
        notify(`Docking at ${station.name}`, 'gain', 2500)
      }
      return
    }

    dockInfo.canDock = false
    dockInfo.prompt = ''

    if (dock.phase === 'docked') {
      if (requested) {
        if (busy.current) {
          notify('Finish the assembly queue before undocking', 'warning', 2500)
        } else {
          const station = getSector().stations[dock.stationId]
          a.pose = stationPose(station)
          a.t = 0
          a.startPosition.copy(positionOut.current)
          a.exit.copy(a.pose.entrance).addScaledVector(a.pose.outward, 14)
          setDock({ phase: 'undocking' })
          notify('Undocking: clear the hangar', 'gain', 2000)
        }
      }
      return
    }

    const pose = a.pose
    if (!pose) return

    if (dock.phase === 'docking') {
      a.t = Math.min(1, a.t + dt / DOCK_TIME)
      const t = smooth(a.t)
      // A curve from where we are, through the hangar mouth, to the slot
      const u = 1 - t
      a.scratch
        .copy(a.startPosition)
        .multiplyScalar(u * u)
        .addScaledVector(pose.entrance, 2 * u * t)
        .addScaledVector(pose.slot, t * t)
      a.q.slerpQuaternions(a.startQuaternion, pose.quaternion, t)
      api.position.set(a.scratch.x, a.scratch.y, a.scratch.z)
      api.quaternion.set(a.q.x, a.q.y, a.q.z, a.q.w)
      api.velocity.set(0, 0, 0)
      api.angularVelocity.set(0, 0, 0)
      if (a.t >= 1) {
        repairHull(100)
        setDock({ phase: 'docked' })
        notify(`Docked: ${getSector().stations[dock.stationId].name}. Hull repaired. Build mode unlocked`, 'gain', 4000)
      }
    } else if (dock.phase === 'undocking') {
      a.t = Math.min(1, a.t + dt / UNDOCK_TIME)
      const t = smooth(a.t)
      a.scratch.lerpVectors(pose.slot, a.exit, t)
      api.position.set(a.scratch.x, a.scratch.y, a.scratch.z)
      api.quaternion.set(pose.quaternion.x, pose.quaternion.y, pose.quaternion.z, pose.quaternion.w)
      api.velocity.set(0, 0, 0)
      api.angularVelocity.set(0, 0, 0)
      if (a.t >= 1) {
        api.mass.set(shipMass.current)
        api.velocity.set(pose.outward.x * 6, pose.outward.y * 6, pose.outward.z * 6)
        setDock({ phase: 'free', stationId: -1 })
        notify('Cleared for departure', 'gain', 2500)
      }
    }
  })
}
