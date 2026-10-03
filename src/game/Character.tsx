import type { Triplet } from '@react-three/cannon'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type ReactNode, type RefObject } from 'react'
import * as THREE from 'three'
import { crewProfile } from './crewProfile'
import type { Look, SpeciesId } from './species'
import { crewStats } from './types'

/**
 * Crew characters in a soft, cosy, "village" style: two heads tall, a big round head, a pear-shaped body,
 * stubby legs and mitten hands, in matte clay-toon materials, with rosy cheeks and a gentle bounce.
 * They face +Z with their feet at y = 0 and stand about 0.75 tall.
 */

/** What the character is doing, written by the crew AI each frame and read here to animate the body. */
export type CharacterPose = {
  /** 0 standing still, 1 walking; eased by the AI */
  walk: number
  activity: 'none' | 'eat' | 'play' | 'repair'
}

// ---------- Shared geometry ----------

const SPHERE = new THREE.SphereGeometry(1, 32, 24)
const CONE = new THREE.ConeGeometry(1, 1, 20)
const CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 20)
/** A short curved line, like a tiny smile: an arc of a thin ring, pointing downwards (a "u" shape). */
const SMILE = new THREE.TorusGeometry(1, 0.2, 8, 20, Math.PI * 0.8).rotateZ(-0.9 * Math.PI)
/** A patch of sphere centred on +Z, used for the Synth-Bot's curved LED screen. */
const SCREEN_PATCH = new THREE.SphereGeometry(1, 40, 24, Math.PI / 2 - 0.85, 1.7, 1.05, 1.0)

// ---------- Soft clay-toon materials ----------

let gradient: THREE.DataTexture | null = null

/**
 * A gentle four-step light ramp: the lit side is bright, the shadow side never goes dark. The peak is kept well
 * below 1 because the scene's lights are strong; at full strength the characters would blow out and bloom.
 */
function toonGradient() {
  if (!gradient) {
    gradient = new THREE.DataTexture(new Uint8Array([70, 98, 122, 142]), 4, 1, THREE.RedFormat)
    gradient.minFilter = gradient.magFilter = THREE.NearestFilter
    gradient.needsUpdate = true
  }
  return gradient
}

/**
 * A matte, soft-shaded toon material. A little self-glow in its own colour stands in for ambient light, so the
 * shaded side stays warm and never turns grey.
 */
const clay = (color: string, extra: THREE.MeshToonMaterialParameters = {}) =>
  new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), emissive: color, emissiveIntensity: 0.1, ...extra })

const glowMaterial = (color: string, intensity = 2.5) =>
  new THREE.MeshStandardMaterial({ color: '#0b0b0b', emissive: color, emissiveIntensity: intensity, toneMapped: false })

const shade = (hex: string, amount: number) => `#${new THREE.Color(hex).multiplyScalar(amount).getHexString()}`
const mixHex = (a: string, b: string, t: number) => `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`

type PartProps = {
  g?: THREE.BufferGeometry
  m: THREE.Material
  p?: Triplet
  s?: Triplet | number
  r?: Triplet
  cast?: boolean
}

function Part({ g = SPHERE, m, p, s, r, cast = true }: PartProps) {
  return <mesh geometry={g} material={m} position={p} scale={s} rotation={r} castShadow={cast} />
}

// ---------- Proportions ----------

const HEAD_Y = 0.55
/** Head ellipsoid radii (x, y, z): wider than tall, which reads as cute */
const HEAD: Triplet = [0.21, 0.19, 0.19]

/** The surface of the head ellipsoid at (x, y): how far forward (z) the face is there. */
const faceZ = (x: number, y: number) => HEAD[2] * Math.sqrt(Math.max(0.05, 1 - (x / HEAD[0]) ** 2 - (y / HEAD[1]) ** 2))

// ---------- Face ----------

type MouthStyle = 'smile' | 'w' | 'o'

type FaceProps = {
  pose: RefObject<CharacterPose>
  mouth: MouthStyle
  /** Colour of the little nose dot; null for none */
  nose: string | null
  browColor: string
  cheek?: string
  eyeSpread?: number
  eyeColor?: string
}

