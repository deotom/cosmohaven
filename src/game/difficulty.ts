export type Difficulty = 'relaxed' | 'standard' | 'challenging'

export const DIFFICULTY_ORDER: readonly Difficulty[] = ['relaxed', 'standard', 'challenging']

export const DIFFICULTY_PROFILES: Record<Difficulty, { label: string; meteorInterval: [number, number]; priceMultiplier: number }> = {
  relaxed: { label: 'Relaxed', meteorInterval: [30, 40], priceMultiplier: 0.8 },
  standard: { label: 'Standard', meteorInterval: [15, 20], priceMultiplier: 1 },
  challenging: { label: 'Challenging', meteorInterval: [8, 12], priceMultiplier: 1.25 },
}

export function adjustedCost(baseCost: number, difficulty: Difficulty) {
  if (!Number.isFinite(baseCost) || baseCost < 0) throw new RangeError('Cost must be a non-negative finite number')
  return Math.round(baseCost * DIFFICULTY_PROFILES[difficulty].priceMultiplier)
}
