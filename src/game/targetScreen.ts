import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { gameStats, notify, setTarget, type TargetRef } from './gameState'
import { openContextMenu } from './targetActions'
import { listTargets } from './targets'

/** Where the locked target is on screen, and its telemetry; written every frame, read by the DOM overlay. */
export const targetScreen = {
  active: false,
  x: 0,
  y: 0,
  /** Behind the camera or off the edge of the screen: the reticle is pinned to the edge instead */
  offscreen: false,
  name: '',
  kind: '',
  distance: 0,
  relativeSpeed: 0,
  eta: Infinity,
}

export const shipPositionRef = { current: new THREE.Vector3() }

/** Event handlers that make a 3D object a clickable target: left-click locks it and opens the context menu. */
export function targetHandlers(ref: TargetRef) {
  return {
    onClick: (e: ThreeEvent<MouseEvent>) => {
      if (e.delta > 4) return // a drag, not a click
      e.stopPropagation()
      setTarget(ref)
      openContextMenu(ref, e.nativeEvent.clientX, e.nativeEvent.clientY)
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      document.body.style.cursor = 'crosshair'
    },
    onPointerOut: () => {
      document.body.style.cursor = ''
    },
  }
}

/** T / middle-click: lock the next target in range, nearest first. */
export function cycleTarget() {
  const targets = listTargets(shipPositionRef.current)
  if (targets.length === 0) {
    setTarget(null)
    notify('No targets in range', 'warning', 1500)
    return
  }
  const current = targets.findIndex((t) => t.key === gameStats.target?.key)
  setTarget(targets[(current + 1) % targets.length])
}

