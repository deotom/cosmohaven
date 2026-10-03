import * as THREE from 'three'
import { canAddCargo, CELESTIAL_BODIES, meteorTracks, type TargetKind, type TargetRef } from './gameState'
import { getSector } from './sector'
import { stationPose } from './station'

/** Live positions of harvestable cargo, kept by the ScrapField for the auto-pilot and targeting systems. */
export const scrapRegistry = new Map<number, { position: THREE.Vector3; kind: 'scrap' | 'relic' | 'survey'; surveyId?: string }>()

/** What a target is right now, in world space. */
export type TargetState = {
  position: THREE.Vector3
  velocity: THREE.Vector3
  /** Radius of the object, for choosing how close to stop */
  radius: number
}

export const createTargetState = (): TargetState => ({
  position: new THREE.Vector3(),
  velocity: new THREE.Vector3(),
  radius: 1,
})

export const scrapRef = (id: number, kind: 'scrap' | 'relic' | 'survey'): TargetRef => ({
  kind,
  key: `scrap:${id}`,
  name: kind === 'relic' ? 'Signal Relic' : kind === 'survey' ? 'Survey Beacon' : 'Scrap',
})
export const meteorRef = (id: number): TargetRef => ({ kind: 'meteor', key: `meteor:${id}`, name: `Meteor ${id}` })
export const planetRef = (name: string): TargetRef => ({ kind: 'planet', key: `planet:${name}`, name })
export const stationRef = (name: string): TargetRef => ({ kind: 'station', key: `station:${name}`, name })

const idOf = (ref: TargetRef) => Number(ref.key.split(':')[1])

/** Fills `out` with the target's current state. Returns false if it no longer exists (collected, expired, folded away). */
export function resolveTarget(ref: TargetRef, out: TargetState): boolean {
  out.velocity.set(0, 0, 0)
  switch (ref.kind) {
    case 'planet': {
      const body = CELESTIAL_BODIES.find((b) => b.name === ref.name)
      if (!body) return false
      out.position.set(...body.position)
      out.radius = body.radius
      return true
    }
    case 'station': {
      const station = getSector().stations.find((s) => s.name === ref.name)
      if (!station) return false
      out.position.set(...station.position)
      out.radius = 30
      return true
    }
    case 'scrap':
    case 'relic': {
      const pickup = scrapRegistry.get(idOf(ref))
      if (!pickup) return false
      out.position.copy(pickup.position)
      out.radius = pickup.kind === 'relic' ? 1.4 : pickup.kind === 'survey' ? 2 : 0.8
      return true
    }
    case 'survey': {
      const pickup = scrapRegistry.get(idOf(ref))
      if (!pickup || pickup.kind !== 'survey') return false
      out.position.copy(pickup.position)
      out.radius = 2
      return true
    }
    case 'meteor': {
      const track = meteorTracks.get(idOf(ref))
      if (!track) return false
      out.position.set(...track.position)
      out.velocity.set(...track.velocity)
      out.radius = 1.3
      return true
    }
  }
}

const scratch = createTargetState()

/** The auto-pilot approaches stations by their hangar entrance rather than their centre. */
export function stationEntrance(name: string): THREE.Vector3 | null {
  const station = getSector().stations.find((s) => s.name === name)
  return station ? stationPose(station).entrance : null
}

const SCRAP_LIST_RANGE = 300

/** Everything the ship can target, nearest first: planets, stations, nearby scrap and relics, incoming meteors. */
export function listTargets(from: THREE.Vector3, range = 1500): TargetRef[] {
  const found: { ref: TargetRef; distance: number }[] = []
  const add = (ref: TargetRef, maxRange: number) => {
    if (!resolveTarget(ref, scratch)) return
    const distance = scratch.position.distanceTo(from)
    if (distance <= maxRange) found.push({ ref, distance })
  }
  for (const body of CELESTIAL_BODIES) add(planetRef(body.name), 1e9)
  for (const station of getSector().stations) add(stationRef(station.name), 1e9)
  for (const [id, pickup] of scrapRegistry) {
    const cargoKind = pickup.kind === 'relic' ? 'relics' : 'scrap'
    if (canAddCargo(cargoKind)) add(scrapRef(id, pickup.kind), pickup.kind === 'relic' ? 1e9 : SCRAP_LIST_RANGE)
  }
  for (const id of meteorTracks.keys()) add(meteorRef(id), range)
  return found.sort((a, b) => a.distance - b.distance).map((f) => f.ref)
}

export const kindLabel: Record<TargetKind, string> = {
  planet: 'PLANET',
  station: 'SPACE STATION',
  scrap: 'SCRAP',
  relic: 'SIGNAL RELIC',
  survey: 'SURVEY BEACON',
  meteor: 'METEOR',
}
