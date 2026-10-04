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
  LANDING_HEIGHT,
  LANDING_VIEW_FULL,
  LANDING_VIEW_START,
  SURFACE_MARGIN,
  clampAboveSurface,
  freeOrbitUp,
  landingBlend,
  landingCameraPose,
  rotateOrbitWithShip,
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

describe('orbit view that follows the ship', () => {
  it('keeps the camera fixed in the ship frame while the ship turns and moves', () => {
    const rand = mulberry32(23)
    const previous = new THREE.Quaternion()
    const focus = new THREE.Vector3(10, -4, 25)
    const position = new THREE.Vector3(14, 3, 40)
    const quaternion = randomQuaternion(rand)
    for (let i = 0; i < 100; i++) {
      const current = randomQuaternion(rand)
      // The camera's place and orientation expressed in the ship's frame before and after
      const inverseBefore = previous.clone().invert()
      const localOffsetBefore = position.clone().sub(focus).applyQuaternion(inverseBefore)
      const localOrientationBefore = inverseBefore.clone().multiply(quaternion)

      rotateOrbitWithShip(previous, current, focus, position, quaternion)

      const inverseAfter = current.clone().invert()
      expect(position.clone().sub(focus).applyQuaternion(inverseAfter).distanceTo(localOffsetBefore)).toBeLessThan(1e-6)
      expect(angleBetween(inverseAfter.clone().multiply(quaternion), localOrientationBefore)).toBeLessThan(1e-6)
      previous.copy(current)
    }
  })

  it('does nothing while the ship holds still', () => {
    const ship = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 1.1)
    const focus = new THREE.Vector3(1, 2, 3)
    const position = new THREE.Vector3(5, 6, 7)
    const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.4)
    const before = { position: position.clone(), quaternion: quaternion.clone() }
    rotateOrbitWithShip(ship, ship, focus, position, quaternion)
    expect(position.distanceTo(before.position)).toBeLessThan(1e-9)
    expect(angleBetween(quaternion, before.quaternion)).toBeLessThan(1e-9)
  })

  it('keeps the distance to the ship however it turns', () => {
    const rand = mulberry32(5)
    const focus = new THREE.Vector3(0, 0, 0)
    const position = new THREE.Vector3(0, 6, 20)
    const quaternion = new THREE.Quaternion()
    const distance = position.distanceTo(focus)
    let previous = new THREE.Quaternion()
    for (let i = 0; i < 200; i++) {
      const current = randomQuaternion(rand)
      rotateOrbitWithShip(previous, current, focus, position, quaternion)
      previous = current
      expect(Math.abs(position.distanceTo(focus) - distance)).toBeLessThan(1e-6)
    }
  })

  it('free orbit takes the camera up as its own axis, so there is no pole to stop at', () => {
    const rand = mulberry32(31)
    const up = new THREE.Vector3()
    for (let i = 0; i < 100; i++) {
      const camera = randomQuaternion(rand)
      freeOrbitUp(camera, up)
      // Looking straight up or straight down, the new up is still perpendicular to the view direction
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera)
      expect(Math.abs(up.dot(forward))).toBeLessThan(1e-9)
      expect(Math.abs(up.length() - 1)).toBeLessThan(1e-9)
    }
  })
})

describe('landing view', () => {
  const center = new THREE.Vector3(120, -40, 300)
  const radius = 60

  it('only applies while descending or landed, and ramps up as the ground gets close', () => {
    for (const phase of ['none', 'choice', 'insertion', 'orbiting', 'deorbit']) expect(landingBlend(10, phase)).toBe(0)
    for (const phase of ['descent', 'landed']) {
      expect(landingBlend(LANDING_VIEW_START + 50, phase)).toBe(0)
      expect(landingBlend(LANDING_VIEW_START, phase)).toBe(0)
      expect(landingBlend(LANDING_VIEW_FULL, phase)).toBe(1)
      expect(landingBlend(0, phase)).toBe(1)
      let last = 0
      for (let altitude = LANDING_VIEW_START; altitude >= 0; altitude -= 1) {
        const blend = landingBlend(altitude, phase)
        expect(blend).toBeGreaterThanOrEqual(last)
        expect(blend).toBeLessThanOrEqual(1)
        last = blend
      }
    }
  })

  it('puts the camera above the ship, on the side away from the ground, whichever way the ship is turned', () => {
    // The retro landing in the game: the nose points away from the ground, so the chase camera would sit below it
    const rand = mulberry32(41)
    const position = new THREE.Vector3()
    const orientation = new THREE.Quaternion()
    for (let i = 0; i < 300; i++) {
      const normal = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize()
      const altitude = rand() * 40
      const ship = center.clone().addScaledVector(normal, radius + altitude)
      landingCameraPose(ship, center, randomQuaternion(rand), position, orientation)
      const cameraAltitude = position.distanceTo(center) - radius
      expect(cameraAltitude).toBeGreaterThan(altitude + LANDING_HEIGHT - 1e-6)
      // looking at the ship, with "up" away from the ground
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(orientation)
      expect(forward.dot(ship.clone().sub(position).normalize())).toBeGreaterThan(0.999999)
      expect(new THREE.Vector3(0, 1, 0).applyQuaternion(orientation).dot(normal)).toBeGreaterThan(0.3)
    }
  })

  it('copes with a ship whose own right or forward axis points straight at the ground', () => {
    const position = new THREE.Vector3()
    const orientation = new THREE.Quaternion()
    const ship = center.clone().add(new THREE.Vector3(0, radius + 5, 0))
    // Right axis pointing down at the ground, then forward axis pointing down, then straight above the planet's pole
    const rollDown = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2)
    const pitchDown = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
    for (const quaternion of [rollDown, pitchDown, new THREE.Quaternion()]) {
      landingCameraPose(ship, center, quaternion, position, orientation)
      expect(Number.isFinite(position.x + position.y + position.z + orientation.x + orientation.y + orientation.z + orientation.w)).toBe(true)
      expect(position.distanceTo(center) - radius).toBeGreaterThan(5 + LANDING_HEIGHT - 1e-6)
    }
    // Even a ship at the planet's centre gives a finite pose
    landingCameraPose(center.clone(), center, new THREE.Quaternion(), position, orientation)
    expect(Number.isFinite(position.length() + orientation.length())).toBe(true)
  })

  it('keeps the camera out of the planet: underground points are pushed up, others stay', () => {
    const rand = mulberry32(8)
    for (let i = 0; i < 300; i++) {
      const direction = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize()
      const distance = rand() * radius * 1.5
      const point = center.clone().addScaledVector(direction, distance)
      const before = point.clone()
      const moved = clampAboveSurface(point, center, radius)
      if (distance >= radius + SURFACE_MARGIN) {
        expect(moved).toBe(false)
        expect(point.distanceTo(before)).toBe(0)
      } else {
        expect(moved).toBe(true)
        expect(point.distanceTo(center)).toBeCloseTo(radius + SURFACE_MARGIN, 6)
        // pushed straight out along the same line from the centre
        expect(point.clone().sub(center).normalize().dot(direction)).toBeGreaterThan(0.999999)
      }
    }
    const atCentre = center.clone()
    clampAboveSurface(atCentre, center, radius)
    expect(atCentre.distanceTo(center)).toBeCloseTo(radius + SURFACE_MARGIN, 6)
  })
})
