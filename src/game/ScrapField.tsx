import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import * as THREE from 'three'
import {
  RELICS_NEEDED,
  SCRAP_PICKUP_VALUE,
  collectRelic,
  gameStats,
  notify,
  setHarvest,
  setRelicDistance,
} from './gameState'
import type { Sector } from './sector'
import { targetHandlers } from './targetScreen'
import { scrapRef, scrapRegistry } from './targets'
import type { GameMode } from './types'
import { currentSpecies } from './crewProfile'
import { currentHarvester } from './upgrades'
import { useKeyboard } from './useKeyboard'

const BEAM_RADIUS = 0.1
/** How fast a half-reeled-in piece of scrap drifts back when the beam lets go, in progress/s */
const RELEASE_RATE = 1.5
/** A relic takes this many times longer to reel in than a piece of scrap */
const RELIC_REEL_FACTOR = 3
const RELIC_COLOR = '#5ff0ff'
const UP = new THREE.Vector3(0, 1, 0)

type Pickup = { id: number; position: THREE.Vector3; kind: 'scrap' | 'relic' }

function buildPickups(sector: Sector): Pickup[] {
  const pickups: Pickup[] = sector.scrap.map((p, id) => ({ id, position: new THREE.Vector3(...p), kind: 'scrap' }))
  if (sector.relic) pickups.push({ id: pickups.length, position: new THREE.Vector3(...sector.relic), kind: 'relic' })
  return pickups
}

type ScrapFieldProps = {
  /** Mount this with `key={sector.id}` so a new sector starts fresh */
  sector: Sector
  shipPosition: RefObject<THREE.Vector3>
  /** Pickups can only be harvested while flying */
  mode: GameMode
}

/**
 * The sector's floating scrap and Signal Relic, harvested with the ship's beam: hold F near a piece
 * (or just get close, with the Magnetic Scoop and better) and it is reeled in over a short beam.
 * Deliberately not physics bodies: a squared-distance check per remaining pickup per frame is all
 * it costs.
 */
