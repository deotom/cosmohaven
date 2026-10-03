import * as THREE from 'three'
import { createNoise } from './noise'
import { mulberry32 } from './rng'

export type PlanetKind = 'rocky' | 'ice' | 'gas'

const WIDTH = 512
const HEIGHT = 256

function canvasTexture(canvas: HTMLCanvasElement, srgb = true) {
  const texture = new THREE.CanvasTexture(canvas)
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

function newCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return { canvas, ctx: canvas.getContext('2d')! }
}

/** Calls `fn` for every texel with the unit-sphere point it maps to, for seamless equirectangular textures. */
function paintSphere(
  ctx: CanvasRenderingContext2D,
  fn: (x: number, y: number, z: number, lat: number) => [number, number, number, number],
  width = WIDTH,
  height = HEIGHT,
) {
  const image = ctx.createImageData(width, height)
  for (let py = 0; py < height; py++) {
    const lat = (py / height - 0.5) * Math.PI
    const cosLat = Math.cos(lat), sinLat = Math.sin(lat)
    for (let px = 0; px < width; px++) {
      const lon = (px / width) * Math.PI * 2
      const [r, g, b, a] = fn(cosLat * Math.cos(lon), sinLat, cosLat * Math.sin(lon), lat)
      const i = (py * width + px) * 4
      image.data[i] = r
      image.data[i + 1] = g
      image.data[i + 2] = b
      image.data[i + 3] = a
    }
  }
  ctx.putImageData(image, 0, 0)
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const mixColor = (out: THREE.Color, a: THREE.Color, b: THREE.Color, t: number) => out.copy(a).lerp(b, t)

/** Surface colour map (and a height map for bump) for a planet, from a seed and its base colour. */
export function createPlanetTextures(kind: PlanetKind, seed: number, baseHex: string) {
  const { fbm } = createNoise(seed)
  const base = new THREE.Color(baseHex)
  const dark = base.clone().multiplyScalar(0.35)
  const light = base.clone().lerp(new THREE.Color('#ffffff'), 0.45)
  const ice = new THREE.Color('#eaf4ff')
  const tint = new THREE.Color()
  const hsl = { h: 0, s: 0, l: 0 }
  base.getHSL(hsl)
  const bandA = base.clone().multiplyScalar(0.7)
  const bandB = new THREE.Color().setHSL((hsl.h + 0.08) % 1, Math.min(1, hsl.s + 0.1), Math.min(0.8, hsl.l + 0.22))

  const color = newCanvas(WIDTH, HEIGHT)
  const height = newCanvas(WIDTH, HEIGHT)
  const heights = new Float32Array(WIDTH * HEIGHT)
  let hi = 0

  paintSphere(color.ctx, (x, y, z, lat) => {
    let h: number
    if (kind === 'gas') {
      const turbulence = fbm(x * 1.6 + 4, y * 0.8, z * 1.6, 4)
      const bands = 0.5 + 0.5 * Math.sin((y * 6 + turbulence * 3.2) * Math.PI)
      const fine = fbm(x * 6, y * 22, z * 6, 3)
      mixColor(tint, bandA, bandB, bands * 0.8 + fine * 0.2).multiplyScalar(0.8 + 0.4 * fine)
      h = bands
    } else {
      h = fbm(x * 2.2 + 10, y * 2.2, z * 2.2, 5)
      const detail = fbm(x * 7, y * 7, z * 7, 3)
      if (h < 0.46) mixColor(tint, dark, base, h / 0.46)
      else mixColor(tint, base, light, (h - 0.46) / 0.54)
      tint.multiplyScalar(0.85 + 0.3 * detail)
      // Polar caps, much bigger on ice worlds
      const cap = smooth(kind === 'ice' ? 0.35 : 0.8, kind === 'ice' ? 0.7 : 0.95, Math.abs(Math.sin(lat)) + (h - 0.5) * 0.2)
      tint.lerp(ice, cap)
      if (kind === 'ice') tint.lerp(ice, 0.35 * smooth(0.5, 0.8, h))
    }
    heights[hi++] = h
    return [tint.r * 255, tint.g * 255, tint.b * 255, 255]
  })

  // Bump map: the same heights in greyscale
  const image = height.ctx.createImageData(WIDTH, HEIGHT)
  for (let i = 0; i < heights.length; i++) {
    const v = heights[i] * 255
    image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = v
    image.data[i * 4 + 3] = 255
  }
  height.ctx.putImageData(image, 0, 0)

  return { map: canvasTexture(color.canvas), bump: kind === 'gas' ? null : canvasTexture(height.canvas, false) }
}

/** Wispy white clouds with a transparent background. */
export function createCloudTexture(seed: number, coverage = 0.52) {
  const { fbm } = createNoise(seed + 77)
  const { canvas, ctx } = newCanvas(WIDTH, HEIGHT)
  paintSphere(ctx, (x, y, z) => {
    const n = fbm(x * 3 + 20, y * 4, z * 3, 5)
    const a = smooth(coverage, coverage + 0.26, n)
    return [255, 255, 255, a * 235]
  })
  return canvasTexture(canvas)
}

/** A radial ring texture: u runs from the inner to the outer edge, with gaps and dense bands. */
export function createRingTexture(seed: number, baseHex: string) {
  const rand = mulberry32(seed + 5)
  const { noise } = createNoise(seed + 9)
  const { canvas, ctx } = newCanvas(512, 8)
  const base = new THREE.Color(baseHex).lerp(new THREE.Color('#d8c9a8'), 0.6)
  const image = ctx.createImageData(512, 8)
  const gapAt = [rand() * 0.2 + 0.3, rand() * 0.1 + 0.62]
  for (let x = 0; x < 512; x++) {
    const u = x / 511
    let a = 0.35 + 0.65 * noise(u * 40, 1.5, 0.5)
    a *= smooth(0.0, 0.06, u) * (1 - smooth(0.92, 1.0, u))
    for (const gap of gapAt) a *= 1 - 0.95 * Math.exp(-(((u - gap) / 0.018) ** 2))
    const shade = 0.75 + 0.25 * noise(u * 90, 7, 3)
    for (let y = 0; y < 8; y++) {
      const i = (y * 512 + x) * 4
      image.data[i] = base.r * 255 * shade
      image.data[i + 1] = base.g * 255 * shade
      image.data[i + 2] = base.b * 255 * shade
      image.data[i + 3] = a * 230
    }
  }
  ctx.putImageData(image, 0, 0)
  return canvasTexture(canvas)
}

/** Remaps a ring geometry's UVs so u is the radial position (0 at the inner edge, 1 at the outer). */
export function radialRingUVs(geometry: THREE.RingGeometry, inner: number, outer: number) {
  const position = geometry.attributes.position
  const uv = geometry.attributes.uv
  for (let i = 0; i < position.count; i++) {
    const r = Math.hypot(position.getX(i), position.getY(i))
    uv.setXY(i, (r - inner) / (outer - inner), 0.5)
  }
  uv.needsUpdate = true
}

let floorTexture: THREE.CanvasTexture | null = null
/** Metal floor plates with grooves and rivets. */
export function getFloorTexture() {
  if (floorTexture) return floorTexture
  const { canvas, ctx } = newCanvas(256, 256)
  const rand = mulberry32(31)
  ctx.fillStyle = '#4d576a'
  ctx.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = `rgba(${rand() < 0.5 ? '255,255,255' : '0,0,0'},${0.03 + rand() * 0.05})`
    ctx.fillRect(rand() * 256, rand() * 256, 2 + rand() * 6, 1 + rand() * 2)
  }
  for (let t = 0; t <= 4; t++) {
    const p = t * 64
    ctx.fillStyle = '#12161c'
    ctx.fillRect(p - 2, 0, 4, 256)
    ctx.fillRect(0, p - 2, 256, 4)
    ctx.fillStyle = '#566174'
    ctx.fillRect(p + 2, 0, 1.5, 256)
    ctx.fillRect(0, p + 2, 256, 1.5)
  }
  ctx.fillStyle = '#8f9aae'
  for (let tx = 0; tx < 4; tx++) {
    for (let ty = 0; ty < 4; ty++) {
      for (const [dx, dy] of [[8, 8], [56, 8], [8, 56], [56, 56]]) {
        ctx.beginPath()
        ctx.arc(tx * 64 + dx, ty * 64 + dy, 2.2, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
  floorTexture = canvasTexture(canvas)
  floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping
  return floorTexture
}

const screenCache = new Map<string, THREE.CanvasTexture>()

/**
 * Little glowing screens. 'console' is bars and graphs, 'food' a menu-like list, 'arcade' a pixel-art
 * game (nearest-filtered so the pixels stay crisp).
 */
export function getScreenTexture(kind: 'console' | 'food' | 'arcade', hue = 0.5) {
  const key = `${kind}-${hue}`
  const cached = screenCache.get(key)
  if (cached) return cached
  const rand = mulberry32(Math.floor(hue * 1000) + kind.length * 17)
  const { canvas, ctx } = newCanvas(128, 128)
  ctx.fillStyle = '#02060a'
  ctx.fillRect(0, 0, 128, 128)

  if (kind === 'arcade') {
    const cell = 8
    for (let gx = 0; gx < 16; gx++) {
      for (let gy = 0; gy < 16; gy++) {
        if (rand() < 0.28 && gx < 8) {
          const color = `hsl(${Math.floor(rand() * 360)}, 100%, 60%)`
          ctx.fillStyle = color
          for (const x of [gx, 15 - gx]) ctx.fillRect(x * cell, gy * cell, cell - 1, cell - 1) // mirrored "invaders"
        }
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    for (let y = 0; y < 128; y += 3) ctx.fillRect(0, y, 128, 1) // scanlines
  } else if (kind === 'food') {
    ctx.fillStyle = `hsl(${hue * 360}, 90%, 60%)`
    ctx.fillRect(10, 10, 108, 10)
    for (let row = 0; row < 6; row++) {
      ctx.fillStyle = `hsl(${hue * 360}, 80%, ${40 + rand() * 25}%)`
      ctx.fillRect(10, 32 + row * 15, 20 + rand() * 80, 7)
      ctx.fillStyle = `hsl(${hue * 360 + 40}, 90%, 65%)`
      ctx.fillRect(100, 32 + row * 15, 18, 7)
    }
  } else {
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `hsl(${hue * 360 + rand() * 30}, 90%, ${45 + rand() * 25}%)`
      ctx.fillRect(8, 8 + i * 14, 14 + rand() * 100, 8)
    }
    ctx.strokeStyle = `hsl(${hue * 360}, 90%, 65%)`
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let x = 0; x < 128; x += 4) ctx.lineTo(x, 118 - rand() * 18)
    ctx.stroke()
  }

  const texture = canvasTexture(canvas)
  if (kind === 'arcade') texture.magFilter = THREE.NearestFilter
  screenCache.set(key, texture)
  return texture
}

const gridCache = new Map<string, THREE.CanvasTexture>()
/** A holographic grid (bright lines on transparent), tiled `repeatX` by `repeatY` times. */
export function getGridTexture(repeatX: number, repeatY: number) {
  const key = `${repeatX}x${repeatY}`
  const cached = gridCache.get(key)
  if (cached) return cached
  const { canvas, ctx } = newCanvas(128, 128)
  ctx.clearRect(0, 0, 128, 128)
  ctx.strokeStyle = 'rgba(255,255,255,0.28)'
  ctx.lineWidth = 1
  for (let i = 1; i < 4; i++) {
    ctx.beginPath()
    ctx.moveTo(i * 32, 0)
    ctx.lineTo(i * 32, 128)
    ctx.moveTo(0, i * 32)
    ctx.lineTo(128, i * 32)
    ctx.stroke()
  }
  ctx.strokeStyle = 'rgba(255,255,255,1)'
  ctx.lineWidth = 3
  ctx.strokeRect(1.5, 1.5, 125, 125)
  const texture = canvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(repeatX, repeatY)
  gridCache.set(key, texture)
  return texture
}

let hazardTexture: THREE.CanvasTexture | null = null
/** Yellow and black warning stripes. */
export function getHazardTexture() {
  if (hazardTexture) return hazardTexture
  const { canvas, ctx } = newCanvas(128, 32)
  ctx.fillStyle = '#16181d'
  ctx.fillRect(0, 0, 128, 32)
  ctx.fillStyle = '#ffc21a'
  for (let x = -32; x < 160; x += 32) {
    ctx.beginPath()
    ctx.moveTo(x, 32)
    ctx.lineTo(x + 16, 32)
    ctx.lineTo(x + 32, 0)
    ctx.lineTo(x + 16, 0)
    ctx.closePath()
    ctx.fill()
  }
  hazardTexture = canvasTexture(canvas)
  hazardTexture.wrapS = hazardTexture.wrapT = THREE.RepeatWrapping
  hazardTexture.repeat.set(6, 1)
  return hazardTexture
}
