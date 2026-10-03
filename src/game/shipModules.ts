import type { Block } from './types'

export const REPAIR_BAY_TRIGGER = 75
export const REPAIR_BAY_RATE = 5

export function engineThrustMultiplier(blocks: readonly Block[]) {
  const engines = blocks.filter((block) => block.type === 'engine').length
  return 1 + Math.min(engines, 4) * 0.25
}

export function shieldDamageFactor(blocks: readonly Block[]) {
  const shields = blocks.filter((block) => block.type === 'shield').length
  return Math.max(0.4, 1 - shields * 0.2)
}

export const repairBayNeeded = (hull: number) => hull < REPAIR_BAY_TRIGGER