/** Big glossy eyes with two glints, soft eyebrows, rosy cheek dots, a tiny nose and a small mouth. */
function Face({ pose, mouth, nose, browColor, cheek = '#ff8fa6', eyeSpread = 0.078, eyeColor = '#2b1f30' }: FaceProps) {
  const brows = useRef<(THREE.Mesh | null)[]>([])
  const mouthRef = useRef<THREE.Group>(null)
  const m = useMemo(
    () => ({
      eye: new THREE.MeshStandardMaterial({ color: eyeColor, roughness: 0.25, metalness: 0.1 }),
      glint: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
      brow: clay(browColor),
      cheek: new THREE.MeshBasicMaterial({ color: cheek, transparent: true, opacity: 0.78 }),
      nose: nose ? clay(nose) : null,
      mouth: clay('#7a3340'),
    }),
    [eyeColor, browColor, cheek, nose],
  )

  const eyeY = -0.005
  const eyeZ = faceZ(eyeSpread, eyeY) - 0.014
  const mouthZ = faceZ(0, -0.083) - 0.003

  useFrame(({ clock }) => animateFace(clock.elapsedTime, pose.current, brows.current, mouthRef.current))

  return (
    <>
      {[-1, 1].map((side, i) => (
        <group key={side}>
          <group position={[side * eyeSpread, eyeY, eyeZ]}>
            <Part m={m.eye} s={[0.034, 0.046, 0.022]} cast={false} />
            <Part m={m.glint} p={[side * -0.009, 0.016, 0.017]} s={0.0125} cast={false} />
            <Part m={m.glint} p={[side * 0.008, -0.014, 0.018]} s={0.006} cast={false} />
          </group>
          {/* Eyebrows: soft little arcs, inner ends a touch higher for a gentle, friendly look */}
          <mesh
            ref={(el) => registerBrow(brows, i, el)}
            geometry={SPHERE}
            material={m.brow}
            position={[side * eyeSpread, 0.06, faceZ(eyeSpread, 0.06) - 0.012]}
            scale={[0.03, 0.0075, 0.007]}
            rotation={[0, 0, side * -0.2]}
          />
          {/* Rosy cheek dots */}
          <mesh
            geometry={SPHERE}
            material={m.cheek}
            position={[side * 0.125, -0.052, faceZ(0.125, -0.052) - 0.004]}
            scale={[0.034, 0.024, 0.008]}
            rotation={[0, side * 0.75, 0]}
          />
        </group>
      ))}
      {m.nose && <Part m={m.nose} p={[0, -0.034, faceZ(0, -0.034) + 0.001]} s={[0.019, 0.015, 0.012]} cast={false} />}
      <group ref={mouthRef} position={[0, -0.085, mouthZ]}>
        {mouth === 'smile' && <Part g={SMILE} m={m.mouth} s={[0.034, 0.03, 0.02]} p={[0, 0.02, 0]} cast={false} />}
        {mouth === 'w' &&
          [-1, 1].map((side) => <Part key={side} g={SMILE} m={m.mouth} s={[0.02, 0.02, 0.02]} p={[side * 0.018, 0.012, 0]} cast={false} />)}
        {mouth === 'o' && <Part m={m.mouth} s={[0.017, 0.021, 0.01]} cast={false} />}
      </group>
    </>
  )
}

function registerBrow(brows: RefObject<(THREE.Mesh | null)[]>, index: number, element: THREE.Mesh | null) {
  brows.current[index] = element
}

/** Brows lift and the mouth chews or grins depending on what the character is doing. */
function animateFace(t: number, pose: CharacterPose, brows: (THREE.Mesh | null)[], mouth: THREE.Group | null) {
  const happy = pose.activity !== 'none' ? 1 : 0
  brows.forEach((brow, i) => {
    if (!brow) return
    const side = i === 0 ? -1 : 1
    brow.position.y = 0.06 + happy * 0.012 + Math.sin(t * 0.9 + i) * 0.002
    brow.rotation.z = side * (-0.2 - happy * 0.15)
  })
  if (mouth) {
    const chew = pose.activity === 'eat' ? 1 + Math.sin(t * 12) * 0.35 : 1
    mouth.scale.set(1, chew, 1)
    mouth.rotation.z = pose.activity === 'play' ? Math.sin(t * 8) * 0.08 : 0
  }
}

// ---------- Body building blocks ----------

type PartsRef = RefObject<Record<string, THREE.Group | null>>

/** Records an animated part under its name when it mounts (and clears it when it unmounts). */
function register(parts: PartsRef, name: string, element: THREE.Group | null) {
  parts.current[name] = element
}

function useParts(): PartsRef {
  return useRef<Record<string, THREE.Group | null>>({})
}

type ArmProps = { parts: PartsRef; name: string; side: -1 | 1; material: THREE.Material; mitt: THREE.Material; y?: number }

/** A soft arm: a rounded tapered puff ending in a ball mitt, angled slightly out from the body. */
function Arm({ parts, name, side, material, mitt, y = 0.3 }: ArmProps) {
  return (
    <group ref={(el) => register(parts, name, el)} position={[side * 0.15, y, 0]} rotation={[0, 0, side * 0.3]}>
      <Part m={material} p={[0, -0.055, 0]} s={[0.044, 0.075, 0.044]} />
      <Part m={mitt} p={[0, -0.135, 0.005]} s={0.055} />
    </group>
  )
}

type LegProps = { parts: PartsRef; name: string; side: -1 | 1; material: THREE.Material; shoe: THREE.Material }

/** A short stubby leg with a round shoe. */
function Leg({ parts, name, side, material, shoe }: LegProps) {
  return (
    <group ref={(el) => register(parts, name, el)} position={[side * 0.07, 0.12, 0]}>
      <Part m={material} p={[0, -0.04, 0]} s={[0.05, 0.062, 0.05]} />
      <Part m={shoe} p={[0, -0.095, 0.02]} s={[0.058, 0.036, 0.08]} />
    </group>
  )
}

type TorsoProps = { material: THREE.Material; belly?: THREE.Material }

/** A pear-shaped torso: a wide round base with a narrower round top. */
function Torso({ material, belly }: TorsoProps) {
  return (
    <>
      <Part m={material} p={[0, 0.2, 0]} s={[0.145, 0.125, 0.125]} />
      <Part m={material} p={[0, 0.3, 0]} s={[0.105, 0.095, 0.095]} />
      {belly && <Part m={belly} p={[0, 0.2, 0.085]} s={[0.085, 0.085, 0.05]} cast={false} />}
    </>
  )
}

