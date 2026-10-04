import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../game/rng'
import { CAMERA_VIEW_LABELS, isFollowView, nextCameraView, type CameraView } from '../game/types'
import {
  FOLLOW_STIFFNESS,
  advanceFollowFrame,
  followCameraOrientation,
  followCameraPosition,
  followFrameFromCamera,
} from './followCamera'

const randomQuaternion = (rand: () => number) =>
  new THREE.Quaternion(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize()

const angleBetween = (a: THREE.Quaternion, b: THREE.Quaternion) => 2 * Math.acos(Math.min(1, Math.abs(a.dot(b))))
const UP = new THREE.Vector3(0, 1, 0)
const FORWARD = new THREE.Vector3(0, 0, -1)

describe('follow camera frame', () => {
  it('locked: the camera is rigidly the ship frame, so the ship and the camera share the same up', () => {
    const rand = mulberry32(7)
    const frame = new THREE.Quaternion()
    const camera = new THREE.Quaternion()
    for (let i = 0; i < 200; i++) {
      const ship = randomQuaternion(rand)
      advanceFollowFrame(frame, ship, 0.016, true)
      followCameraOrientation(frame, camera)
      // The camera is only pitched down about its own X, so its sideways axis stays the ship's
      const shipRight = new THREE.Vector3(1, 0, 0).applyQuaternion(ship)
      const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera)
      expect(cameraRight.distanceTo(shipRight)).toBeLessThan(1e-6)
      expect(angleBetween(frame, ship)).toBeLessThan(1e-6)
    }
  })

  it('always looks at the ship, whatever the orientation', () => {
    const rand = mulberry32(11)
    const frame = new THREE.Quaternion()
    const camera = new THREE.Quaternion()
    const position = new THREE.Vector3()
    for (let i = 0; i < 200; i++) {
      const shipPosition = new THREE.Vector3(rand() * 500, rand() * 500, rand() * 500)
      frame.copy(randomQuaternion(rand)) // any in-between smoothing state
      followCameraPosition(frame, shipPosition, position)
      followCameraOrientation(frame, camera)
      const toShip = shipPosition.clone().sub(position).normalize()
      const forward = FORWARD.clone().applyQuaternion(camera)
      expect(forward.dot(toShip)).toBeGreaterThan(0.999999)
    }
  })

  it('the picture stays upright relative to the ship while it rolls (no flip)', () => {
    const frame = new THREE.Quaternion()
    const camera = new THREE.Quaternion()
    const ship = new THREE.Quaternion()
    // Roll the ship a full turn, 1 degree per frame, with the camera easing after it
    let previousUp: THREE.Vector3 | null = null
    for (let degrees = 0; degrees <= 360; degrees++) {
      ship.setFromAxisAngle(new THREE.Vector3(0, 0, -1), THREE.MathUtils.degToRad(degrees))
      advanceFollowFrame(frame, ship, 1 / 60, false)
      followCameraOrientation(frame, camera)
      const up = UP.clone().applyQuaternion(camera)
      if (previousUp) expect(up.angleTo(previousUp)).toBeLessThan(0.1) // never a sudden flip
      previousUp = up
    }
  })

  it.each([2, 10, 20, 40])('a loop at %i degrees per frame never makes the view jump more than the ship itself turns', (rate) => {
    // The previous camera (an eased "up" vector plus lookAt) swung 180 degrees in one frame at 10-20 degrees per frame
    const frame = new THREE.Quaternion()
    const ship = new THREE.Quaternion()
    let previous = frame.clone()
    let largest = 0
    const shipStep = THREE.MathUtils.degToRad(rate)
    for (let degrees = 0; degrees <= 720; degrees += rate) {
      ship.setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(degrees))
      advanceFollowFrame(frame, ship, 1 / 60, false)
      if (degrees > 0) largest = Math.max(largest, angleBetween(previous, frame))
      previous = frame.clone()
    }
    expect(largest).toBeLessThanOrEqual(shipStep + 1e-6)
  })

  it('a tumble about all three axes never produces NaN and stays a unit quaternion', () => {
    const rand = mulberry32(3)
    const frame = new THREE.Quaternion()
    const ship = new THREE.Quaternion()
    const camera = new THREE.Quaternion()
    for (let i = 0; i < 2000; i++) {
      ship.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(rand() * 0.2, rand() * 0.2, rand() * 0.2)))
      advanceFollowFrame(frame, ship, 1 / 60, false)
      followCameraOrientation(frame, camera)
      expect(Number.isFinite(camera.x + camera.y + camera.z + camera.w)).toBe(true)
      expect(Math.abs(camera.length() - 1)).toBeLessThan(1e-6)
    }
  })

  it('eases to the ship and settles on it', () => {
    const frame = new THREE.Quaternion()
    const ship = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 2.5)
    let last = angleBetween(frame, ship)
    for (let i = 0; i < 60; i++) {
      advanceFollowFrame(frame, ship, 1 / 60, false)
      const now = angleBetween(frame, ship)
      expect(now).toBeLessThanOrEqual(last + 1e-9)
      last = now
    }
    for (let i = 0; i < 300; i++) advanceFollowFrame(frame, ship, 1 / 60, false)
    expect(angleBetween(frame, ship)).toBeLessThan(1e-3)
    expect(FOLLOW_STIFFNESS).toBeGreaterThan(0)
  })

  it('takes the shortest way round when the ship has turned almost all the way', () => {
    const frame = new THREE.Quaternion()
    const ship = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(350))
    advanceFollowFrame(frame, ship, 1 / 60, false)
    // 350 degrees round is 10 degrees back the other way: one step should move a few degrees, not ~170
    expect(angleBetween(frame, new THREE.Quaternion())).toBeLessThan(0.1)
  })

  it('can continue from an existing camera orientation without a jump', () => {
    const rand = mulberry32(19)
    const frame = new THREE.Quaternion()
    const camera = new THREE.Quaternion()
    const rebuilt = new THREE.Quaternion()
    for (let i = 0; i < 50; i++) {
      const original = randomQuaternion(rand)
      followCameraOrientation(original, camera)
      followFrameFromCamera(camera, frame)
      followCameraOrientation(frame, rebuilt)
      expect(angleBetween(rebuilt, camera)).toBeLessThan(1e-6)
    }
  })
})

describe('camera view cycle', () => {
  it('goes chase → ship-locked → orbit → chase', () => {
    let view: CameraView = 'chase'
    const seen: CameraView[] = [view]
    for (let i = 0; i < 3; i++) {
      view = nextCameraView(view)
      seen.push(view)
    }
    expect(seen).toEqual(['chase', 'locked', 'orbit', 'chase'])
  })

  it('treats chase and ship-locked as attached to the ship and orbit as free', () => {
    expect(isFollowView('chase')).toBe(true)
    expect(isFollowView('locked')).toBe(true)
    expect(isFollowView('orbit')).toBe(false)
    expect(CAMERA_VIEW_LABELS.locked).toBe('SHIP-LOCKED')
  })
})
