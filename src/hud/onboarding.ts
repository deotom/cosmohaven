const ONBOARDING_KEY = 'cosmohaven.onboarding-complete.v1'

export function readOnboardingStatus() {
  try {
    return { seen: window.localStorage.getItem(ONBOARDING_KEY) === 'true', error: null }
  } catch (error) {
    console.error('Failed to read onboarding preference', error)
    return { seen: false, error: error instanceof Error ? error.message : 'Failed to read onboarding preference' }
  }
}

export function markOnboardingSeen() {
  try {
    window.localStorage.setItem(ONBOARDING_KEY, 'true')
    return null
  } catch (error) {
    console.error('Failed to save onboarding preference', error)
    return error instanceof Error ? error.message : 'Failed to save onboarding preference'
  }
}