/** Walk cycle, bouncy idle breathing and swaying, plus the eating and arcade-playing arm poses. */
function animateHumanoid(t: number, pose: CharacterPose, parts: Record<string, THREE.Group | null>) {
  const { walk, activity } = pose
  const idle = 1 - walk
  const breathe = Math.sin(t * 2.3)
  const hop = Math.abs(Math.sin(t * 8)) * walk
  const swing = Math.sin(t * 8) * 0.6 * walk

  if (parts.legL) parts.legL.rotation.x = swing
  if (parts.legR) parts.legR.rotation.x = -swing

  if (parts.body) {
    const body = parts.body
    // Squash and stretch: taller as it breathes in, a little wider as it breathes out, springier when walking
    const squash = breathe * 0.022 * idle + (hop - 0.5) * 0.05 * walk
    body.scale.set(1 - squash * 0.6, 1 + squash, 1 - squash * 0.6)
    body.position.y = hop * 0.04 + breathe * 0.004 * idle
    // Sways side to side while standing; leans into each step while walking
    body.rotation.z = Math.sin(t * 1.25) * 0.045 * idle + Math.sin(t * 4) * 0.07 * walk
    body.rotation.x = 0.04 * walk
  }

  if (parts.head) {
    parts.head.position.y = HEAD_Y + Math.sin(t * 2.3 + 0.6) * 0.007 * idle
    parts.head.rotation.z = Math.sin(t * 1.7 + 1) * 0.06
    parts.head.rotation.y = activity === 'none' ? Math.sin(t * 0.7) * 0.3 * idle : 0
    parts.head.rotation.x = activity === 'eat' ? Math.sin(t * 6) * 0.05 : 0
  }

  let left = -swing + Math.sin(t * 1.9) * 0.08 * idle
  let right = swing - Math.sin(t * 1.9) * 0.08 * idle
  if (activity === 'eat') {
    right = -2.2 + Math.sin(t * 6) * 0.2
    left = 0.1
  } else if (activity === 'play') {
    left = -1.2 + Math.sin(t * 19) * 0.14
    right = -1.2 + Math.sin(t * 17 + 1) * 0.14
  } else if (activity === 'repair') {
    left = -0.7 + Math.sin(t * 9) * 0.18
    right = -0.7 + Math.sin(t * 9 + Math.PI) * 0.18
  }
  if (parts.armL) parts.armL.rotation.x = left
  if (parts.armR) parts.armR.rotation.x = right
}

/** Shared by every walking species. */
function useHumanoidAnimation(pose: RefObject<CharacterPose>, parts: PartsRef) {
  useFrame(({ clock }) => animateHumanoid(clock.elapsedTime, pose.current, parts.current))
}

type BodyProps = { pose: RefObject<CharacterPose>; look: Look }

/** The body group every species hangs its parts from, so the bounce and sway reach the whole character. */
function BodyGroup({ parts, children }: { parts: PartsRef; children: ReactNode }) {
  return <group ref={(el) => register(parts, 'body', el)}>{children}</group>
}

function HeadGroup({ parts, children }: { parts: PartsRef; children: ReactNode }) {
  return (
    <group ref={(el) => register(parts, 'head', el)} position={[0, HEAD_Y, 0]}>
      {children}
    </group>
  )
}

// ---------- Human ----------

const HAIR = '#5a3d2b'

function Hair({ style, material }: { style: string; material: THREE.Material }) {
  if (style === 'bald') return null
  // A soft cap over the top and back of the head, with a short fringe
  const cap = (
    <>
      <Part m={material} p={[0, 0.045, -0.02]} s={[0.222, 0.17, 0.2]} />
      <Part m={material} p={[0, 0.115, 0.1]} s={[0.17, 0.05, 0.07]} r={[-0.3, 0, 0]} />
    </>
  )
  switch (style) {
    case 'long':
      return (
        <>
          {cap}
          <Part m={material} p={[0, -0.08, -0.12]} s={[0.19, 0.2, 0.08]} />
        </>
      )
    case 'bun':
      return (
        <>
          {cap}
          <Part m={material} p={[0, 0.215, -0.03]} s={0.085} />
        </>
      )
    case 'spiky':
      return (
        <>
          {cap}
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const angle = (i / 6) * Math.PI * 2
            return (
              <Part
                key={i}
                g={CONE}
                m={material}
                p={[Math.cos(angle) * 0.12, 0.17, Math.sin(angle) * 0.11 - 0.02]}
                s={[0.055, 0.14, 0.055]}
                r={[Math.sin(angle) * 0.5, 0, -Math.cos(angle) * 0.5]}
              />
            )
          })}
        </>
      )
    default:
      return cap
  }
}

function HumanBody({ pose, look }: BodyProps) {
  const parts = useParts()
  useHumanoidAnimation(pose, parts)
  const m = useMemo(
    () => ({
      skin: clay(look.skinTone),
      outfit: clay(look.outfitColor),
      pants: clay('#5b6478'),
      shoe: clay('#4a3b34'),
      hair: clay(HAIR),
      ear: clay(shade(look.skinTone, 0.95)),
      nose: shade(look.skinTone, 0.82),
    }),
    [look.skinTone, look.outfitColor],
  )

  return (
    <BodyGroup parts={parts}>
      <Leg parts={parts} name="legL" side={-1} material={m.pants} shoe={m.shoe} />
      <Leg parts={parts} name="legR" side={1} material={m.pants} shoe={m.shoe} />
      <Torso material={m.outfit} />
      <Arm parts={parts} name="armL" side={-1} material={m.outfit} mitt={m.skin} />
      <Arm parts={parts} name="armR" side={1} material={m.outfit} mitt={m.skin} />
      <HeadGroup parts={parts}>
        <Part m={m.skin} s={HEAD} />
        {[-1, 1].map((side) => (
          <Part key={side} m={m.ear} p={[side * 0.2, -0.01, 0]} s={[0.035, 0.05, 0.03]} />
        ))}
        <Face pose={pose} mouth="smile" nose={m.nose} browColor={shade(HAIR, 0.9)} />
        <Hair style={look.hairStyle} material={m.hair} />
      </HeadGroup>
    </BodyGroup>
  )
}

