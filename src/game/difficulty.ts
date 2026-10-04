export type Difficulty = 'relaxed' | 'standard' | 'challenging'

export const DIFFICULTY_ORDER: readonly Difficulty[] = ['relaxed', 'standard', 'challenging']

/** meteorGap: seconds between meteor events = a hard minimum plus an exponential tail whose overall mean is mean. */
export const DIFFICULTY_PROFILES: Record<Difficulty, { label: string; meteorGap: { min: number; mean: number }; priceMultiplier: number }> = {
  relaxed: { label: 'Relaxed', meteorGap: { min: 25, mean: 100 }, priceMultiplier: 0.8 },
  standard: { label: 'Standard', meteorGap: { min: 15, mean: 50 }, priceMultiplier: 1 },
  challenging: { label: 'Challenging', meteorGap: { min: 8, mean: 25 }, priceMultiplier: 1.25 },
}

export function adjustedCost(baseCost: number, difficulty: Difficulty) {
  if (!Number.isFinite(baseCost) || baseCost < 0) throw new RangeError('Cost must be a non-negative finite number')
  return Math.round(baseCost * DIFFICULTY_PROFILES[difficulty].priceMultiplier)
}
