import * as THREE from 'three'

const cache = new Map<string, THREE.MeshStandardMaterial>()

/** A self-lit material. Intensities above ~1 are what the bloom pass turns into a glow. */
export function glow(color: string, intensity = 2.5) {
  const key = `${color}-${intensity}`
  let material = cache.get(key)
  if (!material) {
    material = new THREE.MeshStandardMaterial({ color: '#0b0b0b', emissive: color, emissiveIntensity: intensity, toneMapped: false })
    cache.set(key, material)
  }
  return material
}