// ---------- Felinian ----------

function CatEars({ type, fur, inner, tip }: { type: string; fur: THREE.Material; inner: THREE.Material; tip: THREE.Material }) {
  return (
    <>
      {[-1, 1].map((side) => {
        const x = side * 0.115
        switch (type) {
          case 'round':
            return (
              <group key={side} position={[x, 0.15, -0.01]} rotation={[0, 0, side * -0.35]}>
                <Part m={fur} s={[0.07, 0.068, 0.04]} />
                <Part m={inner} p={[0, -0.004, 0.02]} s={[0.045, 0.044, 0.016]} cast={false} />
              </group>
            )
          case 'folded':
            return (
              <group key={side} position={[x, 0.15, 0.01]} rotation={[0.8, 0, side * -0.55]}>
                <Part g={CONE} m={fur} p={[0, 0.05, 0]} s={[0.07, 0.115, 0.045]} />
                <Part g={CONE} m={inner} p={[0, 0.045, 0.02]} s={[0.042, 0.078, 0.016]} cast={false} />
              </group>
            )
          case 'tufted':
            return (
              <group key={side} position={[x, 0.15, -0.01]} rotation={[0, 0, side * -0.3]}>
                <Part g={CONE} m={fur} p={[0, 0.06, 0]} s={[0.07, 0.125, 0.045]} />
                <Part g={CONE} m={inner} p={[0, 0.052, 0.02]} s={[0.042, 0.085, 0.016]} cast={false} />
                <Part g={CONE} m={tip} p={[0, 0.145, 0]} s={[0.02, 0.06, 0.02]} />
              </group>
            )
          default:
            return (
              <group key={side} position={[x, 0.15, -0.01]} rotation={[0, 0, side * -0.3]}>
                <Part g={CONE} m={fur} p={[0, 0.055, 0]} s={[0.07, 0.115, 0.045]} />
                <Part g={CONE} m={inner} p={[0, 0.048, 0.02]} s={[0.042, 0.078, 0.016]} cast={false} />
              </group>
            )
        }
      })}
    </>
  )
}

/** The tail swishes lazily. */
function swayTail(tail: THREE.Group | null, t: number) {
  if (!tail) return
  tail.rotation.y = Math.sin(t * 2.2) * 0.35
  tail.rotation.z = Math.sin(t * 1.5) * 0.12
}

function CatTail({ style, fur, dark, light }: { style: string; fur: THREE.Material; dark: THREE.Material; light: THREE.Material }) {
  const tail = useRef<THREE.Group>(null)
  useFrame(({ clock }) => swayTail(tail.current, clock.elapsedTime))

  const segments = style === 'long' || style === 'ringed' ? 6 : 0
  return (
    <group ref={tail} position={[0, 0.18, -0.11]}>
      {segments > 0 &&
        Array.from({ length: segments }, (_, i) => {
          const t = i / (segments - 1)
          const banded = style === 'ringed' && i % 2 === 1
          return <Part key={i} m={banded ? dark : fur} p={[0, 0.02 + t * 0.2, -0.05 - Math.sin(t * Math.PI * 0.8) * 0.1]} s={[0.04 - t * 0.008, 0.052, 0.04 - t * 0.008]} />
        })}
      {style === 'ringed' && <Part m={light} p={[0, 0.22, -0.16]} s={0.042} />}
      {style === 'fluffy' && (
        <>
          <Part m={fur} p={[0, 0.12, -0.1]} s={[0.085, 0.14, 0.085]} r={[-0.5, 0, 0]} />
          <Part m={light} p={[0, 0.25, -0.15]} s={0.075} />
        </>
      )}
      {style === 'bob' && <Part m={fur} p={[0, 0.02, -0.06]} s={0.07} />}
    </group>
  )
}

