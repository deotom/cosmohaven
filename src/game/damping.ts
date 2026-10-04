/**
 * Cannon scales a body's velocity by (1 - damping) ^ dt every step, so a damping of 1 or more makes the base zero
 * or negative: the velocity becomes NaN and the whole ship state is lost. Keep the total safely below 1.
 */
export const MAX_LINEAR_DAMPING = 0.95

export type DampingTerms = {
  /** Drag in open space */
  base: number
  /** Drag deep inside a gravity well (0 so orbits do not spiral in) */
  well: number
  /** 0 outside every well, 1 deep inside one: blends `base` into `well` */
  freedom: number
  /** Extra drag at the surface of a body with an atmosphere */
  atmosphereDrag: number
  /** 0 outside an atmosphere, 1 at the surface */
  atmosphere: number
  /** Extra drag while sitting on the ground after a landing (0 otherwise) */
  landed: number
}

/** The ship's linear damping, always within [0, MAX_LINEAR_DAMPING]. */
export function linearDamping(terms: DampingTerms) {
  const raw = terms.base + (terms.well - terms.base) * terms.freedom + terms.atmosphereDrag * terms.atmosphere + terms.landed
  if (!Number.isFinite(raw)) return terms.base
  return Math.max(0, Math.min(MAX_LINEAR_DAMPING, raw))
}
