import type * as THREE from 'three'
import { EARTH_2 } from './gameState'
import type { PlanetKind } from './textures'

/**
 * Close-range planet surface: which planets can be landed on, how strong the shader detail layer is at a given
 * height, and where the loose rocks lie. Everything here is pure and seeded by the planet's name, so a planet looks
 * the same every time and none of it touches the sector generator's random stream.
 */

export function hashString(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Decides what a planet is from its name, so a given planet always looks (and behaves) the same. */
export function planetKind(name: string): PlanetKind {
  const roll = (hashString(name) % 1000) / 1000
  return roll < 0.3 ? 'gas' : roll < 0.7 ? 'rocky' : 'ice'
}

/** Gas giants have no ground to touch; Earth 2.0 is the destination and always counts as solid. */
export const isLandable = (body: { name: string }) => body.name === EARTH_2.name || planetKind(body.name) !== 'gas'

export function landRefusal(body: { name: string }): string | null {
  return isLandable(body) ? null : `${body.name} is a gas giant: there is no surface to land on. Enter orbit instead`
}

// ---------- Detail layer ----------

/** Above this altitude the plain texture is used alone; the detail layer is at full strength from DETAIL_FULL down. */
export const DETAIL_START = 250
export const DETAIL_FULL = 15

/** 0 at DETAIL_START and above, 1 at DETAIL_FULL and below, smooth in between (never increases with altitude). */
export function detailStrength(altitude: number) {
  const t = Math.min(Math.max((DETAIL_START - altitude) / (DETAIL_START - DETAIL_FULL), 0), 1)
  return t * t * (3 - 2 * t)
}

export type DetailUniforms = { uDetail: { value: number }; uDetailScale: { value: number } }

export const createDetailUniforms = (): DetailUniforms => ({ uDetail: { value: 0 }, uDetailScale: { value: 1 } })

export function setDetailStrength(uniforms: DetailUniforms, altitude: number) {
  uniforms.uDetail.value = detailStrength(altitude)
}

/**
 * Adds 3D value-noise grain to a standard material in object space (seamless on a sphere, no extra texture).
 * It modulates brightness only, so the planet's colour and the lighting model are untouched.
 */
export function patchDetailShader(shader: THREE.WebGLProgramParametersWithUniforms, uniforms: DetailUniforms) {
  shader.uniforms.uDetail = uniforms.uDetail
  shader.uniforms.uDetailScale = uniforms.uDetailScale
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vDetailPos;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDetailPos = position;')
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
varying vec3 vDetailPos;
uniform float uDetail;
uniform float uDetailScale;
float dHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float dNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(dHash(i), dHash(i + vec3(1, 0, 0)), f.x), mix(dHash(i + vec3(0, 1, 0)), dHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(dHash(i + vec3(0, 0, 1)), dHash(i + vec3(1, 0, 1)), f.x), mix(dHash(i + vec3(0, 1, 1)), dHash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}`,
    )
    .replace(
      '#include <map_fragment>',
      `#include <map_fragment>
if (uDetail > 0.001) {
  vec3 dp = vDetailPos * uDetailScale;
  float grain = dNoise(dp * 0.35) * 0.5 + dNoise(dp * 1.3) * 0.3 + dNoise(dp * 5.0) * 0.2;
  diffuseColor.rgb *= 1.0 + (grain - 0.5) * 1.1 * uDetail;
}`,
    )
}

// ---------- Ground props ----------

export const PROPS_ALTITUDE = 120 // props exist only below this height above the surface
export const PROPS_RANGE = 130 // along-the-ground radius around the ship that is populated
export const MAX_PROPS = 400
const CELL_SIZE = 10

export type SurfaceProp = {
  /** Unit vector from the planet's centre to the prop, in the planet's own frame */
  dir: [number, number, number]
  size: number
  yaw: number
  shape: 0 | 1 | 2
  /** 0-1 brightness variation */
  tint: number
}

/** A stable hash of (seed, a, b, k) into [0, 1). */
export function cellRandom(seed: number, a: number, b: number, k: number) {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(a + 0x7f4a7c15, 0xc2b2ae35)
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) ^ Math.imul(b + 0x165667b1, 0x297a2d39)
  h = Math.imul(h ^ (h >>> 13), 0x85ebca6b) ^ Math.imul(k + 0x27d4eb2f, 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** The rocks (or ice blocks) that lie in one surface cell. Cells are a latitude/longitude grid of ~CELL_SIZE units. */
export function propsInCell(name: string, radius: number, ring: number, index: number): SurfaceProp[] {
  const rings = Math.max(1, Math.floor((Math.PI * radius) / CELL_SIZE))
  const lat = -Math.PI / 2 + ((ring + 0.5) * Math.PI) / rings
  const perRing = Math.max(1, Math.floor((2 * Math.PI * radius * Math.cos(lat)) / CELL_SIZE))
  const seed = hashString(name)
  const count = Math.floor(cellRandom(seed, ring, index, 0) * 2.4)
  const props: SurfaceProp[] = []
  for (let k = 0; k < count; k++) {
    const jitterLat = (cellRandom(seed, ring, index, 1 + k * 5) - 0.5) * (Math.PI / rings)
    const jitterLon = (cellRandom(seed, ring, index, 2 + k * 5) - 0.5) * ((2 * Math.PI) / perRing)
    const phi = lat + jitterLat
    const lon = ((index + 0.5) * 2 * Math.PI) / perRing + jitterLon
    const big = cellRandom(seed, ring, index, 3 + k * 5)
    props.push({
      dir: [Math.cos(phi) * Math.cos(lon), Math.sin(phi), Math.cos(phi) * Math.sin(lon)],
      size: 0.4 + big * big * 2.4,
      yaw: cellRandom(seed, ring, index, 4 + k * 5) * Math.PI * 2,
      shape: Math.min(2, Math.floor(cellRandom(seed, ring, index, 5 + k * 5) * 3)) as 0 | 1 | 2,
      tint: cellRandom(seed, ring, index, 6 + k * 5),
    })
  }
  return props
}

/**
 * The props within `range` (great-circle distance along the surface) of a point, nearest first, never more than `max`.
 * `center` is a direction from the planet's centre (it need not be normalised). Gas giants have none.
 */
export function propsAround(
  name: string,
  radius: number,
  center: readonly [number, number, number],
  range = PROPS_RANGE,
  max = MAX_PROPS,
): SurfaceProp[] {
  if (planetKind(name) === 'gas' || name === EARTH_2.name) return []
  const length = Math.hypot(center[0], center[1], center[2]) || 1
  const c = [center[0] / length, center[1] / length, center[2] / length]
  const lat0 = Math.asin(Math.min(1, Math.max(-1, c[1])))
  const lon0 = Math.atan2(c[2], c[0])
  const rings = Math.max(1, Math.floor((Math.PI * radius) / CELL_SIZE))
  const reach = (range + CELL_SIZE * 1.5) / radius // angular reach in radians
  const first = Math.max(0, Math.floor(((lat0 - reach + Math.PI / 2) / Math.PI) * rings))
  const last = Math.min(rings - 1, Math.ceil(((lat0 + reach + Math.PI / 2) / Math.PI) * rings))

  const found: { distance: number; prop: SurfaceProp }[] = []
  for (let ring = first; ring <= last; ring++) {
    const lat = -Math.PI / 2 + ((ring + 0.5) * Math.PI) / rings
    const perRing = Math.max(1, Math.floor((2 * Math.PI * radius * Math.cos(lat)) / CELL_SIZE))
    const cosLat = Math.cos(lat)
    const everyCell = cosLat < 1e-3 || reach / cosLat >= Math.PI
    const span = everyCell ? perRing : Math.min(perRing, Math.ceil(((reach / cosLat) * perRing) / (2 * Math.PI)) * 2 + 1)
    const centreIndex = Math.floor(((((lon0 / (2 * Math.PI)) % 1) + 1) % 1) * perRing)
    for (let n = 0; n < span; n++) {
      const index = everyCell ? n : (((centreIndex - Math.floor(span / 2) + n) % perRing) + perRing) % perRing
      for (const prop of propsInCell(name, radius, ring, index)) {
        const dot = prop.dir[0] * c[0] + prop.dir[1] * c[1] + prop.dir[2] * c[2]
        const distance = Math.acos(Math.min(1, Math.max(-1, dot))) * radius
        if (distance <= range) found.push({ distance, prop })
      }
    }
  }
  found.sort((a, b) => a.distance - b.distance)
  return found.slice(0, max).map((f) => f.prop)
}

// ---------- Touchdown dust ----------

export const DUST_ALTITUDE = 25

/** How much dust the engine kicks up: 0 above DUST_ALTITUDE, rising towards the ground and with thrust (0-1). */
export function dustIntensity(altitude: number, thrust: number) {
  if (altitude >= DUST_ALTITUDE) return 0
  const closeness = 1 - Math.max(altitude, 0) / DUST_ALTITUDE
  return closeness * Math.min(Math.max(thrust, 0), 1)
}

/** Camera shake (world units) at a time after touching down; decays to nothing. */
export const TOUCH_SHAKE_SECONDS = 0.7
export function touchShake(secondsSinceTouch: number) {
  if (secondsSinceTouch < 0 || secondsSinceTouch >= TOUCH_SHAKE_SECONDS) return 0
  const left = 1 - secondsSinceTouch / TOUCH_SHAKE_SECONDS
  return 0.2 * left * left
}
