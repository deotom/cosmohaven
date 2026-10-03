import { afterEach, describe, expect, it } from 'vitest'
import { controlHints, flightKeyCodes } from './keymap'
import {
  assignControlCode,
  getControlCode,
  readInputPreferences,
  resetKeyBindings,
  resetInputPreferences,
  restoreInputPreferences,
  setMouseSensitivity,
} from './preferences'

afterEach(() => resetInputPreferences())

describe('input preferences', () => {
  it('updates the keymap, flight keys and HUD hints from one binding', () => {
    assignControlCode('thrustForward', 'KeyZ')

    expect(getControlCode('thrustForward')).toBe('KeyZ')
    expect(flightKeyCodes().has('KeyZ')).toBe(true)
    expect(flightKeyCodes().has('KeyW')).toBe(false)
    expect(controlHints('pilot')).toContain('Z — Thrust forward')
  })

  it('rejects conflicting controls and unsupported keys', () => {
    expect(() => assignControlCode('thrustForward', 'KeyJ')).toThrow('already assigned')
    expect(() => assignControlCode('thrustForward', 'ControlLeft')).toThrow('Choose a letter')
    expect(getControlCode('thrustForward')).toBe('KeyW')
  })

  it('accepts independent controls with the same key in different modes', () => {
    expect(() => assignControlCode('cycleBlock', 'KeyQ')).not.toThrow()
    expect(() => assignControlCode('rollLeft', 'KeyQ')).not.toThrow()
  })

  it('restores valid serialized preferences and rejects invalid collisions', () => {
    restoreInputPreferences({ mouseSensitivity: 1.5, keyMap: { thrustForward: 'KeyZ' } })
    expect(readInputPreferences()).toEqual({ mouseSensitivity: 1.5, keyMap: { thrustForward: 'KeyZ' } })
    expect(() => restoreInputPreferences({ mouseSensitivity: 1, keyMap: { thrustForward: 'KeyJ', fold: 'KeyJ' } })).toThrow('assigned to multiple controls')
  })

  it('bounds mouse sensitivity to the supported range', () => {
    expect(setMouseSensitivity(0.5).mouseSensitivity).toBe(0.5)
    expect(() => setMouseSensitivity(2.1)).toThrow('between 0.25 and 2')
  })

  it('resets keys without changing mouse sensitivity', () => {
    setMouseSensitivity(1.5)
    assignControlCode('thrustForward', 'KeyZ')
    expect(resetKeyBindings()).toEqual({ mouseSensitivity: 1.5, keyMap: {} })
  })
})