function FelinianBody({ pose, look }: BodyProps) {
  const parts = useParts()
  useHumanoidAnimation(pose, parts)
  const m = useMemo(() => {
    const dark = shade(look.furColor, 0.45)
    return {
      fur: clay(look.furColor),
      light: clay(mixHex(look.furColor, '#ffffff', 0.7)),
      dark: clay(dark),
      inner: clay('#ffa3b8'),
      white: clay('#f7f4ef'),
      orange: clay('#e8913a'),
      paw: clay(mixHex(look.furColor, '#ffffff', 0.55)),
      darkHex: dark,
    }
  }, [look.furColor])
  const pattern = look.furPattern
  const paws = pattern === 'tuxedo' ? m.white : m.paw
  const patchColors: THREE.Material[] = [m.dark, m.orange, m.white]

  return (
    <BodyGroup parts={parts}>
      <CatTail style={look.tailStyle} fur={m.fur} dark={m.dark} light={pattern === 'tuxedo' ? m.white : m.light} />
      <Leg parts={parts} name="legL" side={-1} material={m.fur} shoe={paws} />
      <Leg parts={parts} name="legR" side={1} material={m.fur} shoe={paws} />
      <Torso material={m.fur} belly={pattern === 'tuxedo' ? m.white : m.light} />
      <Arm parts={parts} name="armL" side={-1} material={m.fur} mitt={paws} />
      <Arm parts={parts} name="armR" side={1} material={m.fur} mitt={paws} />

      {/* Body markings */}
      {pattern === 'tabby' &&
        [0, 1, 2].map((i) => <Part key={i} m={m.dark} p={[0, 0.17 + i * 0.05, -0.115 + i * 0.012]} s={[0.15 - i * 0.025, 0.012, 0.014]} r={[0.25, 0, 0]} cast={false} />)}
      {pattern === 'calico' &&
        [
          [-0.09, 0.26, 0.07, 0],
          [0.1, 0.16, -0.05, 1],
          [0.0, 0.15, -0.115, 2],
        ].map(([x, y, z, c], i) => <Part key={i} m={patchColors[c]} p={[x, y, z]} s={[0.06, 0.06, 0.035]} cast={false} />)}
      {pattern === 'spotted' &&
        [
          [-0.09, 0.27, 0.06],
          [0.08, 0.2, 0.1],
          [0.1, 0.27, -0.04],
          [-0.08, 0.16, -0.09],
        ].map(([x, y, z], i) => <Part key={i} m={m.dark} p={[x, y, z]} s={[0.026, 0.026, 0.016]} cast={false} />)}

      <HeadGroup parts={parts}>
        <Part m={m.fur} s={[0.215, 0.19, 0.19]} />
        <CatEars type={look.earType} fur={m.fur} inner={m.inner} tip={m.dark} />
        {/* Muzzle (behind the nose and mouth) and whiskers */}
        <Part m={pattern === 'tuxedo' ? m.white : m.light} p={[0, -0.06, faceZ(0, -0.06) - 0.025]} s={[0.085, 0.06, 0.055]} cast={false} />
        {[-1, 1].flatMap((side) =>
          [-0.014, 0.014].map((dy) => (
            <Part key={`${side}${dy}`} m={m.dark} p={[side * 0.17, -0.06 + dy, 0.1]} s={[0.07, 0.0035, 0.0035]} r={[0, side * -0.5, dy * 6]} cast={false} />
          )),
        )}
        <Face pose={pose} mouth="w" nose="#ff7f9c" browColor={m.darkHex} />
        {/* Face markings */}
        {pattern === 'tabby' &&
          [-1, 0, 1].map((i) => <Part key={i} m={m.dark} p={[i * 0.04, 0.12, faceZ(i * 0.04, 0.12) - 0.01]} s={[0.012, 0.045, 0.01]} r={[0.5, 0, i * 0.15]} cast={false} />)}
        {pattern === 'calico' && <Part m={m.orange} p={[-0.09, 0.08, faceZ(-0.09, 0.08) - 0.01]} s={[0.065, 0.06, 0.03]} cast={false} />}
        {pattern === 'spotted' && [-0.07, 0.08].map((x) => <Part key={x} m={m.dark} p={[x, 0.11, faceZ(x, 0.11) - 0.008]} s={0.018} cast={false} />)}
      </HeadGroup>
    </BodyGroup>
  )
}

// ---------- Lumi-Jelly ----------

/** The antenna glow pulses gently (the whole group, so each part keeps its own size). */
function pulse(group: THREE.Group | null, t: number) {
  group?.scale.setScalar(1 + Math.sin(t * 3) * 0.06)
}

function Antennae({ style, stalk, orb }: { style: string; stalk: THREE.Material; orb: THREE.Material }) {
  const group = useRef<THREE.Group>(null)
  useFrame(({ clock }) => pulse(group.current, clock.elapsedTime))

  switch (style) {
    case 'twin':
      return (
        <group ref={group}>
          {[-1, 1].map((side) => (
            <group key={side} position={[side * 0.08, 0.17, 0]} rotation={[0, 0, side * -0.45]}>
              <Part g={CYLINDER} m={stalk} p={[0, 0.07, 0]} s={[0.007, 0.14, 0.007]} cast={false} />
              <Part m={orb} p={[0, 0.15, 0]} s={0.034} cast={false} />
            </group>
          ))}
        </group>
      )
    case 'curl':
      return (
        <group ref={group}>
          {Array.from({ length: 6 }, (_, i) => {
            const t = i / 5
            return <Part key={i} m={i === 5 ? orb : stalk} p={[Math.sin(t * Math.PI * 2.2) * 0.045 * t, 0.17 + t * 0.16, Math.cos(t * Math.PI * 2.2) * 0.045 * t]} s={i === 5 ? 0.036 : 0.015} cast={false} />
          })}
        </group>
      )
    case 'tri':
      return (
        <group ref={group}>
          {[-1, 0, 1].map((i) => (
            <group key={i} position={[i * 0.06, 0.17, 0]} rotation={[0, 0, i * -0.35]}>
              <Part g={CYLINDER} m={stalk} p={[0, 0.05, 0]} s={[0.006, 0.1, 0.006]} cast={false} />
              <Part m={orb} p={[0, 0.11, 0]} s={0.027} cast={false} />
            </group>
          ))}
        </group>
      )
    default:
      return (
        <group ref={group}>
          <Part g={CYLINDER} m={stalk} p={[0, 0.25, 0]} s={[0.008, 0.16, 0.008]} cast={false} />
          <Part m={orb} p={[0, 0.34, 0]} s={0.046} cast={false} />
        </group>
      )
  }
}

