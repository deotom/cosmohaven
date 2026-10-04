import { BASE_CARGO_CAPACITY, CONTRACT_CARGO_FIELD, SCRAP_SELL_VALUE, SURVEY_DATA_SELL_VALUE, gameStats, notify } from './gameState'
import { mulberry32 } from './rng'
import { dockedHasService, dockedStation } from './services'

/** Short jobs posted at a station: bring something from the hold back for more than it would sell for. */
export type ContractKind = 'scrap' | 'survey'
export type Contract = { id: string; kind: ContractKind; amount: number; reward: number; client: string }
export type ContractState = { round: number; completed: number; active: Contract[] }

export const MAX_ACTIVE_CONTRACTS = 3
export const BOARD_SIZE = 3
/** Contracts pay this much more than selling the same cargo on the open market. */
const SCRAP_PREMIUM: [number, number] = [1.4, 1.7]
const SURVEY_PREMIUM = 1.8

const CLIENTS = ['Haven Works', 'Vega Salvage Co.', 'Orbital Guild', 'Kessler & Daughters', 'The Quiet Fleet', 'Mira Station Co-op']

export const CARGO_FIELD = CONTRACT_CARGO_FIELD
export const CONTRACT_LABELS: Record<ContractKind, string> = { scrap: 'Scrap', survey: 'Survey Data' }

const hashString = (text: string) => {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/**
 * The offers a station posts in a given round. Pure: the same station and round always give the same board,
 * so nothing but the round number needs saving. Scrap jobs never ask for more than a stock hold can carry.
 */
export function generateOffers(stationKey: string, round: number): Contract[] {
  const rand = mulberry32(hashString(`${stationKey}#${round}`))
  const offers: Contract[] = []
  for (let i = 0; i < BOARD_SIZE; i++) {
    const kind: ContractKind = rand() < 0.7 ? 'scrap' : 'survey'
    const client = CLIENTS[Math.floor(rand() * CLIENTS.length)]
    if (kind === 'scrap') {
      const amount = 3 + Math.floor(rand() * (BASE_CARGO_CAPACITY - 2)) // 3 .. BASE_CARGO_CAPACITY
      const premium = SCRAP_PREMIUM[0] + rand() * (SCRAP_PREMIUM[1] - SCRAP_PREMIUM[0])
      offers.push({ id: `${stationKey}:${round}:${i}`, kind, amount, reward: Math.round(amount * SCRAP_SELL_VALUE * premium), client })
    } else {
      const amount = rand() < 0.25 ? 2 : 1
      offers.push({ id: `${stationKey}:${round}:${i}`, kind, amount, reward: Math.round(amount * SURVEY_DATA_SELL_VALUE * SURVEY_PREMIUM), client })
    }
  }
  return offers
}

/** The board at the station the ship is docked at: this round's offers that have not been taken. */
export function currentBoard(): Contract[] {
  const station = dockedStation()
  if (!station) return []
  const taken = new Set(gameStats.contracts.active.map((contract) => contract.id))
  return generateOffers(station.name, gameStats.contracts.round).filter((offer) => !taken.has(offer.id))
}

export const contractHave = (contract: Contract) => gameStats.cargo[CARGO_FIELD[contract.kind]]
export const contractReady = (contract: Contract) => contractHave(contract) >= contract.amount

export function acceptContract(id: string): boolean {
  if (!dockedHasService('contracts')) {
    notify('Dock at a station with a contracts board to take work', 'warning')
    return false
  }
  if (gameStats.contracts.active.length >= MAX_ACTIVE_CONTRACTS) {
    notify(`You can hold ${MAX_ACTIVE_CONTRACTS} contracts at a time`, 'warning')
    return false
  }
  const offer = currentBoard().find((contract) => contract.id === id)
  if (!offer) {
    notify('That contract is no longer on the board', 'warning')
    return false
  }
  gameStats.contracts.active.push(offer)
  notify(`Contract accepted: ${offer.amount} ${CONTRACT_LABELS[offer.kind]} for ${offer.reward} HC`, 'gain', 2500)
  return true
}

export function abandonContract(id: string): boolean {
  const index = gameStats.contracts.active.findIndex((contract) => contract.id === id)
  if (index < 0) return false
  gameStats.contracts.active.splice(index, 1)
  notify('Contract abandoned', 'warning', 2000)
  return true
}

/** Hands in the cargo at a contracts board for the reward; a completed job makes the board post new work. */
export function completeContract(id: string): boolean {
  if (!dockedHasService('contracts')) {
    notify('Dock at a station with a contracts board to hand in cargo', 'warning')
    return false
  }
  const contract = gameStats.contracts.active.find((item) => item.id === id)
  if (!contract) return false
  if (!contractReady(contract)) {
    notify(`Need ${contract.amount} ${CONTRACT_LABELS[contract.kind]}, hold has ${contractHave(contract)}`, 'warning')
    return false
  }
  gameStats.cargo[CARGO_FIELD[contract.kind]] -= contract.amount
  gameStats.credits += contract.reward
  gameStats.contracts.active = gameStats.contracts.active.filter((item) => item.id !== id)
  gameStats.contracts.completed += 1
  gameStats.contracts.round += 1
  notify(`Contract complete: +${contract.reward} HC from ${contract.client}`, 'gain', 3000)
  return true
}

export const emptyContracts = (): ContractState => ({ round: 0, completed: 0, active: [] })
