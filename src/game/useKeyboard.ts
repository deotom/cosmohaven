import { useEffect, useRef } from 'react'

/** Keys the browser would otherwise act on (scrolling, etc.) that flight uses. */
const FLIGHT_KEYS = new Set([
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyQ',
  'KeyE',
  'ShiftLeft',
  'ShiftRight',
])

/**
 * Normalises a keyboard event to a `KeyboardEvent.code`-style name. `code` is empty or
 * wrong in some environments (remote desktops, some IMEs and virtual keyboards), so fall
 * back to `key`.
 */
function keyName(e: KeyboardEvent): string {
  if (e.code && e.code !== 'Unidentified') return e.code
  if (e.key === ' ') return 'Space'
  if (e.key === 'Shift') return e.location === 2 ? 'ShiftRight' : 'ShiftLeft'
  if (e.key.length === 1) return `Key${e.key.toUpperCase()}`
  return e.key // 'ArrowUp' and friends are identical in both schemes
}

/**
 * Tracks currently held keys by `KeyboardEvent.code` without causing re-renders.
 * While `captureFlightKeys` is true, flight keys have their browser default action
 * suppressed (no page scrolling); browser shortcuts like Ctrl+W are left alone.
 */
export function useKeyboard(captureFlightKeys: boolean) {
  const keys = useRef(new Set<string>())
  const capture = useRef(captureFlightKeys)

  useEffect(() => {
    capture.current = captureFlightKeys
  }, [captureFlightKeys])

  useEffect(() => {
    const held = keys.current
    const down = (e: KeyboardEvent) => {
      const name = keyName(e)
      if (capture.current && FLIGHT_KEYS.has(name) && !e.ctrlKey && !e.metaKey && !e.altKey) e.preventDefault()
      held.add(name)
    }
    const up = (e: KeyboardEvent) => held.delete(keyName(e))
    // Releasing keys while the window is unfocused would otherwise leave them "stuck"
    const clear = () => held.clear()

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
    }
  }, [])

  return keys
}