/** The jelly drifts rather than walks: it bobs and squishes, and its tentacles ripple. */
function animateJelly(t: number, pose: CharacterPose, body: THREE.Group | null, tentacles: THREE.Group | null, armL: THREE.Group | null, armR: THREE.Group | null) {
  const { walk, activity } = pose
  if (body) {
    body.position.y = 0.22 + Math.sin(t * 2.2) * (0.025 + 0.025 * walk)
    const squish = Math.sin(t * 4.4) * 0.05
    body.scale.set(1 + squish * 0.7, 1 - squish, 1 + squish * 0.7)
    body.rotation.z = Math.sin(t * 1.3) * 0.06
  }
  tentacles?.children.forEach((child, i) => {
    child.rotation.x = Math.sin(t * 3 + i) * 0.28
    child.rotation.z = Math.cos(t * 2.6 + i * 1.7) * 0.28
  })
  let left = Math.sin(t * 2) * 0.2
  let right = -left
  if (activity === 'eat') right = -2.0 + Math.sin(t * 6) * 0.2
  else if (activity === 'play') left = right = -1.1 + Math.sin(t * 18) * 0.15
  else if (activity === 'repair') left = right = -0.8 + Math.sin(t * 9) * 0.15
  if (armL) armL.rotation.x = left
  if (armR) armR.rotation.x = right
}

function JellyBody({ pose, look }: BodyProps) {
  const body = useRef<THREE.Group>(null)
  const tentacles = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const m = useMemo(
    () => ({
      dome: new THREE.MeshStandardMaterial({ color: look.jellyColor, transparent: true, opacity: 0.68, roughness: 0.55, metalness: 0, emissive: look.jellyColor, emissiveIntensity: 0.4, depthWrite: false }),
      tentacle: new THREE.MeshStandardMaterial({ color: look.jellyColor, transparent: true, opacity: 0.55, roughness: 0.6, emissive: look.jellyColor, emissiveIntensity: 0.4, depthWrite: false }),
      core: glowMaterial(mixHex(look.jellyColor, '#ffffff', 0.35), 2.4),
      orb: glowMaterial(mixHex(look.jellyColor, '#ffffff', 0.25), 3.2),
      stalk: new THREE.MeshStandardMaterial({ color: look.jellyColor, transparent: true, opacity: 0.75, roughness: 0.5, emissive: look.jellyColor, emissiveIntensity: 0.7 }),
      darkHex: shade(look.jellyColor, 0.35),
    }),
    [look.jellyColor],
  )

  useFrame(({ clock }) => animateJelly(clock.elapsedTime, pose.current, body.current, tentacles.current, armL.current, armR.current))

  return (
    <group ref={body} position={[0, 0.22, 0]}>
      <group position={[0, 0.3, 0]}>
        <Part m={m.dome} s={[0.23, 0.21, 0.21]} cast={false} />
        <Part m={m.core} p={[0, -0.01, -0.03]} s={0.075} cast={false} />
        <Face pose={pose} mouth="o" nose={null} browColor={m.darkHex} cheek="#ff9ec0" eyeSpread={0.08} eyeColor="#1d2a3a" />
      </group>
      <group ref={tentacles}>
        {Array.from({ length: 7 }, (_, i) => {
          const angle = (i / 7) * Math.PI * 2
          return (
            <group key={i} position={[Math.cos(angle) * 0.14, 0.2, Math.sin(angle) * 0.14]}>
              <Part m={m.tentacle} p={[0, -0.09, 0]} s={[0.032, 0.1, 0.032]} cast={false} />
            </group>
          )
        })}
      </group>
      {[-1, 1].map((side) => (
        <group key={side} ref={side < 0 ? armL : armR} position={[side * 0.2, 0.28, 0.03]}>
          <Part m={m.tentacle} p={[0, -0.05, 0]} s={[0.035, 0.07, 0.035]} cast={false} />
        </group>
      ))}
      <Antennae style={look.antennaStyle} stalk={m.stalk} orb={m.orb} />
      {/* It glows: a soft light of its own colour */}
      <pointLight position={[0, 0.3, 0.05]} color={look.jellyColor} intensity={1.1} distance={4} decay={1.5} />
    </group>
  )
}

// ---------- Synth-Bot ----------

const faceCache = new Map<string, THREE.CanvasTexture>()