export function ScrapField({ sector, shipPosition, mode }: ScrapFieldProps) {
  const pickups = useMemo(() => buildPickups(sector), [sector])
  const [collected, setCollected] = useState<ReadonlySet<number>>(new Set())
  const group = useRef<THREE.Group>(null)
  const beam = useRef<THREE.Mesh>(null)
  const keys = useKeyboard(false)

  /** 0-1 reel-in progress per pickup id, and the one currently being beamed */
  const progress = useRef(new Map<number, number>())
  const target = useRef<number | null>(null)
  const scratch = useMemo(() => new THREE.Vector3(), [])
  const relic = pickups.find((p) => p.kind === 'relic')

  // Publish the pickups so the auto-pilot and the targeting system can find them
  useEffect(() => {
    for (const p of pickups) scrapRegistry.set(p.id, { position: p.position.clone(), relic: p.kind === 'relic' })
    return () => {
      for (const p of pickups) scrapRegistry.delete(p.id)
    }
  }, [pickups])

  useFrame((state, dt) => {
    const children = group.current?.children
    if (!children) return
    const step = Math.min(dt, 0.1)
    const ship = shipPosition.current
    const tier = currentHarvester()
    const active = mode === 'pilot' && !gameStats.victory && gameStats.fold.phase === 'idle'
    // The auto-pilot's harvest task works the beam for you, on the piece it chose
    const ap = gameStats.autopilot
    const autoTarget = ap.engaged && ap.task === 'harvest' ? ap.harvestId : null
    const holding = keys.current.has('KeyF') || autoTarget !== null

    // Pick the target: keep the current one while it's still in reach, else the nearest in reach
    let inRange = 0
    let nearest: number | null = null
    let nearestDistSq = Infinity
    let keepTarget = false
    for (const child of children) {
      const id = child.userData.id as number
      const distSq = pickups[id].position.distanceToSquared(ship)
      const reach = holding ? tier.range : tier.autoRange
      if (active && distSq < tier.range * tier.range) inRange++
      if (active && distSq < reach * reach) {
        if (id === target.current) keepTarget = true
        if (distSq < nearestDistSq) {
          nearestDistSq = distSq
          nearest = id
        }
      }
    }
    if (autoTarget !== null && active && pickups[autoTarget] && pickups[autoTarget].position.distanceToSquared(ship) < tier.range * tier.range) {
      target.current = autoTarget
    } else if (!keepTarget) {
      target.current = nearest
    }

    // Reel the target in; everything else drifts back to where it was
    let collectedId: number | null = null
    for (const child of children) {
      const id = child.userData.id as number
      const pickup = pickups[id]
      let p = progress.current.get(id) ?? 0
      if (id === target.current) {
        // A Synth-Bot's beam is faster
        const reelTime = (tier.collectTime * (pickup.kind === 'relic' ? RELIC_REEL_FACTOR : 1)) / currentSpecies().harvestSpeed
        p = Math.min(1, p + step / reelTime)
        if (p >= 1) collectedId = id
      } else if (p > 0) {
        p = Math.max(0, p - step * RELEASE_RATE)
      }
      progress.current.set(id, p)

      const eased = p * p * (3 - 2 * p)
      child.position.lerpVectors(pickup.position, ship, eased)
      child.rotation.y += dt * (1 + p * 8)
      child.rotation.x += dt * 0.5
      // Pickups within reach swell a little, so you can see what the beam can grab
      const swell = active && pickup.position.distanceToSquared(ship) < tier.range * tier.range ? 1.3 : 1
      child.scale.setScalar(swell)
      scrapRegistry.get(id)?.position.copy(child.position) // keep the registry on the live position while it's being reeled in
    }

    // Beam visual: a cylinder stretched from the ship to the pickup being reeled in (colour follows the tier)
    const beamMesh = beam.current
    if (beamMesh) {
      const targetMesh = children.find((c) => c.userData.id === target.current)
      beamMesh.visible = Boolean(targetMesh)
      const isRelic = target.current !== null && pickups[target.current].kind === 'relic'
      ;(beamMesh.material as THREE.MeshBasicMaterial).color.set(isRelic ? RELIC_COLOR : tier.beamColor)
      if (targetMesh) {
        scratch.copy(targetMesh.position).sub(ship)
        const length = scratch.length()
        beamMesh.position.copy(ship).addScaledVector(scratch, 0.5)
        beamMesh.quaternion.setFromUnitVectors(UP, scratch.divideScalar(length || 1))
        const pulse = 1 + 0.5 * Math.sin(state.clock.elapsedTime * 25)
        beamMesh.scale.set(pulse, length, pulse)
      }
    }

    // HUD status
    const t = target.current
    const reeled = t === null ? 0 : (progress.current.get(t) ?? 0)
    if (mode !== 'pilot') setHarvest('Pilot mode only', 0)
    else if (t !== null) setHarvest(`${pickups[t].kind === 'relic' ? 'Decoding relic' : 'Harvesting'} ${Math.round(reeled * 100)}%`, reeled)
    else if (inRange > 0) setHarvest(`${inRange} in range — hold F`, 0)
    else setHarvest('Nothing in range', 0)

    // Tell the HUD how far the sector's relic beacon is
    setRelicDistance(relic && !collected.has(relic.id) ? relic.position.distanceTo(ship) : null)

    if (collectedId !== null) {
      if (pickups[collectedId].kind === 'relic') {
        collectRelic()
        const unlocked = gameStats.relics >= RELICS_NEEDED
        notify(
          unlocked
            ? 'Signal Relic recovered: Earth 2.0 coordinates decoded! Fold [J] to reach it'
            : `Signal Relic recovered (${gameStats.relics}/${RELICS_NEEDED})`,
          'gain',
          4500,
        )
      } else {
        gameStats.scrap += SCRAP_PICKUP_VALUE
        notify(`+${SCRAP_PICKUP_VALUE} Scrap`, 'gain', 1000)
      }
      target.current = null
      progress.current.delete(collectedId)
      scrapRegistry.delete(collectedId)
      setCollected((prev) => new Set([...prev, collectedId]))
    }
  })

  return (
    <>
      <group ref={group}>
        {pickups
          .filter((p) => !collected.has(p.id))
          .map((p) => (
            <mesh key={p.id} position={p.position} userData={{ id: p.id }} {...targetHandlers(scrapRef(p.id, p.kind === 'relic'))}>
              {/* A bigger invisible hit area, so small pickups are easy to click */}
              <mesh>
                <sphereGeometry args={[p.kind === 'relic' ? 4 : 3, 8, 6]} />
                <meshBasicMaterial colorWrite={false} depthWrite={false} />
              </mesh>
              {p.kind === 'relic' ? (
                <>
                  <icosahedronGeometry args={[1.4, 0]} />
                  <meshStandardMaterial color={RELIC_COLOR} emissive="#19c6e6" emissiveIntensity={1.8} metalness={0.7} roughness={0.2} />
                </>
              ) : (
                <>
                  <octahedronGeometry args={[0.8]} />
                  <meshStandardMaterial color="#ffd633" emissive="#ffb300" emissiveIntensity={1.4} metalness={0.6} roughness={0.3} />
                </>
              )}
            </mesh>
          ))}
      </group>

      {/* A pillar of light so the relic can be spotted from across the sector */}
      {relic && !collected.has(relic.id) && (
        <mesh position={relic.position} raycast={() => null}>
          <cylinderGeometry args={[2.5, 2.5, 1200, 16, 1, true]} />
          <meshBasicMaterial color={RELIC_COLOR} transparent opacity={0.16} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
        </mesh>
      )}

      <mesh ref={beam} visible={false} raycast={() => null}>
        <cylinderGeometry args={[BEAM_RADIUS, BEAM_RADIUS, 1, 8, 1, true]} />
        <meshBasicMaterial color={currentHarvester().beamColor} transparent opacity={0.7} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </>
  )
}
