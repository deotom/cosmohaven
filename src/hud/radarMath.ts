import { Quaternion, Vector3 } from 'three'

export type RadarPoint = { x: number; y: number; height: number; clipped: boolean; distance: number }
export type RadarContact = RadarPoint & { key: string; priority: number; selected: boolean }

/** Ship forward is local -Z; canvas up is negative Y. Inputs are never mutated. */
export function projectRadar(
  position: Readonly<{ x: number; y: number; z: number }>,
  origin: Readonly<{ x: number; y: number; z: number }>,
  quaternion: Readonly<{ x: number; y: number; z: number; w: number }>,
  range: number,
): RadarPoint {
  if (!Number.isFinite(range) || range <= 0) throw new RangeError('Radar range must be finite and positive')
  const inverse = new Quaternion(quaternion.x, quaternion.y, quaternion.z, quaternion.w).normalize().conjugate()
  const local = new Vector3(position.x - origin.x, position.y - origin.y, position.z - origin.z).applyQuaternion(inverse)
  const distance = local.length()
  const horizontal = Math.hypot(local.x, local.z)
  const clipped = distance > range
  // A contact directly above/below has no bearing: use the top rim when clipped.
  const scale = clipped ? horizontal : range
  return {
    x: scale > 0 ? local.x / scale : 0,
    y: scale > 0 ? local.z / scale : clipped ? -1 : 0,
    height: Math.max(-1, Math.min(1, local.y / range)),
    clipped,
    distance,
  }
}

/** Keep navigation landmarks at the rim, cull distant loose cargo, and never lose the locked target. */
export function selectRadarContacts<T extends RadarContact>(contacts: readonly T[], limit: number): T[] {
  return contacts
    .filter((contact) => contact.selected || !contact.clipped || contact.priority > 0)
    .sort((a, b) => Number(b.selected) - Number(a.selected) || b.priority - a.priority || a.distance - b.distance || a.key.localeCompare(b.key))
    .slice(0, Math.max(0, Math.floor(limit)))
}
