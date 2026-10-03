import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { markOnboardingSeen, readOnboardingStatus } from './onboarding'

describe('onboarding preference', () => {
  let values: Map<string, string>

  beforeEach(() => {
    values = new Map()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('stores whether the tutorial was completed or skipped', () => {
    expect(readOnboardingStatus()).toEqual({ seen: false, error: null })
    expect(markOnboardingSeen()).toBeNull()
    expect(readOnboardingStatus()).toEqual({ seen: true, error: null })
  })
})
