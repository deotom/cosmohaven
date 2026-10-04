import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BOARD_SIZE,
  MAX_ACTIVE_CONTRACTS,
  abandonContract,
  acceptContract,
  completeContract,
  currentBoard,
  generateOffers,
} from './contracts'
import { crewProfile } from './crewProfile'
import { setDock } from './dock'
import {
  BASE_CARGO_CAPACITY,
  SCRAP_SELL_VALUE,
  SURVEY_DATA_SELL_VALUE,
  gameStats,
  getCargoSaleValue,
  getReservedCargo,
  sellCargo,
  tryAddCargo,
} from './gameState'
import { controlHints } from '../input/keymap'
import { createSaveSnapshot, isSavedGame, resetNewGame, restoreSave } from './saveGame'
import { enterSector, homeSector } from './sector'
import { ALL_SERVICES, dockedHasService, stationServices } from './services'

beforeEach(() => {
  enterSector(homeSector())
  resetNewGame({ ...crewProfile, look: { ...crewProfile.look } })
  setDock({ phase: 'docked', stationId: 0 })
  vi.stubGlobal('window', { localStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined } })
})

afterEach(() => {
  vi.unstubAllGlobals()
  setDock({ phase: 'docked', stationId: 0 })
})

describe('station services', () => {
  it('a station that lists no services offers all of them', () => {
    expect(stationServices({})).toEqual(ALL_SERVICES)
    expect(stationServices({ services: ['trade'] })).toEqual(['trade'])
  })

  it('only reports a service while fully docked at a station that has it', () => {
    expect(dockedHasService('contracts')).toBe(true)
    setDock({ phase: 'docking', stationId: 0 })
    expect(dockedHasService('contracts')).toBe(false)
    setDock({ phase: 'free', stationId: 0 })
    expect(dockedHasService('contracts')).toBe(false)
  })
})

