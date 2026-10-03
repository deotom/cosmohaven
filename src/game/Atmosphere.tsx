import { useMemo } from 'react'
import * as THREE from 'three'
import { sunDirection } from './sunState'

const vertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldNormal;
  varying vec3 vView;
  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vView = normalize(-viewPosition.xyz);
    gl_Position = projectionMatrix * viewPosition;
  }
`

// Fresnel: the glow is strongest where the surface turns edge-on to the camera, and brighter on the
// side facing the sun, with a dim ambient glow all round
const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uSun;
  uniform float uPower;
  uniform float uIntensity;
  varying vec3 vNormal;
  varying vec3 vWorldNormal;
  varying vec3 vView;
  void main() {
    float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), uPower);
    float lit = 0.25 + 0.75 * smoothstep(-0.25, 0.6, dot(normalize(vWorldNormal), normalize(uSun)));
    float glow = fresnel * lit * uIntensity;
    gl_FragColor = vec4(uColor * glow, glow);
  }
`

type AtmosphereProps = {
  radius: number
  color: string
  /** Shell size relative to the planet */
  scale?: number
  power?: number
  intensity?: number
}

/** A glowing atmospheric halo: a slightly larger sphere with a Fresnel edge shader, added over the planet. */
export function Atmosphere({ radius, color, scale = 1.09, power = 2.6, intensity = 2.2 }: AtmosphereProps) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uColor: { value: new THREE.Color(color) },
          uSun: { value: sunDirection }, // the live vector, so a new sector's sun is picked up automatically
          uPower: { value: power },
          uIntensity: { value: intensity },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [color, power, intensity],
  )

  return (
    <mesh scale={scale} raycast={() => null}>
      <sphereGeometry args={[radius, 64, 48]} />
      <primitive object={material} attach="material" />
    </mesh>
  )
}
