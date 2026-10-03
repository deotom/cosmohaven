import { useMemo } from 'react'
import * as THREE from 'three'

const vertexShader = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uSeed;
  uniform float uIntensity;
  varying vec3 vDirection;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z
    );
  }
  float fbm(vec3 p) {
    float sum = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
      sum += amplitude * noise(p);
      p *= 2.02;
      amplitude *= 0.5;
    }
    return sum;
  }

  void main() {
    vec3 d = normalize(vDirection);
    float large = fbm(d * 2.1 + uSeed);
    float detail = fbm(d * 5.5 + uSeed * 1.7 + large * 2.0);
    float cloud = smoothstep(0.4, 0.82, large) * (0.35 + 0.65 * detail);
    // A second, thinner layer in the other colour, plus faint dust lanes that darken the glow
    float wisp = smoothstep(0.55, 0.9, fbm(d * 3.3 + uSeed.zxy)) * 0.55;
    float dust = smoothstep(0.5, 0.75, fbm(d * 7.0 + uSeed.yzx));
    vec3 color = uBase + (mix(uColorA, uColorB, detail) * cloud + uColorB * wisp * 0.5) * uIntensity * (1.0 - 0.45 * dust);
    gl_FragColor = vec4(color, 1.0);
  }
`

type NebulaProps = { base: string; colorA: string; colorB: string; seed: number }

/** A procedural nebula painted on the inside of a huge sphere. Keep it centred on the camera. */
export function Nebula({ base, colorA, colorB, seed }: NebulaProps) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uBase: { value: new THREE.Color(base) },
          uColorA: { value: new THREE.Color(colorA) },
          uColorB: { value: new THREE.Color(colorB) },
          uSeed: { value: new THREE.Vector3(seed * 1.37 % 50, seed * 2.11 % 50, seed * 0.73 % 50) },
          uIntensity: { value: 0.5 },
        },
        side: THREE.BackSide,
        depthWrite: false,
        toneMapped: false,
      }),
    [base, colorA, colorB, seed],
  )

  return (
    <mesh renderOrder={-100} frustumCulled={false} raycast={() => null}>
      <sphereGeometry args={[4500, 48, 32]} />
      <primitive object={material} attach="material" />
    </mesh>
  )
}