describe('contract offers', () => {
  it('are the same for the same station and round, and differ between rounds', () => {
    const a = generateOffers('Haven Drydock', 0)
    expect(generateOffers('Haven Drydock', 0)).toEqual(a)
    expect(generateOffers('Haven Drydock', 1).map((c) => c.id)).not.toEqual(a.map((c) => c.id))
    expect(a).toHaveLength(BOARD_SIZE)
  })

  it('always fit a stock cargo hold and pay more than selling the same cargo', () => {
    for (let round = 0; round < 500; round++) {
      for (const offer of generateOffers('Test Station', round)) {
        const market = offer.kind === 'scrap' ? SCRAP_SELL_VALUE : SURVEY_DATA_SELL_VALUE
        expect(offer.amount).toBeGreaterThanOrEqual(1)
        expect(offer.amount).toBeLessThanOrEqual(offer.kind === 'scrap' ? BASE_CARGO_CAPACITY : 2)
        expect(offer.reward).toBeGreaterThan(offer.amount * market)
        expect(Number.isInteger(offer.reward)).toBe(true)
      }
    }
  })

  it('have unique ids on one board', () => {
    const ids = generateOffers('Haven Drydock', 7).map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('accepting and abandoning', () => {
  it('moves an offer from the board to your contracts', () => {
    const [first] = currentBoard()
    expect(acceptContract(first.id)).toBe(true)
    expect(gameStats.contracts.active).toEqual([first])
    expect(currentBoard().map((c) => c.id)).not.toContain(first.id)
    expect(acceptContract(first.id)).toBe(false) // already taken
  })

  it('stops at the contract limit', () => {
    for (const offer of currentBoard().slice(0, MAX_ACTIVE_CONTRACTS)) expect(acceptContract(offer.id)).toBe(true)
    expect(gameStats.contracts.active).toHaveLength(MAX_ACTIVE_CONTRACTS)
    gameStats.contracts.round += 1
    expect(acceptContract(currentBoard()[0].id)).toBe(false)
    expect(gameStats.contracts.active).toHaveLength(MAX_ACTIVE_CONTRACTS)
  })

  it('cannot take work away from a station', () => {
    const [first] = currentBoard()
    setDock({ phase: 'free', stationId: 0 })
    expect(acceptContract(first.id)).toBe(false)
    expect(gameStats.contracts.active).toHaveLength(0)
  })

  it('abandoning puts the offer back on the board in the same round', () => {
    const [first] = currentBoard()
    acceptContract(first.id)
    expect(abandonContract(first.id)).toBe(true)
    expect(gameStats.contracts.active).toHaveLength(0)
    expect(currentBoard().map((c) => c.id)).toContain(first.id)
    expect(abandonContract(first.id)).toBe(false)
  })
})

describe('completing a contract', () => {
  const takeFirstOf = (kind: 'scrap' | 'survey') => {
    // Step through rounds until the board has the wanted kind; rounds are free to skip in a test
    for (let guard = 0; guard < 50; guard++) {
      const offer = currentBoard().find((c) => c.kind === kind)
      if (offer) {
        acceptContract(offer.id)
        return offer
      }
      gameStats.contracts.round += 1
    }
    throw new Error(`no ${kind} offer found`)
  }

  it('hands in the cargo for the reward and makes the board post new work', () => {
    const offer = takeFirstOf('scrap')
    const wallet = gameStats.credits
    const round = gameStats.contracts.round
    gameStats.cargo.scrap = offer.amount + 2

    expect(completeContract(offer.id)).toBe(true)
    expect(gameStats.cargo.scrap).toBe(2)
    expect(gameStats.credits).toBe(wallet + offer.reward)
    expect(gameStats.contracts.active).toHaveLength(0)
    expect(gameStats.contracts.completed).toBe(1)
    expect(gameStats.contracts.round).toBe(round + 1)
    expect(currentBoard().map((c) => c.id)).not.toContain(offer.id)
  })

  it('survey contracts take survey data, not scrap', () => {
    const offer = takeFirstOf('survey')
    gameStats.cargo.scrap = 8
    expect(completeContract(offer.id)).toBe(false)
    gameStats.cargo.surveyData = offer.amount
    expect(completeContract(offer.id)).toBe(true)
    expect(gameStats.cargo).toMatchObject({ scrap: 8, surveyData: 0 })
  })

  it('changes nothing when the hold is short or the ship is away from the station', () => {
    const offer = takeFirstOf('scrap')
    const wallet = gameStats.credits
    gameStats.cargo.scrap = offer.amount - 1
    expect(completeContract(offer.id)).toBe(false)

    gameStats.cargo.scrap = offer.amount
    setDock({ phase: 'free', stationId: 0 })
    expect(completeContract(offer.id)).toBe(false)

    expect(gameStats.credits).toBe(wallet)
    expect(gameStats.cargo.scrap).toBe(offer.amount)
    expect(gameStats.contracts.active).toHaveLength(1)
  })

  it('ignores an id that is not one of your contracts', () => {
    expect(completeContract('nope')).toBe(false)
    expect(gameStats.contracts.completed).toBe(0)
  })
})

describe('saving contracts', () => {
  it('round-trips active contracts, the round and the completed count', () => {
    const offer = currentBoard()[0]
    acceptContract(offer.id)
    gameStats.contracts.round = 4
    gameStats.contracts.completed = 3
    const save = createSaveSnapshot()
    expect(isSavedGame(save)).toBe(true)

    gameStats.contracts = { round: 0, completed: 0, active: [] }
    restoreSave(save)
    expect(gameStats.contracts).toEqual({ round: 4, completed: 3, active: [offer] })
  })

  it('still loads a save made before contracts existed, with an empty list', () => {
    const save = createSaveSnapshot()
    delete save.game.contracts
    expect(isSavedGame(save)).toBe(true)

    gameStats.contracts = { round: 9, completed: 9, active: [] }
    restoreSave(save)
    expect(gameStats.contracts).toEqual({ round: 0, completed: 0, active: [] })
  })

  it('rejects malformed contract data', () => {
    const base = () => {
      const save = createSaveSnapshot()
      save.game.contracts = { round: 1, completed: 0, active: [{ id: 'a', kind: 'scrap', amount: 3, reward: 90, client: 'X' }] }
      return save
    }
    expect(isSavedGame(base())).toBe(true)

    const negative = base()
    negative.game.contracts!.active[0].amount = -1
    expect(isSavedGame(negative)).toBe(false)

    const unknownKind = base()
    ;(unknownKind.game.contracts!.active[0] as { kind: string }).kind = 'gold'
    expect(isSavedGame(unknownKind)).toBe(false)

    const duplicate = base()
    duplicate.game.contracts!.active.push({ ...duplicate.game.contracts!.active[0] })
    expect(isSavedGame(duplicate)).toBe(false)

    const tooMany = base()
    tooMany.game.contracts!.active = Array.from({ length: MAX_ACTIVE_CONTRACTS + 1 }, (_, i) => ({ id: `id${i}`, kind: 'scrap' as const, amount: 3, reward: 90, client: 'X' }))
    expect(isSavedGame(tooMany)).toBe(false)
  })

  it('a new game starts with no contracts', () => {
    gameStats.contracts = { round: 5, completed: 2, active: currentBoard() }
    resetNewGame({ ...crewProfile, look: { ...crewProfile.look } })
    expect(gameStats.contracts).toEqual({ round: 0, completed: 0, active: [] })
  })
})

describe('cargo held for contracts', () => {
  const takeScrapContract = () => {
    for (let guard = 0; guard < 50; guard++) {
      const offer = currentBoard().find((c) => c.kind === 'scrap')
      if (offer) {
        acceptContract(offer.id)
        return offer
      }
      gameStats.contracts.round += 1
    }
    throw new Error('no scrap offer')
  }

  it('is not sold: the hold keeps what the contract needs', () => {
    const offer = takeScrapContract()
    gameStats.cargo.scrap = offer.amount + 3
    expect(getReservedCargo()).toEqual({ scrap: offer.amount, surveyData: 0 })
    expect(getCargoSaleValue(true)).toBe(3 * SCRAP_SELL_VALUE)

    const wallet = gameStats.credits
    expect(sellCargo(true)).toBe(3 * SCRAP_SELL_VALUE)
    expect(gameStats.cargo.scrap).toBe(offer.amount)
    expect(gameStats.credits).toBe(wallet + 3 * SCRAP_SELL_VALUE)
    expect(completeContract(offer.id)).toBe(true) // still possible afterwards
  })

  it('sells nothing when the whole hold is spoken for', () => {
    const offer = takeScrapContract()
    gameStats.cargo.scrap = offer.amount
    expect(getCargoSaleValue(true)).toBe(0)
    expect(sellCargo(true)).toBe(0)
    expect(gameStats.cargo.scrap).toBe(offer.amount)
  })

  it('without contracts everything sells as before', () => {
    gameStats.cargo.scrap = 4
    gameStats.cargo.surveyData = 1
    expect(getCargoSaleValue(true)).toBe(4 * SCRAP_SELL_VALUE + SURVEY_DATA_SELL_VALUE)
  })

  it('announces the moment the hold covers a contract, once', () => {
    const offer = takeScrapContract()
    gameStats.cargo.scrap = offer.amount - 1
    gameStats.notice = null
    tryAddCargo('scrap')
    expect((gameStats.notice as { text: string } | null)?.text).toContain('Contract ready')
    gameStats.notice = null
    tryAddCargo('scrap') // already covered: no repeat
    expect(gameStats.notice).toBeNull()
  })
})

describe('help key', () => {
  it('is listed for every mode', () => {
    expect(controlHints('pilot')).toContain('? — Show / hide this help')
    expect(controlHints('build')).toContain('? — Show / hide this help')
  })
})
