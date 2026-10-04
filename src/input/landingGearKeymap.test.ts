import { afterEach, expect, it } from 'vitest'
import { KEY_BINDINGS, controlHints, handleGameKey } from './keymap'
import { gearState, retractGear } from '../game/landingGear'
import { setDock } from '../game/dock'
import { gameStats } from '../game/gameState'

afterEach(() => { retractGear(); setDock({ phase: 'docked' }) })
it('reserves G once and uses the shared handler, blocking docked deployment', () => {
  expect(KEY_BINDINGS.filter((b) => b.code === 'KeyG')).toHaveLength(1)
  expect(controlHints('pilot')).toContain('G — Deploy / stow landing gear')
  const context = { started: true, mode: 'pilot' as const, victory: false, setInterior: () => {}, setCameraView: () => {}, setSelectedType: () => {}, toggleHelp: () => {}, toggleOrbitFollow: () => {} }
  const event = { code: 'KeyG', repeat: false, shiftKey: false, target: null } as unknown as KeyboardEvent
  handleGameKey(event, context)
  expect(gearState.target).toBe(false)
  setDock({ phase: 'free' })
  gameStats.autopilot.task = 'nav'
  handleGameKey(event, context)
  expect(gearState.target).toBe(true)
  setDock({ phase: 'docking' })
  expect(gearState.target).toBe(false)
  expect(gearState.progress).toBe(0)
})
