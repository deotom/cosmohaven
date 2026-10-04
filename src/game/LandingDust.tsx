import { useFrame } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { gameStats } from './gameState'
import type { PlanetSpec } from './sector'
import { shipState } from './shipState'
import { dustIntensity, TOUCH_SHAKE_SECONDS, touchShake } from './surfaceDetail'

const PARTICLES = 160
const LIFE = 1.6 // seconds a grain of dust lasts
const EMIT_PER_SECOND = 140

const VERTEX = `
attribute float aAge;
uniform float uSize;
uniform float uScale;
varying float vFade;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float grow = 0.6 + aAge * 1.8;
  gl_PointSize = aAge >= 1.0 ? 0.0 : uSize * grow * uScale / -mv.z;
  vFade = (1.0 - aAge) * smoothstep(0.0, 0.08, aAge);
}`
const FRAGMENT = `
uniform vec3 uColor;
varying float vFade;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  gl_FragColor = vec4(uColor, vFade * 0.55 * (1.0 - d * d));
}`

function shakeCamera(camera: THREE.Camera, amount: number) {
  camera.position.x += (Math.random() - 0.5) * amount
  camera.position.y += (Math.random() - 0.5) * amount
  camera.position.z += (Math.random() - 0.5) * amount
}

type Dust = ReturnType<typeof createDust>

function createDust(color: string, wasLanded: boolean) {
  const positions = new Float32Array(PARTICLES * 3)
  const ages = new Float32Array(PARTICLES).fill(1)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aAge', new THREE.BufferAttribute(ages, 1))
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    uniforms: { uSize: { value: 4 }, uScale: { value: 600 }, uColor: { value: new THREE.Color(color).lerp(new THREE.Color('#d8d0c4'), 0.6) } },
  })
  return {
    positions,
    ages,
    velocities: new Float32Array(PARTICLES * 3),
    geometry,
    material,
    emitted: 0,
    cursor: 0,
    landedAt: -1,
    wasLanded,
    up: new THREE.Vector3(),
    a: new THREE.Vector3(),
    b: new THREE.Vector3(),
    ground: new THREE.Vector3(),
  }
}

function stepDust(dust: Dust, body: PlanetSpec, dt: number, camera: THREE.Camera, viewportHeight: number, elapsed: number) {
  const { up, a, b, ground, positions, ages, velocities } = dust
  up.set(shipState.position.x - body.position[0], shipState.position.y - body.position[1], shipState.position.z - body.position[2])
  const distance = up.length()
  if (distance < 1e-6) return
  up.multiplyScalar(1 / distance)
  const thrust = gameStats.thrustLevel
  const intensity = dustIntensity(distance - body.radius, thrust)

  // Age and move what is already in the air
  for (let i = 0; i < PARTICLES; i++) {
    if (ages[i] >= 1) continue
    ages[i] += dt / LIFE
    positions[i * 3] += velocities[i * 3] * dt
    positions[i * 3 + 1] += velocities[i * 3 + 1] * dt
    positions[i * 3 + 2] += velocities[i * 3 + 2] * dt
    velocities[i * 3] *= 1 - 0.9 * dt
    velocities[i * 3 + 1] *= 1 - 0.9 * dt
    velocities[i * 3 + 2] *= 1 - 0.9 * dt
  }

  // Blast outward from the ground point under the ship
  if (intensity > 0) {
    dust.emitted += EMIT_PER_SECOND * intensity * dt
    ground.copy(up).multiplyScalar(body.radius + 0.3)
    a.set(Math.abs(up.y) < 0.9 ? 0 : 1, Math.abs(up.y) < 0.9 ? 1 : 0, 0).cross(up).normalize()
    b.copy(up).cross(a)
    while (dust.emitted >= 1) {
      dust.emitted -= 1
      const i = dust.cursor
      dust.cursor = (dust.cursor + 1) % PARTICLES
      const angle = Math.random() * Math.PI * 2
      const speed = (2 + Math.random() * 7) * (0.5 + intensity)
      const lift = 0.5 + Math.random() * 2.5
      const x = Math.cos(angle)
      const y = Math.sin(angle)
      const spread = Math.random() * 3
      ages[i] = 0
      positions[i * 3] = ground.x + (a.x * x + b.x * y) * spread
      positions[i * 3 + 1] = ground.y + (a.y * x + b.y * y) * spread
      positions[i * 3 + 2] = ground.z + (a.z * x + b.z * y) * spread
      velocities[i * 3] = (a.x * x + b.x * y) * speed + up.x * lift
      velocities[i * 3 + 1] = (a.y * x + b.y * y) * speed + up.y * lift
      velocities[i * 3 + 2] = (a.z * x + b.z * y) * speed + up.z * lift
    }
  }
  dust.geometry.attributes.position.needsUpdate = true
  dust.geometry.attributes.aAge.needsUpdate = true
  dust.material.uniforms.uSize.value = 3 + 6 * thrust + 4 * intensity
  dust.material.uniforms.uScale.value = viewportHeight * 0.5

  // The moment the ship settles: a short rattle
  const landed = gameStats.arrival.phase === 'landed'
  if (landed && !dust.wasLanded) dust.landedAt = elapsed
  dust.wasLanded = landed
  if (dust.landedAt >= 0) {
    const shake = touchShake(elapsed - dust.landedAt)
    if (shake > 0) shakeCamera(camera, shake)
    else if (elapsed - dust.landedAt > TOUCH_SHAKE_SECONDS) dust.landedAt = -1
  }
}

/**
 * Dust blown up by the engine near the ground, scaled by thrust and height, plus a short camera rattle when the
 * ship settles. Mounted by the planet only while the ship is close to its surface. Positions are in the planet's
 * frame, which does not rotate.
 *
 * The shake is applied here, after the camera rig has placed the camera, because this component mounts later than the rig.
 */
export function LandingDust({ body }: { body: PlanetSpec }) {
  const [dust] = useState(() => createDust(body.color, gameStats.arrival.phase === 'landed'))

  useEffect(
    () => () => {
      dust.geometry.dispose()
      dust.material.dispose()
    },
    [dust],
  )

  useFrame(({ camera, size, clock }, delta) => stepDust(dust, body, Math.min(delta, 0.1), camera, size.height, clock.elapsedTime))

  return <points geometry={dust.geometry} material={dust.material} frustumCulled={false} />
}

