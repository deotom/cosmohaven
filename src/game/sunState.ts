import * as THREE from 'three'

/**
 * Direction towards the current sector's sun (unit vector, world space) and its light colour. One live
 * object so shaders can hold a reference to it: when the ship folds, sector.ts updates it in place.
 */
export const sunDirection = new THREE.Vector3(0.84, 0.56, 0.28).normalize()
export const sunColor = new THREE.Color('#fff4e0')
