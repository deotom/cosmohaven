import { useSyncExternalStore } from 'react'
import * as THREE from 'three'
import { retractGear } from './landingGear'

export type DockPhase = 'free' | 'docking' | 'docked' | 'undocking'
export type DockState = { phase: DockPhase; stationId: number }

// The game begins docked at the Home Sector's drydock, so the first thing the player does is build.
let state: DockState = { phase: 'docked', stationId: 0 }
const listeners = new Set<() => void>()

export const getDock = () => state

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Re-renders when the docking phase changes. */
export const useDock = () => useSyncExternalStore(subscribe, getDock)

export function setDock(next: Partial<DockState>) {
  if (next.phase && next.phase !== 'free') retractGear()
  state = { ...state, ...next }
  listeners.forEach((listener) => listener())
}

/** The UI asks, the ship's docking controller answers on its next frame. */
export const dockRequests = { toggle: false }
export function requestDockToggle() {
  dockRequests.toggle = true
}

/** Written every frame by the docking controller and read by the HUD. */
export const dockInfo = { canDock: false, prompt: '', stationName: '' }

/**
 * The block being assembled right now, for the shipyard drones and arms to work on. `position` is in
 * world space; `active` is false when nothing is under construction.
 */
export const construction = { active: false, position: new THREE.Vector3(), progress: 0 }
