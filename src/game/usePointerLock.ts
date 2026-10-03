import { useEffect, useRef, useState } from 'react'

function requestLock() {
  if (document.pointerLockElement) return
  // Browsers only allow this shortly after a user gesture, and may refuse; that's fine, a click retries
  Promise.resolve(document.body.requestPointerLock()).catch(() => {})
}

/**
 * Captures the mouse while `wanted` is true. Locks when `wanted` turns on (it follows a key press or
 * click, so the browser allows it), re-locks on a click after the user pressed Escape, and releases
 * as soon as `wanted` turns off. Returns whether the pointer is currently locked.
 */
export function usePointerLock(wanted: boolean): boolean {
  const [locked, setLocked] = useState(false)
  const wantedRef = useRef(wanted)

  useEffect(() => {
    const onChange = () => setLocked(document.pointerLockElement !== null)
    // Clicking a HUD button shouldn't also grab the mouse; the button decides what happens next
    const onClick = (e: MouseEvent) => {
      if (wantedRef.current && !(e.target as Element | null)?.closest?.('[role="button"]')) requestLock()
    }
    document.addEventListener('pointerlockchange', onChange)
    document.addEventListener('click', onClick)
    return () => {
      document.removeEventListener('pointerlockchange', onChange)
      document.removeEventListener('click', onClick)
    }
  }, [])

  useEffect(() => {
    wantedRef.current = wanted
    if (wanted) requestLock()
    else if (document.pointerLockElement) document.exitPointerLock()
  }, [wanted])

  return locked
}
