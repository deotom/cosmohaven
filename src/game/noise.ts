import { mulberry32 } from './rng'

export type Noise = {
  /** Smooth value noise in [0, 1] */
  noise: (x: number, y: number, z: number) => number
  /** Fractal (layered) noise in [0, 1] */
  fbm: (x: number, y: number, z: number, octaves?: number) => number
}

/** 3D value noise from a seed, for procedural textures. Sampling a sphere's surface gives seamless wrapping. */
export function createNoise(seed: number): Noise {
  const rand = mulberry32(seed)
  const values = new Float32Array(256)
  for (let i = 0; i < 256; i++) values[i] = rand()
  const order = Array.from({ length: 256 }, (_, i) => i)
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  const perm = new Uint8Array(512)
  for (let i = 0; i < 512; i++) perm[i] = order[i & 255]

  const lattice = (x: number, y: number, z: number) => values[perm[perm[perm[x & 255] + (y & 255)] + (z & 255)]]
  const fade = (t: number) => t * t * (3 - 2 * t)
  const mix = (a: number, b: number, t: number) => a + (b - a) * t

  const noise = (x: number, y: number, z: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z)
    const u = fade(x - xi), v = fade(y - yi), w = fade(z - zi)
    return mix(
      mix(mix(lattice(xi, yi, zi), lattice(xi + 1, yi, zi), u), mix(lattice(xi, yi + 1, zi), lattice(xi + 1, yi + 1, zi), u), v),
      mix(mix(lattice(xi, yi, zi + 1), lattice(xi + 1, yi, zi + 1), u), mix(lattice(xi, yi + 1, zi + 1), lattice(xi + 1, yi + 1, zi + 1), u), v),
      w,
    )
  }

  const fbm = (x: number, y: number, z: number, octaves = 5) => {
    let sum = 0, amplitude = 0.5, total = 0
    for (let i = 0; i < octaves; i++) {
      sum += amplitude * noise(x, y, z)
      total += amplitude
      x *= 2.03
      y *= 2.03
      z *= 2.03
      amplitude *= 0.5
    }
    return sum / total
  }

  return { noise, fbm }
}