/** The LED screen face: bright shapes on black, drawn on a canvas. */
function faceTexture(style: string) {
  const cached = faceCache.get(style)
  if (cached) return cached
  const canvas = document.createElement('canvas')
  canvas.width = 160
  canvas.height = 96
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#02080c'
  ctx.fillRect(0, 0, 160, 96)
  ctx.strokeStyle = ctx.fillStyle = '#5dfff0'
  ctx.lineWidth = 7
  ctx.lineCap = 'round'
  const dot = (x: number, y: number, r = 9) => {
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  switch (style) {
    case 'happy':
      for (const x of [50, 110]) {
        ctx.beginPath()
        ctx.moveTo(x - 14, 40)
        ctx.lineTo(x, 24)
        ctx.lineTo(x + 14, 40)
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.arc(80, 54, 20, 0.15 * Math.PI, 0.85 * Math.PI)
      ctx.stroke()
      break
    case 'dots':
      dot(50, 36, 11)
      dot(110, 36, 11)
      ctx.beginPath()
      ctx.moveTo(64, 68)
      ctx.lineTo(96, 68)
      ctx.stroke()
      break
    case 'wave':
      dot(50, 32, 8)
      dot(110, 32, 8)
      ctx.beginPath()
      for (let x = 44; x <= 116; x += 4) ctx.lineTo(x, 66 + Math.sin(((x - 44) / 72) * Math.PI * 3) * 8)
      ctx.stroke()
      break
    case 'heart':
      ctx.fillStyle = '#ff7ad0'
      for (const x of [50, 110]) {
        ctx.beginPath()
        ctx.moveTo(x, 46)
        ctx.bezierCurveTo(x - 24, 26, x - 10, 12, x, 28)
        ctx.bezierCurveTo(x + 10, 12, x + 24, 26, x, 46)
        ctx.fill()
      }
      ctx.strokeStyle = '#ff7ad0'
      ctx.beginPath()
      ctx.arc(80, 56, 16, 0.2 * Math.PI, 0.8 * Math.PI)
      ctx.stroke()
      break
    default:
      dot(50, 34, 10)
      dot(110, 34, 10)
      ctx.beginPath()
      ctx.arc(80, 52, 22, 0.15 * Math.PI, 0.85 * Math.PI)
      ctx.stroke()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  faceCache.set(style, texture)
  return texture
}

function SynthBody({ pose, look }: BodyProps) {
  const parts = useParts()
  useHumanoidAnimation(pose, parts)
  const m = useMemo(() => {
    const face = faceTexture(look.faceStyle)
    return {
      shell: clay(look.shellColor),
      joint: clay('#59606e'),
      screen: new THREE.MeshStandardMaterial({ color: '#000000', map: face, emissive: '#ffffff', emissiveMap: face, emissiveIntensity: 1.6, toneMapped: false }),
      bezel: clay('#222633'),
      led: glowMaterial('#4dff88', 3),
      chest: glowMaterial('#5dfff0', 2.4),
      cheek: new THREE.MeshBasicMaterial({ color: '#ff8fa6', transparent: true, opacity: 0.7 }),
    }
  }, [look.shellColor, look.faceStyle])

  return (
    <BodyGroup parts={parts}>
      <Leg parts={parts} name="legL" side={-1} material={m.shell} shoe={m.joint} />
      <Leg parts={parts} name="legR" side={1} material={m.shell} shoe={m.joint} />
      <Torso material={m.shell} belly={m.bezel} />
      <Part m={m.chest} p={[0, 0.2, 0.123]} s={[0.04, 0.014, 0.01]} cast={false} />
      <Arm parts={parts} name="armL" side={-1} material={m.shell} mitt={m.joint} />
      <Arm parts={parts} name="armR" side={1} material={m.shell} mitt={m.joint} />
      <HeadGroup parts={parts}>
        <Part m={m.shell} s={HEAD} />
        {/* A dark bezel and the curved LED screen, hugging the front of the head */}
        <Part g={SCREEN_PATCH} m={m.bezel} s={[HEAD[0] * 1.012, HEAD[1] * 1.012, HEAD[2] * 1.012]} cast={false} />
        <mesh geometry={SCREEN_PATCH} material={m.screen} scale={[HEAD[0] * 1.02, HEAD[1] * 1.02, HEAD[2] * 1.02]} />
        {/* Blush dots even on a robot, and round ear-pods */}
        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh geometry={SPHERE} material={m.cheek} position={[side * 0.14, -0.068, faceZ(0.14, -0.068) + 0.003]} scale={[0.028, 0.019, 0.008]} rotation={[0, side * 0.9, 0]} />
            <Part m={m.joint} p={[side * 0.205, -0.01, 0]} s={[0.035, 0.055, 0.055]} />
          </group>
        ))}
        <Part g={CYLINDER} m={m.joint} p={[0, 0.2, 0]} s={[0.008, 0.07, 0.008]} />
        <Part m={m.led} p={[0, 0.245, 0]} s={0.024} cast={false} />
      </HeadGroup>
    </BodyGroup>
  )
}

// ---------- Floran ----------

/** The sprout nods gently. */
function sproutSway(group: THREE.Group | null, t: number) {
  if (group) group.rotation.z = Math.sin(t * 1.6) * 0.08
}

