import { gameStats, notify, trySpendScrap } from './gameState'
import { adjustedCost } from './difficulty'

export type HarvesterTier = {
  name: string
  /** Hold F to beam scrap within this distance */
  range: number
  /** Scrap within this distance is pulled in automatically; 0 for no auto-pull */
  autoRange: number
  /** Seconds of beam time to reel in one piece of scrap */
  collectTime: number
  /** Scrap cost to buy this tier */
  cost: number
  beamColor: string
  blurb: string
}

export const HARVESTER_TIERS: readonly HarvesterTier[] = [
  { name: 'T-Beam', range: 10, autoRange: 0, collectTime: 2.5, cost: 0, beamColor: '#4dd0ff', blurb: 'short range, slow' },
  { name: 'Magnetic Scoop', range: 22, autoRange: 8, collectTime: 1.5, cost: 80, beamColor: '#c77dff', blurb: 'wider range, auto-pulls close scrap' },
  { name: 'Quantum Harvester', range: 55, autoRange: 12, collectTime: 0.5, cost: 200, beamColor: '#ffd84d', blurb: 'long range, fast beam' },
]

export type AutopilotTier = { name: string; cost: number; blurb: string }

export const AUTOPILOT_TIERS: readonly AutopilotTier[] = [
  { name: 'Basic', cost: 0, blurb: 'aligns and flies straight to the waypoint; cannot dodge' },
  { name: 'Advanced', cost: 120, blurb: 'adds collision avoidance for meteors' },
  { name: 'Expert', cost: 250, blurb: 'fuel-efficient burns, locks into planetary orbits' },
]

export const currentHarvester = () => HARVESTER_TIERS[gameStats.harvesterTier - 1]
export const currentAutopilot = () => AUTOPILOT_TIERS[gameStats.autopilotTier - 1]
export const nextUpgradeCost = (system: 'harvester' | 'autopilot') => {
  const tiers = system === 'harvester' ? HARVESTER_TIERS : AUTOPILOT_TIERS
  const current = system === 'harvester' ? gameStats.harvesterTier : gameStats.autopilotTier
  const next = tiers[current]
  return next ? adjustedCost(next.cost, gameStats.difficulty) : undefined
}

/** Buys the next tier of a system if there is one and the player can afford it. */
export function upgrade(system: 'harvester' | 'autopilot') {
  const tiers = system === 'harvester' ? HARVESTER_TIERS : AUTOPILOT_TIERS
  const current = system === 'harvester' ? gameStats.harvesterTier : gameStats.autopilotTier
  const next = tiers[current] // tiers are 1-based in gameStats, so this is the one after the current
  const label = system === 'harvester' ? 'Harvester' : 'Auto-Pilot'
  if (!next) {
    notify(`${label} is already at maximum tier`, 'gain')
    return
  }
  const cost = adjustedCost(next.cost, gameStats.difficulty)
  if (!trySpendScrap(cost)) return
  if (system === 'harvester') gameStats.harvesterTier = current + 1
  else gameStats.autopilotTier = current + 1
  notify(`${label} upgraded: ${next.name}`, 'gain', 2500)
}