function Sprout({ type, leaf, stem, petal, center }: { type: string; leaf: THREE.Material; stem: THREE.Material; petal: THREE.Material; center: THREE.Material }) {
  const group = useRef<THREE.Group>(null)
  useFrame(({ clock }) => sproutSway(group.current, clock.elapsedTime))

  return (
    <group ref={group} position={[0, 0.16, 0]}>
      {type === 'flower' && (
        <>
          <Part g={CYLINDER} m={stem} p={[0, 0.06, 0]} s={[0.014, 0.12, 0.014]} />
          {Array.from({ length: 6 }, (_, i) => {
            const a = (i / 6) * Math.PI * 2
            return <Part key={i} m={petal} p={[Math.cos(a) * 0.05, 0.14, Math.sin(a) * 0.05]} s={[0.037, 0.014, 0.037]} r={[Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3]} />
          })}
          <Part m={center} p={[0, 0.146, 0]} s={0.034} />
        </>
      )}
      {type === 'bud' && (
        <>
          <Part g={CYLINDER} m={stem} p={[0, 0.05, 0]} s={[0.014, 0.1, 0.014]} />
          <Part m={petal} p={[0, 0.13, 0]} s={[0.046, 0.06, 0.046]} />
          <Part g={CONE} m={petal} p={[0, 0.195, 0]} s={[0.034, 0.055, 0.034]} />
          {[-1, 1].map((side) => (
            <Part key={side} m={leaf} p={[side * 0.045, 0.075, 0]} s={[0.04, 0.014, 0.02]} r={[0, 0, side * 0.5]} />
          ))}
        </>
      )}
      {type === 'vine' && (
        <>
          {Array.from({ length: 9 }, (_, i) => {
            const t = i / 8
            return <Part key={i} m={stem} p={[Math.sin(t * Math.PI * 2.4) * 0.055 * (0.4 + t), 0.02 + t * 0.2, Math.cos(t * Math.PI * 2.4) * 0.055 * (0.4 + t)]} s={0.017 - t * 0.005} />
          })}
          <Part m={leaf} p={[0.035, 0.12, 0]} s={[0.045, 0.014, 0.024]} r={[0, 0, 0.6]} />
        </>
      )}
      {(type === 'sprout' || !['flower', 'bud', 'vine'].includes(type)) && (
        <>
          <Part g={CYLINDER} m={stem} p={[0, 0.045, 0]} s={[0.014, 0.09, 0.014]} />
          {[-1, 1].map((side) => (
            <Part key={side} m={leaf} p={[side * 0.055, 0.11, 0]} s={[0.068, 0.018, 0.034]} r={[0, 0, side * 0.5]} />
          ))}
        </>
      )}
    </group>
  )
}

/** Eases the leaves' glow towards `target` (a plain function, since it adjusts materials). */
function glowLeaves(skin: THREE.MeshToonMaterial, leaf: THREE.MeshToonMaterial, target: number) {
  skin.emissiveIntensity += (target - skin.emissiveIntensity) * 0.05
  leaf.emissiveIntensity = skin.emissiveIntensity
}

function FloranBody({ pose, look }: BodyProps) {
  const parts = useParts()
  useHumanoidAnimation(pose, parts)
  const m = useMemo(
    () => ({
      skin: clay(look.leafTone),
      deep: clay(shade(look.leafTone, 0.72)),
      leaf: clay(shade(look.leafTone, 0.88)),
      stem: clay('#5aa845'),
      petal: clay('#ff9ac8'),
      center: clay('#ffd54a'),
      root: clay('#8a6a46'),
      darkHex: shade(look.leafTone, 0.45),
    }),
    [look.leafTone],
  )

  // Photosynthesis: the leaves light up while it's basking
  useFrame(() => glowLeaves(m.skin, m.leaf, crewStats.lit ? 0.5 : 0.1))

  return (
    <BodyGroup parts={parts}>
      <Leg parts={parts} name="legL" side={-1} material={m.skin} shoe={m.root} />
      <Leg parts={parts} name="legR" side={1} material={m.skin} shoe={m.root} />
      <Torso material={m.skin} />
      {/* A leafy collar and a little leaf skirt */}
      {Array.from({ length: 7 }, (_, i) => {
        const a = (i / 7) * Math.PI * 2
        return <Part key={`c${i}`} m={m.leaf} p={[Math.cos(a) * 0.1, 0.375, Math.sin(a) * 0.09]} s={[0.05, 0.016, 0.03]} r={[0, -a, Math.cos(a) * 0.4]} />
      })}
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2
        return <Part key={`s${i}`} m={m.deep} p={[Math.cos(a) * 0.125, 0.12, Math.sin(a) * 0.115]} s={[0.045, 0.075, 0.018]} r={[Math.sin(a) * 0.5, -a, -Math.cos(a) * 0.5]} />
      })}
      <Arm parts={parts} name="armL" side={-1} material={m.skin} mitt={m.skin} />
      <Arm parts={parts} name="armR" side={1} material={m.skin} mitt={m.skin} />
      <HeadGroup parts={parts}>
        <Part m={m.skin} s={HEAD} />
        {[-1, 1].map((side) => (
          <Part key={side} m={m.leaf} p={[side * 0.215, 0, -0.01]} s={[0.06, 0.036, 0.016]} r={[0, side * 0.3, side * 0.6]} />
        ))}
        <Face pose={pose} mouth="smile" nose={shade(look.leafTone, 0.8)} browColor={m.darkHex} eyeColor="#1d2b20" cheek="#ff98ab" />
        <Sprout type={look.sproutType} leaf={m.leaf} stem={m.stem} petal={m.petal} center={m.center} />
      </HeadGroup>
    </BodyGroup>
  )
}

// ---------- Entry point ----------

type CharacterProps = { pose: RefObject<CharacterPose>; species?: SpeciesId; look?: Look }

/** A cute, cosy crew member of any species. */
export function Character({ pose, species = crewProfile.species, look = crewProfile.look }: CharacterProps) {
  switch (species) {
    case 'lumijelly':
      return <JellyBody pose={pose} look={look} />
    case 'felinian':
      return <FelinianBody pose={pose} look={look} />
    case 'synthbot':
      return <SynthBody pose={pose} look={look} />
    case 'floran':
      return <FloranBody pose={pose} look={look} />
    default:
      return <HumanBody pose={pose} look={look} />
  }
}
